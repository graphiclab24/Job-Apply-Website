export const R2_BASE = 'https://files.bdjobapply.site';
export const WORKER_URL = 'https://bdjob-worker.masterboom2040.workers.dev';
const TOKEN_KEY = 'admin_worker_token';

const isPublished = (j: any) => j && j.status !== 'draft';

/**
 * জবের তালিকা পড়া।
 * fresh = false (পাবলিক): R2 → same-origin /jobs.json, ড্রাফট বাদ
 * fresh = true (অ্যাডমিন): শুধু R2, ক্যাশ ছাড়া, সব জব (ড্রাফটসহ)
 */
export async function fetchJobsList(fresh = false): Promise<any[]> {
  const sources = fresh
    ? [`${R2_BASE}/jobs.json?t=${Date.now()}`]
    : [`${R2_BASE}/jobs.json`, '/jobs.json'];

  for (const url of sources) {
    try {
      const res = await fetch(url, fresh ? { cache: 'no-store' } : undefined);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) {
        return fresh ? data : data.filter(isPublished);
      }
    } catch {
      // পরের source-এ যাও
    }
  }

  if (fresh) throw new Error('R2 থেকে জবের তালিকা পড়া যায়নি');
  return [];
}

export function getAdminToken(): string {
  let token = sessionStorage.getItem(TOKEN_KEY) || '';
  if (!token) {
    token = window.prompt('অ্যাডমিন টোকেন দিন') || '';
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

const toTime = (v: any) => new Date(v || 0).getTime() || 0;

/** পুরো জবের তালিকা Worker-এ পাঠায় (R2 jobs.json ও feed.json আপডেট হয়) */
async function postAllJobs(all: any[]): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(`${WORKER_URL}/admin/jobs/save`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(all),
  });

  if (res.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    throw new Error('অ্যাডমিন টোকেন ভুল');
  }
  if (!res.ok) {
    throw new Error(`সেভ ব্যর্থ (HTTP ${res.status})`);
  }
}

/**
 * একটি জব যোগ/আপডেট করে সেভ করে।
 * সম্পাদনার সময় পুরনো createdAt বজায় থাকে।
 */
export async function saveJobToWorker(job: Record<string, any>): Promise<void> {
  const current = await fetchJobsList(true);
  const existing = current.find((j) => j.id === job.id);

  const merged = {
    ...(existing || {}),
    ...job,
    createdAt: existing?.createdAt || job.createdAt,
  };

  const all = [merged, ...current.filter((j) => j.id !== job.id)].sort(
    (a, b) => toTime(b.publishedAt) - toTime(a.publishedAt)
  );

  await postAllJobs(all);
}

/** একটি জব মুছে বাকি তালিকা Worker-এ পাঠায় */
export async function deleteJobInWorker(id: string): Promise<void> {
  const current = await fetchJobsList(true);
  const remaining = current.filter((j) => j.id !== id);
  await postAllJobs(remaining);
}

/** পাবলিক JSON ফাইল (যেমন পেমেন্ট সেটিংস) Worker দিয়ে R2-তে লেখা */
export async function putPublicJson(name: string, data: unknown): Promise<void> {
  const token = getAdminToken();
  const res = await fetch(`${WORKER_URL}/admin/public/${name}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (res.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    throw new Error('অ্যাডমিন টোকেন ভুল');
  }
  if (!res.ok) {
    throw new Error(`সংরক্ষণ ব্যর্থ (HTTP ${res.status})`);
  }
}
