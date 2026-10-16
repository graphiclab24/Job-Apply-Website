import { JobApplication, ApplicationStatus } from '../types';
import { auth } from './firebase';
import { WORKER_URL } from './jobsStore';

export interface SubmitApplicationPayload {
  id: string;
  uid: string;
  mobile: string;
  fullName: string;
  jobId: string;
  jobTitle: string;
  postName: string;
  postCount: number;
  district: string;
  educationLevel: string;
  smsNumber: string;
  applyLink?: string;
  deadline?: any;
  fee: {
    applicationFee: number;
    serviceCharge: number;
    total: number;
  };
  payment: {
    method: 'bkash' | 'nagad' | 'rocket';
    senderNumber: string;
    trxId: string;
    amount: number;
    submittedAt: any;
  };
  hasScreenshot?: boolean;
}

/**
 * Submit job application to Server & Google Sheets (0 Firestore Quota used)
 */
export async function submitJobApplication(payload: SubmitApplicationPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/applications/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'আবেদন জমা দিতে সমস্যা হয়েছে' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'সার্ভারে কানেক্ট করা যায়নি' };
  }
}

/**
 * Fetch applications for Admin Portal
 */
export async function fetchApplications(params?: {
  status?: string;
  step?: string;
  search?: string;
}): Promise<JobApplication[]> {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.step) query.set('step', params.step);
    if (params?.search) query.set('search', params.search);

    const res = await fetch(`/api/applications?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.applications) ? data.applications : [];
    }
    return [];
  } catch (err) {
    console.warn('Failed to fetch applications:', err);
    return [];
  }
}

/**
 * Fetch candidate's own applications (D1 থেকে, Firebase ID token দিয়ে)
 * uid প্যারামিটার আর ব্যবহার হয় না: সার্ভার টোকেন থেকে নিজের আবেদন দেয়।
 */
export async function fetchUserApplications(_uid?: string): Promise<JobApplication[]> {
  try {
    const u = auth.currentUser;
    if (!u) return [];
    const token = await u.getIdToken();

    const res = await fetch(`${WORKER_URL}/api/applications/my`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('User applications HTTP error:', res.status);
      return [];
    }
    const data = await res.json();
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    return items.map((item) => ({ ...item, uid: u.uid })) as JobApplication[];
  } catch (err) {
    console.warn('Failed to fetch user applications:', err);
    return [];
  }
}

/**
 * Update Application status (admin action)
 */
export async function updateApplicationStatus(
  appId: string,
  update: {
    status: ApplicationStatus;
    softCopyUrl?: string;
    paidCopyUrl?: string;
    correctionNote?: string;
    rejectReason?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/applications/${encodeURIComponent(appId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });

    const data = await res.json();
    return { success: res.ok && Boolean(data.success), error: data.error };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw-Ol_W6SYXjRGjM-aKgDpVGaNgOlrsIkQM3CVet23eqNA-G_Wa7uqmbbi39vwC2iwC/exec';

/**
 * Get Google Apps Script Webhook config
 */
export async function getAppsScriptConfig(): Promise<{ configured: boolean; webhookUrl: string }> {
  try {
    const res = await fetch('/api/applications/config');
    if (res.ok) {
      const data = await res.json();
      return {
        configured: Boolean(data.webhookUrl || DEFAULT_APPS_SCRIPT_URL),
        webhookUrl: data.webhookUrl || DEFAULT_APPS_SCRIPT_URL,
      };
    }
  } catch {}
  return { configured: true, webhookUrl: DEFAULT_APPS_SCRIPT_URL };
}

/**
 * Save Google Apps Script Webhook config
 */
export async function saveAppsScriptConfig(webhookUrl: string): Promise<boolean> {
  try {
    const res = await fetch('/api/applications/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Test Google Apps Script Webhook
 */
export async function testAppsScriptWebhook(
  webhookUrl?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/applications/test-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Webhook টেস্ট ব্যর্থ হয়েছে' };
    }
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err?.message || 'সার্ভারে কানেক্ট করা যায়নি' };
  }
}

/**
 * Bulk Sync All Existing Applications to Google Sheets
 */
export async function syncApplicationsToGoogleSheets(): Promise<{
  success: boolean;
  count?: number;
  syncedCount?: number;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/admin/applications/sync-sheets', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      if (res.ok) {
        return { success: true, count: 0, message: 'সিঙ্ক সফল হয়েছে।' };
      }
      return { success: false, error: 'সার্ভার থেকে অপ্রত্যাশিত রেসপন্স এসেছে (' + text.slice(0, 80) + ')' };
    }

    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'গুগল শিট সিঙ্ক ব্যর্থ হয়েছে' };
    }
    return {
      success: true,
      count: data.count,
      syncedCount: data.syncedCount,
      message: data.message,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'সার্ভারে কানেক্ট করা যায়নি' };
  }
}
