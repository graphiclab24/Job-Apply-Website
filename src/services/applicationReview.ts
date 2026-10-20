import { auth } from './firebase';
import { WORKER_URL } from './jobsStore';

export type ReviewBody = { action: 'approve' } | { action: 'correction'; note: string };

/**
 * ব্যবহারকারী নিজের আবেদন যাচাই করেন:
 * approve → Payment Now, correction → সংশোধনের নোটসহ Correction
 */
export async function reviewMyApplication(appId: string, body: ReviewBody): Promise<{ success: boolean; error?: string }> {
  try {
    const u = auth.currentUser;
    if (!u) return { success: false, error: 'লগইন প্রয়োজন' };
    const token = await u.getIdToken();

    const res = await fetch(`${WORKER_URL}/api/applications/${encodeURIComponent(appId)}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const msg = await res.text();
      return { success: false, error: msg || `আপডেট ব্যর্থ (HTTP ${res.status})` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'সার্ভারে কানেক্ট করা যায়নি' };
  }
}
