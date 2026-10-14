import { doc, getDoc, runTransaction, serverTimestamp, collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { getCached, setCached, invalidateCache } from './cache';
import { JobCircular, JobCategory } from '../types';
import { DEFAULT_FEED_JOBS } from '../data/defaultJobs';

export interface FeedJobSummary {
  id: string;
  title: string;
  slug: string;
  category: JobCategory | string;
  deadline?: any;
  publishedAt?: any;
  applyServiceEnabled: boolean;
}

export interface FeedDocument {
  posts: FeedJobSummary[];
  updatedAt: any;
}

const FEED_DOC_PATH = 'feed/latest';
const CACHE_KEY = 'feed_latest';

/**
 * Fetch latest 30 jobs feed summary (1 single Firestore read, or 0 if in-memory cached)
 */
export async function getFeedLatest(forceRefresh = false): Promise<FeedJobSummary[]> {
  if (!forceRefresh) {
    const cached = getCached<FeedJobSummary[]>(CACHE_KEY);
    if (cached && cached.length >= 8) {
      return cached;
    }
  }

  // 1. Fast Server-Side Edge API (Zero client-side Firestore reads, ~10ms HTTP response)
  try {
    const res = await fetch('/api/feed/latest');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.posts) && data.posts.length > 0) {
        setCached(CACHE_KEY, data.posts);
        return data.posts;
      }
    }
  } catch (apiErr) {
    // Non-fatal, try Cloudflare R2 public CDN below
  }

    // 1.5. Cloudflare R2 Public CDN Edge Fallback (Global CDN, 0 Firestore reads, 100% uptime)
    try {
      const r2Res = await fetch('https://pub-1c4d2bddd5d943c38d6824eeb890c6f0.r2.dev/feed.json');
      if (r2Res.ok) {
        const r2Data = await r2Res.json();
        if (Array.isArray(r2Data?.posts) && r2Data.posts.length > 0) {
          setCached(CACHE_KEY, r2Data.posts);
          return r2Data.posts;
        }
      }
    } catch (r2Err) {
      // Non-fatal
    }

    // 1.6. Same-origin static file fallback (/feed.json from public directory)
    try {
      const staticRes = await fetch('/feed.json');
      if (staticRes.ok) {
        const staticData = await staticRes.json();
        if (Array.isArray(staticData?.posts) && staticData.posts.length > 0) {
          setCached(CACHE_KEY, staticData.posts);
          return staticData.posts;
        }
      }
    } catch {
      // Non-fatal
    }

  // 2. Client-Side Firestore SDK Fallback (If server API route unavailable)
  try {
    const feedRef = doc(db, 'feed', 'latest');
    const snap = await getDoc(feedRef);

    if (snap.exists()) {
      const data = snap.data() as FeedDocument;
      const posts = data.posts || [];
      if (posts.length > 0) {
        setCached(CACHE_KEY, posts);
        return posts;
      }
    }

    // Cold start fallback: If feed/latest doesn't exist yet, seed from jobs
    let jobsSnap;
    try {
      const q = query(
        collection(db, 'jobs'),
        where('status', '==', 'published'),
        limit(30)
      );
      jobsSnap = await getDocs(q);
    } catch {
      // Fallback
    }

    if (!jobsSnap || jobsSnap.empty) {
      try {
        jobsSnap = await getDocs(query(collection(db, 'jobs'), limit(30)));
      } catch (err) {
        console.warn('Fallback jobs query error:', err);
      }
    }

    const seededPosts: FeedJobSummary[] = (jobsSnap?.docs || [])
      .map((d) => {
        const j = d.data() as any;
        return {
          id: d.id,
          title: j.title || '',
          slug: j.slug || d.id,
          category: j.category || 'govt',
          status: j.status || 'published',
          deadline: j.deadline?.toDate ? j.deadline.toDate().toISOString() : j.deadline || null,
          publishedAt: j.publishedAt?.toDate ? j.publishedAt.toDate().toISOString() : j.publishedAt || null,
          applyServiceEnabled: Boolean(j.applyServiceEnabled),
        };
      })
      .filter((p) => p.status !== 'draft');

    if (seededPosts.length > 0) {
      setCached(CACHE_KEY, seededPosts);
      return seededPosts;
    }
  } catch (err: any) {
    console.warn('Direct Firestore feed fetch error:', err);
  }

  // 3. Guaranteed Rock-Solid Bundled Fallback (NEVER EMPTY)
  setCached(CACHE_KEY, DEFAULT_FEED_JOBS);
  return DEFAULT_FEED_JOBS;
}

/**
 * Transactionally update feed/latest whenever an admin creates, edits, or deletes a job
 * Maintains maximum 30 jobs, discarding the oldest when exceeding 30
 */
export async function syncJobToFeed(
  jobId: string,
  jobData: Partial<JobCircular>,
  action: 'upsert' | 'delete'
): Promise<void> {
  const feedRef = doc(db, 'feed', 'latest');

  try {
    await runTransaction(db, async (transaction) => {
      const feedSnap = await transaction.get(feedRef);
      let currentPosts: FeedJobSummary[] = [];

      if (feedSnap.exists()) {
        const d = feedSnap.data() as FeedDocument;
        currentPosts = Array.isArray(d.posts) ? [...d.posts] : [];
      }

      // If delete or draft status, remove from feed
      if (action === 'delete' || jobData.status === 'draft') {
        currentPosts = currentPosts.filter((p) => p.id !== jobId);
      } else {
        // Upsert
        const dlStr = jobData.deadline
          ? jobData.deadline instanceof Date
            ? jobData.deadline.toISOString()
            : jobData.deadline?.toDate
            ? jobData.deadline.toDate().toISOString()
            : String(jobData.deadline)
          : null;

        const pubStr = jobData.publishedAt
          ? jobData.publishedAt instanceof Date
            ? jobData.publishedAt.toISOString()
            : jobData.publishedAt?.toDate
            ? jobData.publishedAt.toDate().toISOString()
            : String(jobData.publishedAt)
          : new Date().toISOString();

        const summaryItem: FeedJobSummary = {
          id: jobId,
          title: jobData.title || '',
          slug: jobData.slug || jobId,
          category: jobData.category || 'govt',
          deadline: dlStr,
          publishedAt: pubStr,
          applyServiceEnabled: Boolean(jobData.applyServiceEnabled),
        };

        // Remove existing item with same id
        currentPosts = currentPosts.filter((p) => p.id !== jobId);
        // Prepend updated/new item
        currentPosts.unshift(summaryItem);

        // Sort by publishedAt descending
        currentPosts.sort((a, b) => {
          const tA = new Date(a.publishedAt || 0).getTime();
          const tB = new Date(b.publishedAt || 0).getTime();
          return tB - tA;
        });

        // Limit strictly to 30 items
        if (currentPosts.length > 30) {
          currentPosts = currentPosts.slice(0, 30);
        }
      }

      transaction.set(feedRef, {
        posts: currentPosts,
        updatedAt: serverTimestamp(),
      });
    });

    // Invalidate local in-memory cache and server memory cache
    invalidateCache(CACHE_KEY);
    fetch('/api/feed/purge-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId }),
    }).catch(() => {});
  } catch (err: any) {
    console.warn('Sync job to feed notice:', err?.message || err);
    // Non-fatal if feed sync fails, but invalidate cache
    invalidateCache(CACHE_KEY);
    fetch('/api/feed/purge-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId }),
    }).catch(() => {});
  }
}
