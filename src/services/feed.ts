import { doc, getDoc, runTransaction, serverTimestamp, collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { getCached, setCached, invalidateCache } from './cache';
import { JobCircular, JobCategory } from '../types';

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
export async function getFeedLatest(): Promise<FeedJobSummary[]> {
  const cached = getCached<FeedJobSummary[]>(CACHE_KEY);
  if (cached && cached.length > 0) {
    return cached;
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
    // Non-fatal, fallback to client-side Firestore SDK
  }

  // 2. Client-Side Firestore SDK Fallback (If server API route unavailable)
  try {
    const feedRef = doc(db, 'feed', 'latest');
    const snap = await getDoc(feedRef);

    if (snap.exists()) {
      const data = snap.data() as FeedDocument;
      const posts = data.posts || [];
      setCached(CACHE_KEY, posts);
      return posts;
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
    }
    return seededPosts;
  } catch (err: any) {
    if (err?.message?.includes('client is offline')) {
      console.warn('Feed notice: Firestore client initializing or offline.');
    } else {
      console.warn('Feed notice: Unable to fetch live feed, using empty fallback.', err?.message || err);
    }
    return [];
  }
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
