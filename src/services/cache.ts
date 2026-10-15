import { fetchJobsList } from './jobsStore';

/**
 * Superfast Multi-Layer Cache for BD Job Apply
 * 1. In-memory Map (0ms)
 * 2. Persistent localStorage across reloads & sessions (<1ms)
 * 3. Stale-While-Revalidate (SWR) support for instant zero-wait rendering
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cacheStore = new Map<string, CacheEntry<any>>();
export const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes default
const MAX_LOCAL_STORAGE_ITEMS = 80;

function safeLocalStorageGet<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(`cache_${key}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // localStorage unavailable or restricted
  }
  return null;
}

function safeLocalStorageSet<T>(key: string, entry: CacheEntry<T>): void {
  try {
    localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
  } catch (e) {
    // Quota exceeded: prune older cache entries
    try {
      const cacheKeys: { key: string; time: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('cache_')) {
          try {
            const item = JSON.parse(localStorage.getItem(k) || '{}');
            cacheKeys.push({ key: k, time: item.timestamp || 0 });
          } catch {
            cacheKeys.push({ key: k, time: 0 });
          }
        }
      }
      cacheKeys.sort((a, b) => a.time - b.time);
      // Remove oldest 20 entries
      cacheKeys.slice(0, 20).forEach((entry) => localStorage.removeItem(entry.key));
      // Retry set
      localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
    } catch {}
  }
}

/**
 * Standard get: returns data if valid within TTL
 */
export function getCached<T>(key: string, ttlMs: number = DEFAULT_CACHE_TTL_MS): T | null {
  // 1. In-memory map (0ms)
  const mem = cacheStore.get(key);
  if (mem) {
    if (Date.now() - mem.timestamp <= ttlMs) {
      return mem.data as T;
    }
    cacheStore.delete(key);
  }

  // 2. LocalStorage persistence across page loads & tabs (<1ms)
  const ls = safeLocalStorageGet<T>(key);
  if (ls) {
    if (Date.now() - ls.timestamp <= ttlMs) {
      cacheStore.set(key, ls);
      return ls.data;
    }
    try {
      localStorage.removeItem(`cache_${key}`);
    } catch {}
  }

  // 3. Fallback to sessionStorage
  try {
    const raw = sessionStorage.getItem(`cache_${key}`);
    if (raw) {
      const parsed: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() - parsed.timestamp <= ttlMs) {
        cacheStore.set(key, parsed);
        return parsed.data;
      }
      sessionStorage.removeItem(`cache_${key}`);
    }
  } catch {}

  return null;
}

/**
 * Stale-While-Revalidate get:
 * Returns data immediately even if stale, with an isStale flag so the caller
 * can render in 0ms and refresh in background without showing a loading spinner!
 */
export function getCachedWithSWR<T>(
  key: string,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): { data: T | null; isStale: boolean } {
  // Check memory
  const mem = cacheStore.get(key);
  if (mem) {
    const isStale = Date.now() - mem.timestamp > ttlMs;
    return { data: mem.data as T, isStale };
  }

  // Check localStorage
  const ls = safeLocalStorageGet<T>(key);
  if (ls) {
    cacheStore.set(key, ls);
    const isStale = Date.now() - ls.timestamp > ttlMs;
    return { data: ls.data, isStale };
  }

  // Check sessionStorage
  try {
    const raw = sessionStorage.getItem(`cache_${key}`);
    if (raw) {
      const parsed: CacheEntry<T> = JSON.parse(raw);
      cacheStore.set(key, parsed);
      const isStale = Date.now() - parsed.timestamp > ttlMs;
      return { data: parsed.data, isStale };
    }
  } catch {}

  return { data: null, isStale: false };
}

/**
 * Save item into multi-tier cache (RAM + localStorage)
 */
export function setCached<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  cacheStore.set(key, entry);
  safeLocalStorageSet(key, entry);
  try {
    sessionStorage.setItem(`cache_${key}`, JSON.stringify(entry));
  } catch {}
}

/**
 * Pre-cache a job circular object under its slug, id, and alias keys
 * Enables instant zero-wait page navigation when clicking on a job
 */
export function precacheJob(job: any): void {
  if (!job) return;
  if (job.slug) {
    setCached(`job_detail_${job.slug}`, job);
  }
  if (job.id) {
    setCached(`job_detail_${job.id}`, job);
  }
}

const inFlightPrefetches = new Set<string>();

/**
 * Speculatively prefetches the FULL job circular (including HTML content,
 * circular images, application fee, and posts table) into memory and localStorage.
 * Triggered on link hover (desktop) or touch start (mobile), or idle background preloading.
 * Result: Job details page opens in 0ms with zero loading delay!
 *
 * R2 jobs.json থেকে পড়ে (কোনো /api বা Firestore কল নেই)
 */
export async function prefetchJobDetail(slugOrId: string): Promise<void> {
  if (!slugOrId) return;
  const cacheKey = `job_detail_${slugOrId}`;
  const existing = getCached<any>(cacheKey);
  // If already loaded with full content, skip network request
  if (existing && existing.content && existing.content.length > 50) {
    return;
  }
  if (inFlightPrefetches.has(slugOrId)) return;
  inFlightPrefetches.add(slugOrId);

  try {
    const list = await fetchJobsList();
    const fullJob: any = list.find((j: any) => j.slug === slugOrId || j.id === slugOrId);
    if (fullJob && fullJob.title) {
      setCached(`job_detail_${slugOrId}`, fullJob);
      if (fullJob.slug) setCached(`job_detail_${fullJob.slug}`, fullJob);
      if (fullJob.id) setCached(`job_detail_${fullJob.id}`, fullJob);

      // Speculatively preload the image in browser asset cache
      if (fullJob.featuredImage && typeof window !== 'undefined') {
        const img = new Image();
        img.src = fullJob.featuredImage;
      }
    }
  } catch {
    // Speculative failure is non-fatal
  } finally {
    inFlightPrefetches.delete(slugOrId);
  }
}

/**
 * Searches all cached lists (feed_latest, jobs_page_*, admin_jobs) to find
 * a job by slug or ID instantly in 0ms!
 */
export function findJobInAnyCache(slugOrId: string): any | null {
  if (!slugOrId) return null;

  // 1. Direct slug or id cache check
  const direct = getCached<any>(`job_detail_${slugOrId}`);
  if (direct) return direct;

  // Also check SWR for direct (even if expired)
  const swr = getCachedWithSWR<any>(`job_detail_${slugOrId}`);
  if (swr.data) return swr.data;

  // 2. Check feed_latest
  const feed = getCached<any[]>('feed_latest');
  if (Array.isArray(feed)) {
    const match = feed.find((j) => j.slug === slugOrId || j.id === slugOrId);
    if (match) return match;
  }

  // 3. Check jobs pages (1 through 5)
  for (let p = 1; p <= 5; p++) {
    const pageJobs = getCached<any[]>(`jobs_page_${p}`);
    if (Array.isArray(pageJobs)) {
      const match = pageJobs.find((j) => j.slug === slugOrId || j.id === slugOrId);
      if (match) return match;
    }
  }

  // 4. Check admin jobs
  const adminJobs = getCached<any[]>('admin_jobs');
  if (Array.isArray(adminJobs)) {
    const match = adminJobs.find((j) => j.slug === slugOrId || j.id === slugOrId);
    if (match) return match;
  }

  return null;
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cacheStore.clear();
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('cache_')) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith('cache_')) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {}
    return;
  }

  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`cache_${prefix}`)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(`cache_${prefix}`)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}
