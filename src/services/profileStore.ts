import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { WORKER_URL } from './jobsStore';

async function authHeaders(): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (!u) throw new Error('লগইন প্রয়োজন');
  const token = await u.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// ছবি ও স্বাক্ষর প্রোফাইলে রাখা হয় না, সেগুলো আলাদা ফাইল হিসেবে থাকে
function stripMedia(profile: any): any {
  if (!profile || !profile.data) return profile;
  const { photoDataUrl, signatureDataUrl, ...rest } = profile.data;
  return { ...profile, data: rest, photoUrl: '', signatureUrl: '' };
}

// পুরনো সংরক্ষিত মান নতুন নামে: Bogra -> Bogura, Non Quota -> Not Applicable
export function normalizeProfileData(profile: any): any {
  if (!profile || !profile.data) return profile;
  const d: any = { ...profile.data };
  for (const key of Object.keys(d)) {
    const k = key.toLowerCase();
    if ((k.includes('district') || k.includes('upazila')) && typeof d[key] === 'string') {
      d[key] = d[key].replace(/\bBogra\b/g, 'Bogura');
    }
  }
  if (d.quota === 'Non Quota') d.quota = 'Not Applicable';
  if (!d.depStatus) d.depStatus = 'Not Applicable';
  return { ...profile, data: d };
}

/** নিজের প্রোফাইল (R2 থেকে) */
export async function fetchMyProfile(): Promise<any | null> {
  const res = await fetch(`${WORKER_URL}/profile/me`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`প্রোফাইল লোড ব্যর্থ (HTTP ${res.status})`);
  const data = await res.json();
  if (!data || Object.keys(data).length === 0) return null;
  return normalizeProfileData(data);
}

/** নিজের প্রোফাইল সংরক্ষণ */
export async function saveMyProfile(profile: any): Promise<void> {
  const res = await fetch(`${WORKER_URL}/profile/me`, {
    method: 'PUT',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(stripMedia(profile)),
  });
  if (res.status === 413) throw new Error('সিভি তথ্য অনেক বড়। কিছু তথ্য কমিয়ে আবার চেষ্টা করুন।');
  if (!res.ok) throw new Error(`সিভি সংরক্ষণ ব্যর্থ (HTTP ${res.status})`);
}

/** নিজের প্রোফাইল মুছে ফেলা */
export async function deleteMyProfile(): Promise<void> {
  const res = await fetch(`${WORKER_URL}/profile/me`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`সিভি মুছতে ব্যর্থ (HTTP ${res.status})`);
}

const CHECKED_KEY = (uid: string) => `profile_legacy_checked_${uid}`;

/**
 * নিজের প্রোফাইল পড়া।
 * R2-তে না থাকলে পুরনো Firestore থেকে একবার নিয়ে R2-তে রাখা হয়,
 * তারপর Firestore থেকে পুরনো ডকুমেন্ট মোছা হয়।
 */
export async function fetchMyProfileWithMigration(uid: string): Promise<any | null> {
  const fromR2 = await fetchMyProfile();
  if (fromR2) return fromR2;

  // আগে একবার দেখা হয়েছে এবং Firestore-এ কিছু ছিল না: আর পড়বে না
  try {
    if (localStorage.getItem(CHECKED_KEY(uid))) return null;
  } catch {
    // localStorage না থাকলে চালিয়ে যাও
  }

  try {
    const ref = doc(db, 'profiles', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      try {
        localStorage.setItem(CHECKED_KEY(uid), '1');
      } catch {}
      return null;
    }

    const legacy = stripMedia(snap.data());
    await saveMyProfile(legacy); // আগে R2-তে সেভ
    await deleteDoc(ref); // তারপর Firestore থেকে মোছা (সফল হলে আর পড়া লাগবে না)
    return normalizeProfileData(legacy);
  } catch (err) {
    console.warn('Profile migration skipped:', err);
    return null;
  }
}

/** অ্যাডমিন: যেকোনো প্রার্থীর প্রোফাইল (R2, না থাকলে পুরনো Firestore) */
export async function fetchProfileAsAdmin(uid: string): Promise<any | null> {
  const res = await fetch(`${WORKER_URL}/admin/profile/${encodeURIComponent(uid)}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (res.status === 403) throw new Error('এই তথ্য দেখার অনুমতি নেই');
  if (res.ok) {
    const data = await res.json();
    if (data && Object.keys(data).length > 0) return normalizeProfileData(data);
  }

  try {
    const snap = await getDoc(doc(db, 'profiles', uid));
    return snap.exists() ? normalizeProfileData(snap.data()) : null;
  } catch {
    return null;
  }
}
