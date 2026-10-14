/**
 * Recovers any jobs created locally in the user's browser (IndexedDB or LocalStorage)
 * and syncs them to Server & Cloudflare R2 automatically.
 */
export async function recoverLocalJobs(): Promise<number> {
  if (typeof window === 'undefined') return 0;

  let recoveredCount = 0;
  const foundJobs: any[] = [];

  // 1. Scan LocalStorage for any cached admin jobs or drafts
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith('unsaved_job_') || key.startsWith('draft_job_') || key.startsWith('offline_draft_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed)
              ? parsed
              : parsed?.data && Array.isArray(parsed.data)
              ? parsed.data
              : [parsed];

            for (const item of items) {
              if (item && item.title && (item.id || item.slug)) {
                // Filter out known dummy IDs
                const isDummy = isDummyJob(item);
                if (!isDummy && !foundJobs.some((j) => j.id === item.id || j.slug === item.slug)) {
                  foundJobs.push(item);
                }
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  // 2. Scan IndexedDB for Firestore offline cache
  try {
    if (window.indexedDB) {
      const dbs = await window.indexedDB.databases?.().catch(() => []);
      for (const dbInfo of dbs || []) {
        if (dbInfo.name && dbInfo.name.includes('firestore')) {
          try {
            await new Promise<void>((resolve) => {
              const req = window.indexedDB.open(dbInfo.name!);
              req.onsuccess = () => {
                const idb = req.result;
                const storeNames = Array.from(idb.objectStoreNames);
                if (storeNames.includes('remoteDocuments')) {
                  try {
                    const tx = idb.transaction('remoteDocuments', 'readonly');
                    const store = tx.objectStore('remoteDocuments');
                    const getAllReq = store.getAll();
                    getAllReq.onsuccess = () => {
                      const records = getAllReq.result || [];
                      for (const rec of records) {
                        const path = rec?.document?.key?.path?.segments || [];
                        if (path.includes('jobs')) {
                          const docData = rec?.document?.proto?.fields;
                          if (docData) {
                            const jobObj = parseFirestoreProto(docData, path[path.length - 1]);
                            if (jobObj && jobObj.title && !isDummyJob(jobObj)) {
                              if (!foundJobs.some((j) => j.id === jobObj.id || j.slug === jobObj.slug)) {
                                foundJobs.push(jobObj);
                              }
                            }
                          }
                        }
                      }
                      resolve();
                    };
                    getAllReq.onerror = () => resolve();
                  } catch {
                    resolve();
                  }
                } else {
                  resolve();
                }
              };
              req.onerror = () => resolve();
            });
          } catch {}
        }
      }
    }
  } catch {}

  // Upload recovered jobs to server and Cloudflare R2
  for (const job of foundJobs) {
    try {
      const res = await fetch('/api/admin/jobs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
      });
      if (res.ok) {
        recoveredCount++;
      }
    } catch {}
  }

  return recoveredCount;
}

export const DUMMY_IDS = new Set([
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

export function isDummyJob(job: any): boolean {
  if (!job) return true;
  if (DUMMY_IDS.has(job.id) || DUMMY_IDS.has(job.slug)) return true;
  const title = String(job.title || '');
  if (
    title.includes('বেক্সিমকো গ্রুপ') ||
    title.includes('ওয়ালটন হাই-টেক') ||
    title.includes('প্রাণ-আরএফএল') ||
    title.includes('স্কয়ার ফার্মাসিউটিক্যালস') ||
    title.includes('ইনসেপ্টা ফার্মাসিউটিক্যালস') ||
    title.includes('আশা (ASA)') ||
    title.includes('বাংলাদেশ রেলওয়ে') ||
    title.includes('বাংলাদেশ ব্যাংক সহকারী পরিচালক') ||
    title.includes('পল্লী বিদ্যুতায়ন বোর্ড') ||
    title.includes('পরিবার পরিকল্পনা অধিদপ্তর') ||
    title.includes('ব্র্যাক (BRAC) কর্মসূচি সংগঠক')
  ) {
    return true;
  }
  return false;
}

function parseFirestoreProto(fields: any, id: string): any {
  if (!fields) return null;
  const result: any = { id };
  for (const [key, val] of Object.entries<any>(fields)) {
    if (val.stringValue !== undefined) result[key] = val.stringValue;
    else if (val.integerValue !== undefined) result[key] = Number(val.integerValue);
    else if (val.doubleValue !== undefined) result[key] = Number(val.doubleValue);
    else if (val.booleanValue !== undefined) result[key] = val.booleanValue;
    else if (val.timestampValue !== undefined) result[key] = val.timestampValue;
    else if (val.arrayValue?.values) {
      result[key] = val.arrayValue.values.map((v: any) => v.stringValue || v);
    }
  }
  return result;
}
