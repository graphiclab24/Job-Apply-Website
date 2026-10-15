const DB_NAME = 'career-portal-local';
const STORE = 'handles';
const KEY = 'autofill-folder';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle: any): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readHandle(): Promise<any | null> {
  const db = await openDb();
  const handle = await new Promise<any>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

export const isFolderPickerSupported = (): boolean =>
  typeof (window as any).showDirectoryPicker === 'function';

/** আগে সেভ করা ফোল্ডার আছে কি না (অনুমতি না চেয়ে) */
export async function hasSavedFolder(): Promise<boolean> {
  try {
    return (await readHandle()) !== null;
  } catch {
    return false;
  }
}

/** নতুন ফোল্ডার নির্বাচন (ক্লিক দরকার) */
export async function pickAutofillFolder(): Promise<void> {
  const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
  await saveHandle(handle);
}

/**
 * সেভ করা ফোল্ডারের অনুমতি।
 * requestIfNeeded = true হলে শুধু ক্লিকের মধ্যে চাওয়া উচিত।
 */
export async function ensureFolderPermission(requestIfNeeded: boolean): Promise<any | null> {
  try {
    const handle = await readHandle();
    if (!handle) return null;
    const opts = { mode: 'read' };
    if ((await handle.queryPermission(opts)) === 'granted') return handle;
    if (!requestIfNeeded) return null;
    if ((await handle.requestPermission(opts)) === 'granted') return handle;
    return null;
  } catch {
    return null;
  }
}

const NAMES = {
  photo: ['photo.jpg', 'photo.jpeg', 'photo.png', 'photo.webp'],
  signature: ['signature.jpg', 'signature.jpeg', 'signature.png', 'signature.webp'],
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function findFile(dir: any, names: string[]): Promise<any | null> {
  for (const name of names) {
    try {
      return await dir.getFileHandle(name);
    } catch {
      // এই নামে নেই, পরেরটি দেখি
    }
  }
  return null;
}

/**
 * প্রার্থীর মোবাইল নম্বরের ফোল্ডার থেকে ছবি ও স্বাক্ষর (data URL)।
 * কিছু না পেলে খালি অবজেক্ট ফেরত দেয়।
 */
export async function loadLocalMedia(
  mobile: string,
  requestIfNeeded = false
): Promise<{ photo?: string; signature?: string }> {
  const phone = (mobile || '').replace(/\D/g, '');
  if (!phone) return {};

  const root = await ensureFolderPermission(requestIfNeeded);
  if (!root) return {};

  try {
    const dir = await root.getDirectoryHandle(phone);
    const out: { photo?: string; signature?: string } = {};

    const p = await findFile(dir, NAMES.photo);
    if (p) out.photo = await fileToDataUrl(await p.getFile());

    const s = await findFile(dir, NAMES.signature);
    if (s) out.signature = await fileToDataUrl(await s.getFile());

    return out;
  } catch {
    return {};
  }
}
