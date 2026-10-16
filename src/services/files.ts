import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { getCached, setCached, invalidateCache } from './cache';
import { auth, db } from './firebase';
import { WORKER_URL, R2_BASE } from './jobsStore';

export type FileKind = 'photo' | 'signature' | 'screenshot' | 'softcopy' | 'paidcopy' | 'cover';

export interface StoredFileDoc {
  id?: string;
  ownerUid: string;
  kind: FileKind;
  appId?: string;
  mime: string;
  sizeBytes: number;
  data: string; // Base64 dataURL
  createdAt?: any;
}

// Limits in bytes
export const FILE_LIMITS = {
  PHOTO: 100 * 1024,
  SIGNATURE: 60 * 1024,
  SCREENSHOT: 150 * 1024,
  COVER: 100 * 1024,
  PDF_RAW: 650 * 1024,
};

// Fixed ID helper generators
export const getFileId = {
  photo: (uid: string) => `${uid}_photo`,
  signature: (uid: string) => `${uid}_signature`,
  screenshot: (appId: string) => `${appId}_screenshot`,
  softcopy: (appId: string) => `${appId}_soft`,
  paidcopy: (appId: string) => `${appId}_paid`,
  cover: (jobId: string) => `job_${jobId}_cover`,
};

const isCoverId = (id: string) => id.startsWith('job_') && id.endsWith('_cover');

/** Firebase ID token দিয়ে Worker-এ অনুরোধের হেডার */
async function authHeaders(): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (!u) throw new Error('লগইন প্রয়োজন');
  const token = await u.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/** Worker-এ সরাসরি লেখা (ক্যাশ ছাড়া) */
async function putToWorker(id: string, record: StoredFileDoc): Promise<void> {
  const url = record.kind === 'cover' ? `${WORKER_URL}/cover/${id}` : `${WORKER_URL}/file/${id}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('ফাইল সংরক্ষণের অনুমতি নেই। আবার লগইন করুন।');
  }
  if (res.status === 413) {
    throw new Error('ফাইলের সাইজ অনেক বড়। ছোট ছবি দিন।');
  }
  if (!res.ok) {
    throw new Error(`ফাইল সংরক্ষণ ব্যর্থ (HTTP ${res.status})`);
  }
}

/** ফাইল সংরক্ষণ: cover → পাবলিক R2 (অ্যাডমিন), বাকি → প্রাইভেট R2 */
export async function saveFile(payload: {
  id: string;
  ownerUid: string;
  kind: FileKind;
  appId?: string;
  mime: string;
  sizeBytes: number;
  data: string;
}): Promise<void> {
  const record: StoredFileDoc = {
    ownerUid: payload.ownerUid,
    kind: payload.kind,
    mime: payload.mime,
    sizeBytes: payload.sizeBytes,
    data: payload.data,
    ...(payload.appId ? { appId: payload.appId } : {}),
  };
  await putToWorker(payload.id, record);
  setCached(`file_${payload.id}`, { ...record, id: payload.id });
}

/**
 * পুরনো Firestore `files` থেকে একটি ফাইল R2-তে নেওয়া, তারপর Firestore থেকে মোছা।
 * R2-তে লেখা ব্যর্থ হলে Firestore ডকুমেন্ট অক্ষত থাকে, ডেটা হারায় না।
 */
async function migrateFromFirestore(id: string): Promise<StoredFileDoc | null> {
  try {
    const ref = doc(db, 'files', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const legacy = snap.data() as StoredFileDoc;
    const record: StoredFileDoc = {
      ownerUid: legacy.ownerUid,
      kind: legacy.kind,
      mime: legacy.mime,
      sizeBytes: legacy.sizeBytes,
      data: legacy.data,
      ...(legacy.appId ? { appId: legacy.appId } : {}),
    };

    try {
      await putToWorker(id, record); // আগে R2-তে
      await deleteDoc(ref); // তারপর Firestore থেকে মোছা
    } catch (err) {
      // অনুমতি না থাকলে (যেমন সাধারণ ব্যবহারকারী অন্যের ফাইল) শুধু পড়া হবে
      console.warn(`File ${id} migration skipped:`, err);
    }
    return { ...record, id };
  } catch (err) {
    console.warn(`File ${id} legacy read skipped:`, err);
    return null;
  }
}

/**
 * ফাইল পড়া (৫ মিনিট ক্যাশ)।
 * ১. R2 (cover → পাবলিক, বাকি → Worker)
 * ২. না পেলে পুরনো Firestore থেকে একবার, এবং R2-তে স্থানান্তর
 */
export async function getFile(id: string): Promise<StoredFileDoc | null> {
  const cacheKey = `file_${id}`;
  const cached = getCached<StoredFileDoc>(cacheKey);
  if (cached) return cached;

  let found: StoredFileDoc | null = null;

  try {
    if (isCoverId(id)) {
      const res = await fetch(`${R2_BASE}/files/${id}.json`);
      if (res.ok) found = await res.json();
    } else {
      const res = await fetch(`${WORKER_URL}/file/${id}`, { headers: await authHeaders() });
      if (res.ok) {
        found = await res.json();
      } else if (res.status === 403) {
        // অন্যের ফাইল: অনুমতি নেই
        return null;
      }
    }
  } catch (err) {
    console.warn(`File ${id} R2 read warning:`, err);
  }

  if (!found) {
    found = await migrateFromFirestore(id);
  }

  if (!found) return null;
  const withId = { ...found, id };
  setCached(cacheKey, withId);
  return withId;
}

/** ফাইল মোছা (মালিক বা অ্যাডমিন) */
export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`${WORKER_URL}/file/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`ফাইল মুছতে ব্যর্থ (HTTP ${res.status})`);
  }
  // পুরনো Firestore ডকুমেন্ট থাকলে সেটিও মুছে ফেলা
  try {
    await deleteDoc(doc(db, 'files', id));
  } catch {
    // না থাকলে বা অনুমতি না থাকলে সমস্যা নেই
  }
  invalidateCache(`file_${id}`);
}

/** Validate Google Drive / Google Docs URL */
export function isValidDriveUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.hostname === 'drive.google.com' || parsed.hostname === 'docs.google.com';
  } catch {
    return false;
  }
}

/**
 * Read raw file (PDF, etc.) as Base64 Data URL with <=650KB check
 */
export async function readPdfAsDataUrl(file: File): Promise<{ dataUrl: string; sizeBytes: number }> {
  if (file.size > FILE_LIMITS.PDF_RAW) {
    throw new Error('PDF ছোট করুন অথবা Google Drive লিংক দিন');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        dataUrl: reader.result as string,
        sizeBytes: file.size,
      });
    };
    reader.onerror = () => reject(new Error('ফাইল পড়তে ব্যর্থ হয়েছে'));
    reader.readAsDataURL(file);
  });
}

/**
 * Checks browser capability and returns the most advanced supported image format
 * Priority: AVIF -> WebP -> JPEG
 */
export function getOptimalMimeType(): 'image/avif' | 'image/webp' | 'image/jpeg' {
  if (typeof document === 'undefined') return 'image/jpeg';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    if (canvas.toDataURL('image/avif').startsWith('data:image/avif')) {
      return 'image/avif';
    }
    if (canvas.toDataURL('image/webp').startsWith('data:image/webp')) {
      return 'image/webp';
    }
  } catch {}
  return 'image/jpeg';
}

/**
 * Detects whether the client browser supports HTML5 Canvas WebP export.
 * Defaults to 'image/webp' for smaller file sizes.
 */
export function getBestSmartImageMimeType(): 'image/webp' | 'image/jpeg' {
  try {
    if (typeof document !== 'undefined') {
      const elem = document.createElement('canvas');
      if (elem.toDataURL('image/webp').indexOf('data:image/webp') === 0) {
        return 'image/webp';
      }
    }
  } catch {}
  return 'image/jpeg';
}

/**
 * Browser image resize & compress utility using HTML5 Canvas.
 * Produces compact dataURL respecting maxWidth, maxHeight, and maxSizeBytes.
 */
export async function compressImageToDataUrl(
  file: File,
  maxWidth: number,
  maxHeight: number,
  maxSizeBytes: number,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' = getBestSmartImageMimeType()
): Promise<{ dataUrl: string; sizeBytes: number; format: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('ছবি পড়তে ব্যর্থ হয়েছে'));

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Scale to fit within maxWidth / maxHeight
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('ক্যানভাস প্রসেসিং ব্যর্থ হয়েছে'));
        return;
      }

      // Draw with white background for JPEG / WebP transparency fallback
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Iterative quality adjustment to stay under maxSizeBytes
      let quality = 0.9;
      let dataUrl = canvas.toDataURL(mimeType, quality);
      let byteLength = estimateDataUrlBytes(dataUrl);

      while (byteLength > maxSizeBytes && quality > 0.15) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL(mimeType, quality);
        byteLength = estimateDataUrlBytes(dataUrl);
      }

      // If still over limit, downscale dimensions
      if (byteLength > maxSizeBytes) {
        let scale = 0.85;
        while (byteLength > maxSizeBytes && scale >= 0.4) {
          const scaledW = Math.round(width * scale);
          const scaledH = Math.round(height * scale);
          canvas.width = scaledW;
          canvas.height = scaledH;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, scaledW, scaledH);
          ctx.drawImage(img, 0, 0, scaledW, scaledH);
          dataUrl = canvas.toDataURL(mimeType, 0.75);
          byteLength = estimateDataUrlBytes(dataUrl);
          scale -= 0.15;
        }
      }

      if (byteLength > maxSizeBytes) {
        reject(new Error(`ছবির সাইজ সংকুচিত করার পরও অনুমোদিত সীমার বেশি (${Math.round(byteLength / 1024)} KB)`));
        return;
      }

      resolve({
        dataUrl,
        sizeBytes: byteLength,
        format: mimeType,
      });
    };

    img.onerror = () => reject(new Error('ছবি লোড করতে ব্যর্থ হয়েছে'));
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64Str = dataUrl.split(',')[1] || '';
  return Math.round((base64Str.length * 3) / 4);
}

/**
 * Open or download a stored file from dataURL
 */
export async function downloadOrOpenFile(
  fileId: string,
  fallbackFilename: string,
  mode: 'download' | 'open' = 'open'
): Promise<void> {
  const fileDoc = await getFile(fileId);
  if (!fileDoc || !fileDoc.data) {
    throw new Error('ফাইল পাওয়া যায়নি বা মুছে ফেলা হয়েছে');
  }

  // Convert dataURL to Blob for reliable popup/download
  const parts = fileDoc.data.split(',');
  const mime = fileDoc.mime || parts[0]?.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const byteCharacters = atob(parts[1] || '');
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mime });
  const blobUrl = URL.createObjectURL(blob);

  if (mode === 'download') {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fallbackFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } else {
    const w = window.open(blobUrl, '_blank');
    if (!w) {
      // Popup blocked: download হিসেবে fallback
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fallbackFilename;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  }
}
