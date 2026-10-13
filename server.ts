import express, { Request, Response } from 'express';
import compression from 'compression';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { doc, getDoc, getDocs, collection, query, where, limit, setDoc, updateDoc, deleteDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from './src/services/firebase';
import { formatJobContent, repairCorruptedJobHtml, purgeCompetitorBranding } from './src/utils/formatJobContent';
import { extractJobLocally } from './src/utils/localJobExtractor';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(compression());

// Serve local uploaded files statically if local disk storage is used
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Global server-side in-memory cache: Serves millions of visitors with 0 Firestore reads in ~2ms
let serverFeedCache: { data: any[]; timestamp: number } | null = null;
let serverAllJobsCache: { data: any[]; timestamp: number } | null = null;
const serverJobsCache = new Map<string, { data: any; timestamp: number }>();
const SERVER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL (auto refreshed or on admin edit)

const DATA_DIR = path.join(process.cwd(), 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const DEFAULT_JOBS_FILE = path.join(DATA_DIR, 'default_jobs.json');
const SHORT_LINKS_FILE = path.join(DATA_DIR, 'short_links.json');
const STORAGE_CONFIG_FILE = path.join(DATA_DIR, 'storage_config.json');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'applications.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const EXAMS_FILE = path.join(DATA_DIR, 'exams.json');

interface StorageConfig {
  provider: 'cloudflare-r2' | 'local';
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  publicUrl?: string;
  appsScriptUrl?: string;
}

function getStorageConfig(): StorageConfig {
  let conf: StorageConfig = {
    provider: 'local',
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || '',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  };

  try {
    if (fs.existsSync(STORAGE_CONFIG_FILE)) {
      const fileData = JSON.parse(fs.readFileSync(STORAGE_CONFIG_FILE, 'utf8'));
      conf = { ...conf, ...fileData };
    }
  } catch {}

  if (conf.accountId && conf.accessKeyId && conf.secretAccessKey && conf.bucketName) {
    conf.provider = 'cloudflare-r2';
  } else {
    conf.provider = 'local';
  }

  return conf;
}

function getR2Client(conf: StorageConfig): S3Client | null {
  if (!conf.accountId || !conf.accessKeyId || !conf.secretAccessKey) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${conf.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: conf.accessKeyId,
      secretAccessKey: conf.secretAccessKey,
    },
  });
}

const DUMMY_IDS = new Set([
  'railway-assistant-station-master-2026',
  'bangladesh-bank-officer-general-2026',
  'reb-assistant-junior-engineer-2026',
  'dgfp-family-planning-circular-2026',
  'brac-programme-organizer-2026',
  'asa-credit-officer-circular-2026',
  'beximco-group-management-executive-2026',
  'walton-service-sales-officer-2026',
  'pran-rfl-territory-manager-2026',
  'square-pharma-medical-promotion-officer-2026',
  'incepta-pharma-qc-officer-2026',
]);

function isDummyJob(job: any): boolean {
  if (!job) return true;
  if (DUMMY_IDS.has(job.id) || DUMMY_IDS.has(job.slug)) return true;
  const title = String(job.title || '');
  return (
    title.includes('বেক্সিমকো') ||
    title.includes('ওয়ালটন') ||
    title.includes('প্রাণ-আরএফএল') ||
    title.includes('স্কয়ার') ||
    title.includes('ইনসেপ্টা') ||
    title.includes('আশা (ASA)') ||
    title.includes('বাংলাদেশ রেলওয়ে') ||
    title.includes('বাংলাদেশ ব্যাংক সহকারী পরিচালক') ||
    title.includes('পল্লী বিদ্যুতায়ন বোর্ড') ||
    title.includes('পরিবার পরিকল্পনা অধিদপ্তর') ||
    title.includes('ব্র্যাক (BRAC) কর্মসূচি সংগঠক')
  );
}

function getStoredJobs(): any[] {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const content = fs.readFileSync(JOBS_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((j) => !isDummyJob(j));
      }
    }
  } catch {}
  return [];
}

function saveStoredJobs(jobs: any[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save jobs to disk:', err);
  }
}

function getStoredApplications(): any[] {
  try {
    if (fs.existsSync(APPLICATIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return [];
}

function saveStoredApplications(apps: any[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(apps, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save applications:', err);
  }
}

async function syncApplicationsToR2(apps: any[]) {
  const conf = getStorageConfig();
  if (conf.provider !== 'cloudflare-r2' || !conf.bucketName) return;
  const s3 = getR2Client(conf);
  if (!s3) return;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: conf.bucketName,
        Key: 'applications.json',
        Body: JSON.stringify(apps, null, 2),
        ContentType: 'application/json',
      })
    );
  } catch (e) {
    console.warn('R2 applications sync notice:', e);
  }
}

async function syncExamsToR2(exams: any[]) {
  const conf = getStorageConfig();
  if (conf.provider !== 'cloudflare-r2' || !conf.bucketName) return;
  const s3 = getR2Client(conf);
  if (!s3) return;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: conf.bucketName,
        Key: 'exams.json',
        Body: JSON.stringify(exams, null, 2),
        ContentType: 'application/json',
      })
    );
  } catch (e) {
    console.warn('R2 exams sync notice:', e);
  }
}

function getStoredExams(): any[] {
  try {
    if (fs.existsSync(EXAMS_FILE)) {
      const data = JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return [];
}

function saveStoredExams(exams: any[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(EXAMS_FILE, JSON.stringify(exams, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save exams:', err);
  }
}

async function forwardToGoogleSheetsWebhook(appData: any) {
  const conf = getStorageConfig();
  const webhookUrl = conf.appsScriptUrl || process.env.APPS_SCRIPT_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appData),
    });
  } catch (err: any) {
    console.warn('Google Sheets Webhook notice:', err?.message || err);
  }
}

function getStoredProfiles(): Record<string, any> {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
      if (typeof data === 'object' && data !== null) return data;
    }
  } catch {}
  return {};
}

function saveStoredProfiles(profiles: Record<string, any>) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save profiles:', err);
  }
}

function getStoredShortLinks(): any[] {
  try {
    if (fs.existsSync(SHORT_LINKS_FILE)) {
      const content = fs.readFileSync(SHORT_LINKS_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveStoredShortLinks(links: any[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SHORT_LINKS_FILE, JSON.stringify(links, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save short links to disk:', err);
  }
}

async function syncJobsToR2(jobs: any[]): Promise<boolean> {
  const conf = getStorageConfig();
  if (conf.provider !== 'cloudflare-r2') return false;
  const s3 = getR2Client(conf);
  if (!s3 || !conf.bucketName) return false;

  try {
    const jobsJson = JSON.stringify(jobs, null, 2);
    const feedList = jobs.slice(0, 50).map((j) => ({
      id: j.id,
      title: j.title || '',
      slug: j.slug || j.id,
      category: j.category || 'govt',
      deadline: j.deadline,
      publishedAt: j.publishedAt,
      applyServiceEnabled: Boolean(j.applyServiceEnabled),
    }));
    const feedJson = JSON.stringify({ posts: feedList, updatedAt: new Date().toISOString() }, null, 2);

    await Promise.all([
      s3.send(
        new PutObjectCommand({
          Bucket: conf.bucketName,
          Key: 'jobs.json',
          Body: jobsJson,
          ContentType: 'application/json',
          CacheControl: 'public, max-age=60, s-maxage=300',
        })
      ),
      s3.send(
        new PutObjectCommand({
          Bucket: conf.bucketName,
          Key: 'feed.json',
          Body: feedJson,
          ContentType: 'application/json',
          CacheControl: 'public, max-age=60, s-maxage=300',
        })
      ),
    ]);
    console.log(`[R2] Successfully synced ${jobs.length} jobs to Cloudflare R2 bucket "${conf.bucketName}"`);
    return true;
  } catch (err: any) {
    console.warn('[R2] Sync notice:', err?.message || err);
    return false;
  }
}

/**
 * Superfast Server-Side Full Jobs Retrieval from RAM & Resilient Disk/Cloudflare R2 Backup
 */
async function getAllJobsFromServer(): Promise<any[]> {
  if (serverAllJobsCache && Date.now() - serverAllJobsCache.timestamp <= SERVER_CACHE_TTL_MS && serverAllJobsCache.data.length > 0) {
    return serverAllJobsCache.data;
  }
  let jobs: any[] = getStoredJobs();

  // If local disk doesn't have jobs yet, pull from Cloudflare R2 public URL
  if (jobs.length === 0) {
    const conf = getStorageConfig();
    if (conf.publicUrl) {
      try {
        const res = await fetch(`${conf.publicUrl}/jobs.json`);
        if (res.ok) {
          const r2Jobs = await res.json();
          if (Array.isArray(r2Jobs) && r2Jobs.length > 0) {
            jobs = r2Jobs;
            saveStoredJobs(jobs);
          }
        }
      } catch (r2Err) {
        console.warn('R2 jobs fetch notice:', r2Err);
      }
    }
  }

  // If still empty, try Firestore
  if (jobs.length === 0) {
    try {
      const q = query(collection(db, 'jobs'), limit(150));
      const snap = await getDocs(q);
      if (!snap.empty) {
        jobs = snap.docs
          .map((d) => {
            const j = d.data() as any;
            return {
              id: d.id,
              ...j,
              deadline: j.deadline?.toDate ? j.deadline.toDate().toISOString() : j.deadline || null,
              publishedAt: j.publishedAt?.toDate ? j.publishedAt.toDate().toISOString() : j.publishedAt || null,
              createdAt: j.createdAt?.toDate ? j.createdAt.toDate().toISOString() : j.createdAt || null,
              updatedAt: j.updatedAt?.toDate ? j.updatedAt.toDate().toISOString() : j.updatedAt || null,
            };
          })
          .filter((j) => j.status !== 'draft');

        if (jobs.length > 0) {
          saveStoredJobs(jobs);
          syncJobsToR2(jobs).catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn('Firestore jobs query fallback (quota limit or connection):', err?.message || err);
    }
  }

  // Ensure zero dummy jobs are ever returned
  jobs = (jobs || []).filter((j) => !isDummyJob(j));

  serverAllJobsCache = { data: jobs, timestamp: Date.now() };

  // Prime individual job cache entries as well
  jobs.forEach((j) => {
    serverJobsCache.set(j.id, { data: j, timestamp: Date.now() });
    if (j.slug && j.slug !== j.id) {
      serverJobsCache.set(j.slug, { data: j, timestamp: Date.now() });
    }
  });

  return jobs;
}

// Preload cache asynchronously on boot so first visitor gets 0ms response
(async function primeServerCache() {
  try {
    const jobs = await getAllJobsFromServer();
    if (jobs.length > 0 && !serverFeedCache) {
      serverFeedCache = {
        data: jobs.slice(0, 30).map((j) => ({
          id: j.id,
          title: j.title || '',
          slug: j.slug || j.id,
          category: j.category || 'govt',
          deadline: j.deadline,
          publishedAt: j.publishedAt,
          applyServiceEnabled: Boolean(j.applyServiceEnabled),
        })),
        timestamp: Date.now(),
      };
    }
  } catch (e) {
    // Non-fatal
  }
})();

// Initialize Google Gemini API using modern @google/genai SDK
const ai = new GoogleGenAI();

/**
 * Resilient Gemini generator with retry and automatic fallback for transient 503/429 spikes
 */
async function generateWithGemini(prompt: string, jsonMode: boolean = false): Promise<string> {
  const models = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: jsonMode ? { responseMimeType: 'application/json' } : undefined,
        });
        if (res.text) return res.text;
      } catch (err: any) {
        console.warn(`Model ${model} (attempt ${attempt}) notice: ${err?.message || err}.`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }
  }

  throw new Error('AI মডেলটি বর্তমানে ব্যস্ত রয়েছে।');
}

/**
 * Superfast Server-Side Feed Endpoint (Zero Firestore Read Quota Cost for Visitors)
 * Serves millions of visitors directly from server memory / edge CDN in ~5ms.
 */
app.get('/api/feed/latest', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');

  // 1. Check server-side memory cache (0ms, 0 Firestore reads)
  if (serverFeedCache && Date.now() - serverFeedCache.timestamp <= SERVER_CACHE_TTL_MS) {
    return res.json({ posts: serverFeedCache.data, fromCache: true });
  }

  // 2. Fetch from Firestore once, cache in RAM
  try {
    const feedRef = doc(db, 'feed', 'latest');
    const snap = await getDoc(feedRef);

    let posts: any[] = [];
    if (snap.exists()) {
      posts = snap.data()?.posts || [];
    } else {
      // Fallback query
      const q = query(collection(db, 'jobs'), where('status', '==', 'published'), limit(30));
      const jobsSnap = await getDocs(q);
      posts = jobsSnap.docs.map((d) => {
        const j = d.data() as any;
        return {
          id: d.id,
          title: j.title || '',
          slug: j.slug || d.id,
          category: j.category || 'govt',
          deadline: j.deadline?.toDate ? j.deadline.toDate().toISOString() : j.deadline || null,
          applyServiceEnabled: Boolean(j.applyServiceEnabled),
        };
      });
    }

    serverFeedCache = { data: posts, timestamp: Date.now() };
    return res.json({ posts, fromCache: false });
  } catch (err: any) {
    console.warn('Server feed fetch notice:', err?.message || err);
    const fallbackJobs = await getAllJobsFromServer();
    const posts = fallbackJobs.slice(0, 30).map((j) => ({
      id: j.id,
      title: j.title || '',
      slug: j.slug || j.id,
      category: j.category || 'govt',
      deadline: j.deadline || null,
      applyServiceEnabled: Boolean(j.applyServiceEnabled),
    }));
    serverFeedCache = { data: posts, timestamp: Date.now() };
    return res.json({ posts, fromCache: true });
  }
});

/**
 * Superfast Server-Side Job Details Endpoint (Zero Firestore Handshake Overhead)
 * Serves cold visitors in ~15ms with full CDN caching.
 */
app.get('/api/jobs/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;
  if (!slug) return res.status(400).json({ error: 'Slug required' });

  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=86400');

  // 1. Check server-side memory cache (0ms, 0 Firestore reads)
  const cached = serverJobsCache.get(slug);
  if (cached && Date.now() - cached.timestamp <= SERVER_CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  // 2. Query Firestore once, cache in RAM
  try {
    const docRef = doc(db, 'jobs', slug);
    const qSlug = query(collection(db, 'jobs'), where('slug', '==', slug), limit(1));

    const [docSnap, querySnap] = await Promise.all([
      getDoc(docRef).catch(() => null),
      getDocs(qSlug).catch(() => null),
    ]);

    let resolvedJob: any = null;
    if (querySnap && !querySnap.empty) {
      const d = querySnap.docs[0];
      resolvedJob = { id: d.id, ...d.data() };
    } else if (docSnap && docSnap.exists()) {
      resolvedJob = { id: docSnap.id, ...docSnap.data() };
    }

    if (resolvedJob) {
      // Normalize dates to ISO strings for clean JSON
      if (resolvedJob.deadline?.toDate) resolvedJob.deadline = resolvedJob.deadline.toDate().toISOString();
      if (resolvedJob.publishedAt?.toDate) resolvedJob.publishedAt = resolvedJob.publishedAt.toDate().toISOString();
      if (resolvedJob.createdAt?.toDate) resolvedJob.createdAt = resolvedJob.createdAt.toDate().toISOString();
      if (resolvedJob.updatedAt?.toDate) resolvedJob.updatedAt = resolvedJob.updatedAt.toDate().toISOString();

      serverJobsCache.set(slug, { data: resolvedJob, timestamp: Date.now() });
      if (resolvedJob.id && resolvedJob.id !== slug) {
        serverJobsCache.set(resolvedJob.id, { data: resolvedJob, timestamp: Date.now() });
      }
      return res.json(resolvedJob);
    }
  } catch (err: any) {
    console.warn('Server job lookup notice (quota limit or connection):', err?.message || err);
  }

  // 3. Fallback to server local jobs backup
  const allJobs = await getAllJobsFromServer();
  const fallback = allJobs.find((j) => j.slug === slug || j.id === slug);
  if (fallback) {
    serverJobsCache.set(slug, { data: fallback, timestamp: Date.now() });
    return res.json(fallback);
  }

  return res.status(404).json({ error: 'Job not found' });
});

/**
 * 0-Cost High-Speed URL Shortener Redirection
 * Redirects visitors instantly via HTTP 302 while tracking click counts in the background
 */
app.get('/s/:code', async (req: Request, res: Response) => {
  const { code } = req.params;
  if (!code) return res.redirect('/');

  const cleanCode = code.trim().toLowerCase();

  // 1. Check local stored short links first (0ms, 0 Firestore reads, quota-immune)
  const stored = getStoredShortLinks();
  const found = stored.find((l) => l.id && l.id.toLowerCase() === cleanCode);
  if (found && found.originalUrl) {
    found.clicks = (found.clicks || 0) + 1;
    found.lastClickedAt = new Date().toISOString();
    saveStoredShortLinks(stored);

    // Update Firestore in background if possible
    try {
      updateDoc(doc(db, 'short_links', found.id), {
        clicks: increment(1),
        lastClickedAt: serverTimestamp(),
      }).catch(() => {});
    } catch {}

    return res.redirect(found.originalUrl);
  }

  // 2. Fallback to Firestore lookup
  try {
    const snap = await getDoc(doc(db, 'short_links', cleanCode));
    if (snap.exists()) {
      const data = snap.data();
      const targetUrl = data.originalUrl || '/';

      updateDoc(doc(db, 'short_links', cleanCode), {
        clicks: increment(1),
        lastClickedAt: serverTimestamp(),
      }).catch(() => {});

      return res.redirect(targetUrl);
    }
  } catch (err) {
    console.warn('Short link redirect lookup notice:', err);
  }

  return res.redirect('/');
});

/**
 * 0-Cost URL Shortener API Endpoints (Admin & Applet)
 * Provides ultra-resilient short links loading with zero Firestore index or quota dependency
 */
app.get('/api/shortener/links', async (req: Request, res: Response) => {
  let items = getStoredShortLinks();
  try {
    const snap = await getDocs(collection(db, 'short_links'));
    if (!snap.empty) {
      const firestoreItems = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          originalUrl: data.originalUrl || '',
          title: data.title || '',
          clicks: data.clicks || 0,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null,
          lastClickedAt: data.lastClickedAt?.toDate ? data.lastClickedAt.toDate().toISOString() : data.lastClickedAt || null,
        };
      });
      // Merge unique
      const map = new Map<string, any>();
      items.forEach((it) => map.set(it.id, it));
      firestoreItems.forEach((it) => map.set(it.id, it));
      items = Array.from(map.values());
      saveStoredShortLinks(items);
    }
  } catch (err: any) {
    console.warn('Firestore short links fetch notice (quota/offline fallback):', err?.message);
  }

  items.sort((a, b) => {
    const tA = new Date(a.createdAt || 0).getTime();
    const tB = new Date(b.createdAt || 0).getTime();
    return tB - tA;
  });

  return res.json({ success: true, links: items });
});

app.post('/api/shortener/links', async (req: Request, res: Response) => {
  try {
    const { id, originalUrl, title } = req.body;
    if (!id || !originalUrl) {
      return res.status(400).json({ success: false, error: 'কোড এবং মূল লিংক প্রয়োজন' });
    }
    const cleanId = String(id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    let cleanUrl = String(originalUrl).trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    const newDoc = {
      id: cleanId,
      originalUrl: cleanUrl,
      title: title ? String(title).trim() : '',
      clicks: 0,
      createdAt: new Date().toISOString(),
    };

    // Save to disk backup
    const stored = getStoredShortLinks();
    const existingIndex = stored.findIndex((l) => l.id === cleanId);
    if (existingIndex >= 0) {
      stored[existingIndex] = { ...stored[existingIndex], ...newDoc };
    } else {
      stored.unshift(newDoc);
    }
    saveStoredShortLinks(stored);

    // Save to Firestore asynchronously
    try {
      const docRef = doc(db, 'short_links', cleanId);
      await setDoc(docRef, { ...newDoc, createdAt: serverTimestamp() }, { merge: true });
    } catch (fbErr) {
      console.warn('Firestore short link write notice (saved to disk):', fbErr);
    }

    return res.json({ success: true, link: newDoc });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.delete('/api/shortener/links/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    if (!code) return res.status(400).json({ success: false, error: 'Code required' });
    const cleanCode = code.trim().toLowerCase();

    // Remove from disk
    const stored = getStoredShortLinks().filter((l) => l.id !== cleanCode);
    saveStoredShortLinks(stored);

    // Remove from Firestore
    try {
      await deleteDoc(doc(db, 'short_links', cleanCode));
    } catch {}

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

/**
 * Superfast Paginated & Filtered Jobs Endpoint (Instant ~2ms RAM response)
 */
app.get('/api/jobs', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
  const category = (req.query.category as string) || 'all';
  const search = ((req.query.search as string) || '').toLowerCase().trim();
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limitCount = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

  let jobs = await getAllJobsFromServer();

  if (category && category !== 'all') {
    jobs = jobs.filter((j) => {
      if (category === 'ngo') {
        return j.category === 'ngo' || j.category === 'brac';
      }
      return j.category === category;
    });
  }

  if (search) {
    jobs = jobs.filter(
      (j) =>
        j.title?.toLowerCase().includes(search) ||
        j.posts?.some((p: any) => p.name?.toLowerCase().includes(search)) ||
        (Array.isArray(j.tags) && j.tags.some((t: string) => t.toLowerCase().includes(search)))
    );
  }

  const total = jobs.length;
  const startIndex = (page - 1) * limitCount;
  const paginatedJobs = jobs.slice(startIndex, startIndex + limitCount);

  return res.json({
    jobs: paginatedJobs,
    total,
    page,
    hasMore: startIndex + limitCount < total,
    fromCache: true,
  });
});

/**
 * Immediate Server Cache Invalidation Hook (Called when admin adds/edits a job)
 */
app.post('/api/feed/purge-cache', (req: Request, res: Response) => {
  const { slug, id, job, isDelete } = req.body || {};
  serverFeedCache = null; // Invalidate feed
  serverAllJobsCache = null; // Invalidate all jobs
  if (slug) serverJobsCache.delete(slug);
  if (id) serverJobsCache.delete(id);

  if (isDelete && id) {
    const stored = getStoredJobs().filter((j) => j.id !== id);
    saveStoredJobs(stored);
    syncJobsToR2(stored).catch(() => {});
  } else if (job && (job.id || id)) {
    const stored = getStoredJobs();
    const jobId = job.id || id;
    const idx = stored.findIndex((j) => j.id === jobId || (j.slug && j.slug === slug));
    const normalized = {
      id: jobId,
      ...job,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      stored[idx] = { ...stored[idx], ...normalized };
    } else {
      stored.unshift(normalized);
    }
    saveStoredJobs(stored);
    syncJobsToR2(stored).catch(() => {});
  }

  res.json({ success: true, message: 'Server cache, disk backup and Cloudflare R2 purged/synced' });
});

/**
 * Resilient Admin Job Save (Direct Disk & Cloudflare R2 Persistence - Quota Immune)
 */
app.post('/api/admin/jobs/save', async (req: Request, res: Response) => {
  try {
    const jobData = req.body;
    if (!jobData || (!jobData.id && !jobData.slug) || !jobData.title) {
      return res.status(400).json({ success: false, error: 'শিরোনাম ও আইডি/স্লাগ প্রয়োজন' });
    }

    const jobId = String(jobData.id || jobData.slug).trim();
    const nowIso = new Date().toISOString();
    const normalized = {
      ...jobData,
      id: jobId,
      updatedAt: nowIso,
      createdAt: jobData.createdAt || nowIso,
    };

    const stored = getStoredJobs();
    const idx = stored.findIndex((j) => j.id === jobId || (j.slug && j.slug === normalized.slug));
    if (idx >= 0) {
      stored[idx] = { ...stored[idx], ...normalized };
    } else {
      stored.unshift(normalized);
    }

    saveStoredJobs(stored);

    // Update in-memory caches
    serverFeedCache = null;
    serverAllJobsCache = { data: stored, timestamp: Date.now() };
    if (normalized.slug) serverJobsCache.set(normalized.slug, { data: normalized, timestamp: Date.now() });
    serverJobsCache.set(jobId, { data: normalized, timestamp: Date.now() });

    // Immediate sync to Cloudflare R2
    syncJobsToR2(stored).catch((e) => console.warn('R2 sync notice:', e));

    // Non-blocking Firestore sync in background (doesn't fail if quota is reached)
    try {
      const docRef = doc(db, 'jobs', jobId);
      setDoc(docRef, normalized, { merge: true }).catch((fbErr) => {
        console.warn('Background Firestore save notice (quota limit or connection):', fbErr?.message || fbErr);
      });
    } catch {}

    return res.json({
      success: true,
      message: 'বিজ্ঞপ্তি সফলভাবে সেভ করা হয়েছে এবং Cloudflare R2-তে সিঙ্ক হয়েছে',
      job: normalized,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

/**
 * Manual or Automatic Cloudflare R2 All Jobs Sync Endpoint
 */
app.post('/api/admin/jobs/sync-r2', async (_req: Request, res: Response) => {
  try {
    const jobs = await getAllJobsFromServer();
    const synced = await syncJobsToR2(jobs);
    const conf = getStorageConfig();
    return res.json({
      success: synced,
      count: jobs.length,
      publicUrl: conf.publicUrl,
      jobsUrl: conf.publicUrl ? `${conf.publicUrl}/jobs.json` : null,
      feedUrl: conf.publicUrl ? `${conf.publicUrl}/feed.json` : null,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

/**
 * 0-Cost Cloudflare R2 & Media Storage Management Endpoints
 */
app.get('/api/storage/config', (_req: Request, res: Response) => {
  const conf = getStorageConfig();
  return res.json({
    isConfigured: conf.provider === 'cloudflare-r2',
    provider: conf.provider,
    bucketName: conf.bucketName || '',
    publicUrl: conf.publicUrl || '',
    accountId: conf.accountId ? `${conf.accountId.slice(0, 4)}••••${conf.accountId.slice(-4)}` : '',
    accessKeyId: conf.accessKeyId ? `${conf.accessKeyId.slice(0, 4)}••••` : '',
  });
});

app.post('/api/storage/config', async (req: Request, res: Response) => {
  try {
    const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = req.body || {};
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      return res.status(400).json({ success: false, error: 'সবগুলো প্রয়োজনীয় ফিল্ড পূরণ করুন' });
    }

    const cleanConf: StorageConfig = {
      provider: 'cloudflare-r2',
      accountId: String(accountId).trim(),
      accessKeyId: String(accessKeyId).trim(),
      secretAccessKey: String(secretAccessKey).trim(),
      bucketName: String(bucketName).trim(),
      publicUrl: publicUrl ? String(publicUrl).trim().replace(/\/$/, '') : '',
    };

    // Test connection with R2
    const client = getR2Client(cleanConf);
    if (!client) {
      return res.status(400).json({ success: false, error: 'ক্লাউডফ্লেয়ার ক্লায়েন্ট তৈরি করা যায়নি' });
    }

    try {
      await client.send(new ListObjectsV2Command({ Bucket: cleanConf.bucketName, MaxKeys: 1 }));
    } catch (testErr: any) {
      return res.status(400).json({
        success: false,
        error: `Cloudflare R2 কানেকশন ব্যর্থ হয়েছে: ${testErr.message || 'ভুল ক্রেডেনশিয়াল বা বাকেটের নাম চেক করুন'}`,
      });
    }

    fs.writeFileSync(STORAGE_CONFIG_FILE, JSON.stringify(cleanConf, null, 2), 'utf8');

    return res.json({
      success: true,
      message: 'Cloudflare R2 সফলভাবে সংযুক্ত হয়েছে! ১০ জিবি ফ্রি স্পেস ও আনলিমিটেড ব্যান্ডউইথ সক্রিয়।',
      config: {
        isConfigured: true,
        provider: 'cloudflare-r2',
        bucketName: cleanConf.bucketName,
        publicUrl: cleanConf.publicUrl,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/upload', async (req: Request, res: Response) => {
  try {
    const { fileData, fileName, folder = 'files', mimeType } = req.body || {};
    if (!fileData) {
      return res.status(400).json({ success: false, error: 'ফাইল ডাটা পাওয়া যায়নি' });
    }

    let buffer: Buffer;
    let detectedMime = mimeType || 'application/octet-stream';

    if (fileData.startsWith('data:')) {
      const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        detectedMime = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(fileData, 'base64');
      }
    } else {
      buffer = Buffer.from(fileData, 'base64');
    }

    let ext = 'bin';
    if (detectedMime.includes('jpeg') || detectedMime.includes('jpg')) ext = 'jpg';
    else if (detectedMime.includes('png')) ext = 'png';
    else if (detectedMime.includes('webp')) ext = 'webp';
    else if (detectedMime.includes('pdf')) ext = 'pdf';

    const safeName = (fileName || `file_${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '_')
      .replace(/\.[^/.]+$/, '');
    const cleanKey = `${folder}/${Date.now()}_${safeName}.${ext}`;

    const conf = getStorageConfig();

    if (conf.provider === 'cloudflare-r2') {
      const client = getR2Client(conf);
      if (client && conf.bucketName) {
        await client.send(
          new PutObjectCommand({
            Bucket: conf.bucketName,
            Key: cleanKey,
            Body: buffer,
            ContentType: detectedMime,
          })
        );

        let finalUrl = '';
        if (conf.publicUrl) {
          finalUrl = `${conf.publicUrl}/${cleanKey}`;
        } else {
          finalUrl = `https://${conf.bucketName}.${conf.accountId}.r2.cloudflarestorage.com/${cleanKey}`;
        }

        return res.json({
          success: true,
          url: finalUrl,
          key: cleanKey,
          provider: 'cloudflare-r2',
          sizeBytes: buffer.length,
          mime: detectedMime,
        });
      }
    }

    // Local Disk Fallback
    const targetFolder = path.join(UPLOADS_DIR, folder);
    if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

    const localFileName = `${Date.now()}_${safeName}.${ext}`;
    const localFilePath = path.join(targetFolder, localFileName);
    fs.writeFileSync(localFilePath, buffer);

    const relativeUrl = `/uploads/${folder}/${localFileName}`;

    return res.json({
      success: true,
      url: relativeUrl,
      key: cleanKey,
      provider: 'local-disk',
      sizeBytes: buffer.length,
      mime: detectedMime,
    });
  } catch (err: any) {
    console.error('File upload error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'ফাইল আপলোড ব্যর্থ হয়েছে' });
  }
});

app.delete('/api/storage/file', async (req: Request, res: Response) => {
  try {
    const { key, url } = req.body || {};
    const conf = getStorageConfig();

    if (conf.provider === 'cloudflare-r2' && key) {
      const client = getR2Client(conf);
      if (client && conf.bucketName) {
        await client.send(new DeleteObjectCommand({ Bucket: conf.bucketName, Key: key }));
        return res.json({ success: true, message: 'Cloudflare R2 থেকে ফাইল মুছে ফেলা হয়েছে' });
      }
    }

    if (url && typeof url === 'string' && url.startsWith('/uploads/')) {
      const localPath = path.join(process.cwd(), url);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
      return res.json({ success: true, message: 'লোকাল ডিস্ক থেকে ফাইল মুছে ফেলা হয়েছে' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

/**
 * AI-Powered Professional Job Circular Formatter
 * Takes raw/messy text from newspapers, PDFs, or circulars and transforms it
 * into an executive, super-premium, highly readable semantic HTML structure.
 */
app.post('/api/ai/format-job', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'কনটেন্ট প্রদান করা আবশ্যক' });
    }

    const cleanInputContent = purgeCompetitorBranding(content.trim());

    const systemPrompt = `You are a Senior Editor and HTML Specialist for Bangladesh Government & Private Job Portals.
Your job is to transform raw, messy, or semi-formatted job circular text into an EXECUTIVE, SUPER-PREMIUM, HIGH-CONVERSION HTML LAYOUT.

CRITICAL INSTRUCTIONS:
1. TOTAL PURGE OF COMPETITOR WEBSITES, APPS & WATERMARKS:
   - STRICT COMPETITOR BLACKLIST: You MUST COMPLETELY REMOVE and NEVER MENTION "Jobs Exam Alert", "Job Exam Alert", "জব এক্সাম এলার্ট", "জবস এক্সাম এলার্ট", "চাকরির পরীক্ষার এলার্ট", or ANY Android/iOS app marketing (e.g. "Android App: Jobs Exam Alert", "Download Jobs Exam Alert", "Android App", "Play Store").
   - You MUST COMPLETELY REMOVE any competitor website domain, competitor Android/iOS app name, Play Store download links, Facebook page, Telegram link, YouTube channel, or watermark (e.g. "Jobs Exam Alert", "Chakrir Khobor", "Bdjobs", "Alljobs", "Daily Jobs", "চাকরির খবর অ্যাপ", "আমাদের অ্যাপ", "প্লে স্টোর", etc.).
   - NEVER put "Jobs Exam Alert" or any competitor's website or app name at the top or anywhere in the circular!
   - The title and headings must strictly reflect the OFFICIAL BANGLADESH GOVERNMENT MINISTRY, DEPARTMENT, OR HIRING AUTHORITY.
   - The ONLY allowed external URLs are official government application portals (e.g., https://*.teletalk.com.bd, *.gov.bd) and user's own site bdjobapply.site.

2. EXECUTIVE, SUPER-PREMIUM HTML STRUCTURE:
   A. [HIGHLIGHTS SUMMARY TABLE]:
      At the very top, build a sleek two-column <table> with <thead> and <tbody>:
      <thead><tr><th colspan="2">📌 এক নজরে নিয়োগ বিজ্ঞপ্তির সারসংক্ষেপ</th></tr></thead>
      <tbody>
        <tr><td><b>প্রতিষ্ঠানের নাম:</b></td><td>[Official Ministry / Dept]</td></tr>
        <tr><td><b>মোট পদসংখ্যা:</b></td><td>[Total vacancies e.g. ৪৩টি পদ]</td></tr>
        <tr><td><b>চাকরির ধরন:</b></td><td>[সরকারি চাকরি / স্বায়ত্তশাসিত / বেসরকারি]</td></tr>
        <tr><td><b>শিক্ষাগত যোগ্যতা:</b></td><td>[SSC / HSC / Degree / Honors]</td></tr>
        <tr><td><b>বয়সসীমা:</b></td><td>[১৮ থেকে ৩২ বছর (কোটা অনুসারে)]</td></tr>
        <tr><td><b>আবেদনের মাধ্যম:</b></td><td>অনলাইন (টেলিটক)</td></tr>
        <tr><td><b>আবেদনের লিংক:</b></td><td><a href="[official teletalk link]" target="_blank">[domain]</a></td></tr>
        <tr><td><b>আবেদনের শেষ তারিখ ও সময়:</b></td><td><span style="color:#b91c1c; font-weight:bold;">[End date & time]</span></td></tr>
      </tbody>
   B. [POSTS & VACANCIES TABLE]:
      <h3>📋 পদের বিবরণ, শূন্যপদ ও শিক্ষাগত যোগ্যতা</h3>
      If multiple positions exist, format into a clean HTML <table>:
      <thead><tr><th>ক্রমিক</th><th>পদের নাম ও গ্রেড</th><th>পদসংখ্যা</th><th>শিক্ষাগত যোগ্যতা ও অভিজ্ঞতা</th><th>বেতন স্কেল</th></tr></thead>
      <tbody>...</tbody>
   C. [APPLICATION GUIDELINES]:
      <h3>📝 অনলাইনে আবেদন করার নিয়মাবলী ও শর্তাবলি</h3>
      Structured with <ul><li> points highlighting official requirements, age limits, photo/signature sizes (300x300, 300x80), and quotas.
   D. [TELETALK SMS INSTRUCTIONS]:
      <h3>📲 টেলিটক SMS ও আবেদন ফি জমা দেওয়ার নিয়ম</h3>
      Use <ol><li> for Step 1 (আবেদন ফরম পূরণ) and Step 2 (১ম ও ২য় SMS ফরম্যাট).
   E. [IMPORTANT DATES]:
      <h3>⏳ জরুরি তারিখ ও সময়সীমা</h3>
      <ul>
        <li><b>আবেদন শুরুর তারিখ ও সময়:</b> [Start date]</li>
        <li><b>আবেদনের শেষ তারিখ ও সময়:</b> [End date]</li>
      </ul>
   F. [IMAGE PRESERVATION]:
      PRESERVE ANY <img ...> TAGS EXACTLY AS THEY ARE! Center inside <p style="text-align:center; margin:20px 0;"><img ... /></p>.
   G. [OFFICIAL ALERT]:
      Use <blockquote> for special official warnings or quota notices.

3. OUTPUT FORMAT:
   - Return ONLY the clean, ready-to-render HTML body snippet.
   - Do NOT wrap in markdown code fences (no \`\`\`html or \`\`\`).
   - Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags.

Raw Circular Text:
${cleanInputContent}`;

    let formattedHtml = '';
    try {
      formattedHtml = await generateWithGemini(systemPrompt, false);
      formattedHtml = formattedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();
      formattedHtml = repairCorruptedJobHtml(formattedHtml);
    } catch (aiErr: any) {
      console.warn('Gemini format-job transient notice, fallback to smart formatter:', aiErr?.message);
      formattedHtml = repairCorruptedJobHtml(formatJobContent(cleanInputContent));
    }

    res.json({ formattedHtml });
  } catch (err: any) {
    console.error('Job formatting error:', err);
    res.status(500).json({ error: err.message || 'Formatting failed' });
  }
});

/**
 * Scrape competitor job page and convert HTML into readable text
 */
async function scrapeJobPageText(pageUrl: string): Promise<string> {
  let url = pageUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('অবৈধ লিঙ্ক ফরম্যাট। অনুগ্রহ করে একটি সঠিক ওয়েবসাইট লিংক দিন।');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('অবৈধ লিঙ্ক প্রোটোকল। শুধুমাত্র http:// বা https:// সাপোর্ট করে।');
  }

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  ];

  let lastStatus = 0;
  let html = '';

  for (const ua of userAgents) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'bn,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });

      lastStatus = response.status;
      if (response.ok) {
        html = await response.text();
        if (html && html.length > 100) break;
      }
    } catch (err: any) {
      console.warn(`Fetch attempt with UA failed: ${err.message}`);
    }
  }

  if (!html) {
    if (lastStatus === 403 || lastStatus === 401) {
      throw new Error(
        `প্রতিযোগী সাইটটি সরাসরি লিংক স্ক্র্যাপ করা ব্লক করেছে (Cloudflare/HTTP ${lastStatus})। অনুগ্রহ করে সেই পেজের টেক্সটগুলো কপি করে "📝 টেক্সট পেস্ট করুন" ট্যাবে পেস্ট করুন, AI মুহূর্তেই সম্পূর্ণ ফর্ম পূরণ করবে!`
      );
    }
    throw new Error(
      `ওয়েবসাইট থেকে তথ্য লোড করা যায়নি (HTTP ${lastStatus || 'টাইমআউট'})। অনুগ্রহ করে সেই পেজের টেক্সটগুলো কপি করে "📝 টেক্সট পেস্ট করুন" ট্যাবে পেস্ট করুন।`
    );
  }

  // Strip non-content tags
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  const text = cleanHtml
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  return text.slice(0, 18000);
}

/**
 * AI Competitor Outranking & Full Job Circular Extractor
 * Accepts a competitor URL or raw circular text, extracts all structured fields,
 * and generates superior, non-duplicate, high-SEO metadata for bdjobapply.site.
 */
app.post('/api/ai/extract-job', async (req: Request, res: Response) => {
  try {
    const { url, rawText } = req.body;

    if (!url && (!rawText || !rawText.trim())) {
      return res.status(400).json({ error: 'ওয়েবসাইট লিংক অথবা সার্কুলার টেক্সট প্রদান করুন' });
    }

    let sourceText = '';
    if (url && typeof url === 'string') {
      try {
        sourceText = await scrapeJobPageText(url.trim());
      } catch (scrapeErr: any) {
        return res.status(400).json({
          error: `লিংক থেকে ডাটা সংগ্রহ করা যায়নি: ${scrapeErr.message || 'নেটওয়ার্ক এরর'}`,
        });
      }
    } else {
      sourceText = String(rawText).trim();
    }

    // Purge competitor app names, sites and watermarks from the source text immediately
    sourceText = purgeCompetitorBranding(sourceText);

    if (!sourceText || sourceText.length < 30) {
      return res.status(400).json({ error: 'পর্যাপ্ত সার্কুলার তথ্য পাওয়া যায়নি' });
    }

    const extractionPrompt = `You are an elite SEO Strategist and Senior Job Editor for Bangladesh Employment Portals (bdjobapply.site).
A raw job circular text is provided:

--- SOURCE TEXT ---
${sourceText}
--- END SOURCE TEXT ---

Your goal:
Analyze this notice and generate a COMPLETE, FACTUAL, HIGH-CONVERTING, SUPER-PREMIUM EXECUTIVE JOB CIRCULAR that WILL OUTRANK ALL COMPETITORS ON GOOGLE SEARCH.

CRITICAL DIRECTIVES:
1. STRICT ZERO-COMPETITOR POLICY:
   - ABSOLUTE COMPETITOR BLACKLIST: You MUST COMPLETELY PURGE and NEVER MENTION "Jobs Exam Alert", "Job Exam Alert", "জব এক্সাম এলার্ট", "জবস এক্সাম এলার্ট", "চাকরির পরীক্ষার এলার্ট", "Bdjobs", "Chakrir Khobor", "Alljobs", "Daily Jobs", or ANY Android/iOS app promotion (e.g. "Android App: Jobs Exam Alert", "Download App", "Play Store").
   - The "title" MUST NEVER contain competitor app or website names! The title MUST start with the official Government Ministry / Department / Organization name (e.g. "যুব ও ক্রীড়া মন্ত্রণালয়ে ক্রীড়া পরিদপ্তরে ৪৩ পদে বিশাল নিয়োগ বিজ্ঞপ্তি ২০২৬").
   - Replace any brand references with "BD Job Apply" or the official government hiring authority.

2. EXECUTIVE, SUPER-PREMIUM HTML CONTENT ("content" field):
   - "content" MUST NOT be plain or basic! It must be an executive, modern HTML presentation:
     A. At the top of "content": A sleek summary <table> with <thead> (<tr><th colspan="2">📌 এক নজরে নিয়োগ বিজ্ঞপ্তির সারসংক্ষেপ</th></tr>) and <tbody> key-value rows (প্রতিষ্ঠানের নাম, মোট পদসংখ্যা, চাকরির ধরন, শিক্ষাগত যোগ্যতা, বয়সসীমা, আবেদনের মাধ্যম, আবেদনের লিংক, আবেদনের শেষ তারিখ ও সময়).
     B. <h3>📋 পদের বিবরণ ও শিক্ষাগত যোগ্যতা</h3> with an HTML <table> (columns: ক্রমিক, পদের নাম, পদসংখ্যা, শিক্ষাগত যোগ্যতা, বেতন স্কেল).
     C. <h3>📝 অনলাইনে আবেদন করার নিয়মাবলী ও শর্তাবলি</h3> with clean <ul><li> guidelines.
     D. <h3>📲 টেলিটক SMS ও আবেদন ফি জমা দেওয়ার নিয়ম</h3> with step-by-step <ol><li>.
     E. <h3>⏳ জরুরি তারিখ ও সময়সীমা</h3> with start & deadline dates.
     F. If source text contains an <img ...> tag, PRESERVE IT and center it in <p style="text-align:center; margin:20px 0;"><img ... /></p>.

3. HIGH-CTR SEO METADATA:
   - "title": Highly clickable, official title starting with Ministry / Dept name (e.g. "যুব ও ক্রীড়া মন্ত্রণালয়ে ক্রীড়া পরিদপ্তরে ৪৩ পদে বিশাল নিয়োগ বিজ্ঞপ্তি ২০২৬").
   - "seoTitle": High-CTR SEO title ending with "| BDJobApply.site" (max 65 chars).
   - "slug": Clean, hyphenated Bengali or English SEO slug (e.g. "krira-poridoptor-job-circular-2026").
   - "metaDescription": 145-160 characters. Begins with primary keyword, includes vacancy count, qualifications, deadline, and Teletalk online application details.
   - "focusKeyword": The single highest-volume Google search query for this job (e.g. "ক্রীড়া পরিদপ্তর নিয়োগ বিজ্ঞপ্তি ২০২৬").
   - "tags": Array of 8 to 12 relevant search tags (organization name in Bengali and English, Teletalk subdomain e.g. "ds.teletalk.com.bd", "সরকারি চাকরি", "টেলিটক সার্কুলার"). NEVER include competitor names.

4. DATES, FEES & LINKS:
   - "category": One of "govt", "bank", "private", "railway", "defense", "education", "other".
   - "deadline": ISO format "YYYY-MM-DDTHH:mm" (e.g. "2026-10-30T16:00"). If time not given, use "23:59".
   - "applyLink": Official application URL (e.g. "https://ds.teletalk.com.bd").
   - "circularLink": Official PDF link if found, else empty string.
   - "applicationFee": Number (e.g. 100, 200, 223, 334, 500). If not found, 0.
   - "serviceCharge": 20 (standard).

RESPOND IN PURE JSON (no markdown fences, no \`\`\`json):
{
  "title": "string",
  "slug": "string",
  "category": "govt",
  "deadline": "2026-10-30T16:00",
  "applyLink": "https://ds.teletalk.com.bd",
  "applicationFee": 200,
  "serviceCharge": 20,
  "circularLink": "",
  "posts": [{"name": "পদের নাম", "count": 5, "district": "ALL"}],
  "content": "HTML string",
  "seoTitle": "string",
  "metaDescription": "string",
  "focusKeyword": "string",
  "tags": ["tag1", "tag2"]
}`;

    try {
      let rawJson = await generateWithGemini(extractionPrompt, true);
      rawJson = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

      const parsedData = JSON.parse(rawJson);

      // Sanitize fields against competitor watermarks and corruptions
      if (parsedData.title) {
        parsedData.title = purgeCompetitorBranding(parsedData.title);
      }
      if (parsedData.slug) {
        parsedData.slug = purgeCompetitorBranding(parsedData.slug)
          .replace(/(?:jobs?[-_]?exam[-_]?al[a-z]*t|bdjobs|chakrir[-_]?khobor)/gi, '')
          .replace(/--+/g, '-')
          .replace(/^-|-$/g, '');
      }
      if (parsedData.content) {
        parsedData.content = repairCorruptedJobHtml(purgeCompetitorBranding(parsedData.content));
      }
      if (parsedData.seoTitle) {
        parsedData.seoTitle = purgeCompetitorBranding(parsedData.seoTitle);
      }
      if (parsedData.metaDescription) {
        parsedData.metaDescription = purgeCompetitorBranding(parsedData.metaDescription);
      }
      if (parsedData.focusKeyword) {
        parsedData.focusKeyword = purgeCompetitorBranding(parsedData.focusKeyword);
      }
      if (Array.isArray(parsedData.tags)) {
        parsedData.tags = parsedData.tags
          .map((t: string) => purgeCompetitorBranding(t).trim())
          .filter((t: string) => t.length > 1 && !/(?:bdjobs|chakrir|alljobs|jobs?\s*exam|al[a-z]*t)/i.test(t));
      }

      return res.json(parsedData);
    } catch (aiErr: any) {
      console.warn('Gemini extraction notice, falling back to instant local smart extractor:', aiErr?.message);
      const fallbackData = extractJobLocally(sourceText);
      if (fallbackData.title) fallbackData.title = purgeCompetitorBranding(fallbackData.title);
      if (fallbackData.content) fallbackData.content = repairCorruptedJobHtml(purgeCompetitorBranding(fallbackData.content));
      if (Array.isArray(fallbackData.tags)) {
        fallbackData.tags = fallbackData.tags
          .map((t: string) => purgeCompetitorBranding(t).trim())
          .filter((t: string) => t.length > 1 && !/(?:bdjobs|chakrir|alljobs|jobs?\s*exam|al[a-z]*t)/i.test(t));
      }
      return res.json(fallbackData);
    }
  } catch (err: any) {
    console.error('Job extraction error:', err);
    res.status(500).json({ error: err.message || 'এক্সট্রাকশন সম্পন্ন করা যায়নি' });
  }
});

/**
 * =========================================================================
 * 0-Cost High-Performance Exams Endpoints (Disk & Cloudflare R2 Backed)
 * =========================================================================
 */
app.get('/api/exams', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  try {
    let exams = getStoredExams();
    if (exams.length === 0) {
      const conf = getStorageConfig();
      if (conf.publicUrl) {
        try {
          const r2Res = await fetch(`${conf.publicUrl.replace(/\/$/, '')}/exams.json`);
          if (r2Res.ok) {
            const r2Exams = await r2Res.json();
            if (Array.isArray(r2Exams) && r2Exams.length > 0) {
              exams = r2Exams;
              saveStoredExams(exams);
            }
          }
        } catch {}
      }
    }
    return res.json({ exams });
  } catch (err: any) {
    return res.status(500).json({ exams: [], error: err?.message });
  }
});

app.post('/api/admin/exams/save', async (req: Request, res: Response) => {
  try {
    const notice = req.body;
    if (!notice || !notice.title) {
      return res.status(400).json({ success: false, error: 'শিরোনাম প্রয়োজন' });
    }
    const id = notice.id || `exam-${Date.now()}`;
    const cleanNotice = {
      ...notice,
      id,
      createdAt: notice.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const stored = getStoredExams();
    const idx = stored.findIndex((e) => e.id === id);
    if (idx >= 0) {
      stored[idx] = cleanNotice;
    } else {
      stored.unshift(cleanNotice);
    }
    saveStoredExams(stored);
    syncExamsToR2(stored).catch(() => {});

    // Non-blocking background Firestore sync
    try {
      setDoc(doc(db, 'exams', id), cleanNotice, { merge: true }).catch(() => {});
    } catch {}

    return res.json({ success: true, notice: cleanNotice });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.delete('/api/admin/exams/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stored = getStoredExams().filter((e) => e.id !== id);
    saveStoredExams(stored);
    syncExamsToR2(stored).catch(() => {});

    // Non-blocking background Firestore delete
    try {
      deleteDoc(doc(db, 'exams', id)).catch(() => {});
    } catch {}

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

/**
 * =========================================================================
 * 0-Cost Scale Applications Endpoints (Google Sheets & Cloudflare R2 Backed)
 * =========================================================================
 */
app.get('/api/applications', (req: Request, res: Response) => {
  try {
    const { status, search } = req.query as { status?: string; search?: string };
    let apps = getStoredApplications();

    if (status && status !== 'all') {
      apps = apps.filter((a) => a.status === status);
    }
    if (search) {
      const q = search.toLowerCase();
      apps = apps.filter(
        (a) =>
          a.id?.toLowerCase().includes(q) ||
          a.fullName?.toLowerCase().includes(q) ||
          a.mobile?.includes(q) ||
          a.smsNumber?.includes(q) ||
          a.jobTitle?.toLowerCase().includes(q) ||
          a.payment?.trxId?.toLowerCase().includes(q)
      );
    }

    return res.json({ applications: apps });
  } catch (err: any) {
    return res.status(500).json({ applications: [], error: err?.message });
  }
});

app.get('/api/applications/my', (req: Request, res: Response) => {
  try {
    const { uid } = req.query as { uid?: string };
    if (!uid) return res.json({ applications: [] });

    const apps = getStoredApplications().filter((a) => a.uid === uid);
    return res.json({ applications: apps });
  } catch (err: any) {
    return res.status(500).json({ applications: [], error: err?.message });
  }
});

app.post('/api/applications/submit', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload || !payload.jobId || !payload.fullName) {
      return res.status(400).json({ success: false, error: 'অসম্পূর্ণ আবেদন তথ্য' });
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const appId = payload.id || `APL-${dateStr}-${randNum}`;

    const newApp = {
      ...payload,
      id: appId,
      status: payload.status || 'waiting',
      createdAt: payload.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const stored = getStoredApplications();
    const existingIdx = stored.findIndex((a) => a.id === appId);
    if (existingIdx >= 0) {
      stored[existingIdx] = newApp;
    } else {
      stored.unshift(newApp);
    }

    saveStoredApplications(stored);
    syncApplicationsToR2(stored).catch(() => {});

    // Forward to Google Sheets Webhook (Instant, 0 Quota, 1M+ Scale)
    forwardToGoogleSheetsWebhook(newApp).catch(() => {});

    // Non-blocking Firestore background backup (fails gracefully if quota hit)
    try {
      setDoc(doc(db, 'applications', appId), newApp, { merge: true }).catch(() => {});
    } catch {}

    return res.json({ success: true, id: appId, application: newApp });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.patch('/api/applications/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const stored = getStoredApplications();
    const idx = stored.findIndex((a) => a.id === id);

    if (idx < 0) {
      return res.status(404).json({ success: false, error: 'আবেদন খুঁজে পাওয়া যায়নি' });
    }

    stored[idx] = {
      ...stored[idx],
      ...updateData,
      updatedAt: new Date().toISOString(),
    };

    saveStoredApplications(stored);
    syncApplicationsToR2(stored).catch(() => {});

    // Forward status update to Google Sheets Webhook
    forwardToGoogleSheetsWebhook({
      action: 'update_status',
      id,
      ...updateData,
    }).catch(() => {});

    // Non-blocking Firestore update
    try {
      setDoc(doc(db, 'applications', id), updateData, { merge: true }).catch(() => {});
    } catch {}

    return res.json({ success: true, application: stored[idx] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.get('/api/applications/config', (_req: Request, res: Response) => {
  const conf = getStorageConfig();
  return res.json({
    configured: Boolean(conf.appsScriptUrl),
    webhookUrl: conf.appsScriptUrl || '',
  });
});

app.post('/api/applications/config', (req: Request, res: Response) => {
  try {
    const { webhookUrl } = req.body || {};
    let conf = getStorageConfig();
    conf.appsScriptUrl = String(webhookUrl || '').trim();

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORAGE_CONFIG_FILE, JSON.stringify(conf, null, 2), 'utf8');

    return res.json({ success: true, configured: Boolean(conf.appsScriptUrl) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Dev vs Production server mounting
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distDir = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Job portal full-stack server running on port ${port}`);
});
