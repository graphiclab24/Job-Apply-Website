import { getCached, setCached } from './cache';
import { JobCategory } from '../types';
import { DEFAULT_FEED_JOBS } from '../data/defaultJobs';
import { R2_BASE } from './jobsStore';

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

const CACHE_KEY = 'feed_latest';

/**
 * হোমপেজের ফিড: R2 feed.json → same-origin /feed.json → bundled fallback
 * Firestore ব্যবহার করা হয় না।
 */
export async function getFeedLatest(forceRefresh = false): Promise<FeedJobSummary[]> {
  if (!forceRefresh) {
    const cached = getCached<FeedJobSummary[]>(CACHE_KEY);
    if (cached && cached.length > 0) return cached;
  }

  const sources = [`${R2_BASE}/feed.json`, '/feed.json'];
  for (const url of sources) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data?.posts) && data.posts.length > 0) {
        setCached(CACHE_KEY, data.posts);
        return data.posts;
      }
    } catch {
      // পরের source-এ যাও
    }
  }

  setCached(CACHE_KEY, DEFAULT_FEED_JOBS);
  return DEFAULT_FEED_JOBS;
}

/**
 * @deprecated Firestore সরানো হয়েছে। feed.json এখন Worker তৈরি করে।
 * পুরনো import ভাঙা না হওয়ার জন্য রাখা হয়েছে।
 */
export async function syncJobToFeed(): Promise<void> {
  return;
}
