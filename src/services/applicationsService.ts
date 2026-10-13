import { JobApplication, ApplicationStatus } from '../types';

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
      return { success: false, error: data.error || 'আবেদন জমা দিতে সমস্যা হয়েছে' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'সার্ভারে কানেক্ট করা যায়নি' };
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
 * Fetch candidate's own applications
 */
export async function fetchUserApplications(uid: string): Promise<JobApplication[]> {
  if (!uid) return [];
  try {
    const res = await fetch(`/api/applications/my?uid=${encodeURIComponent(uid)}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.applications) ? data.applications : [];
    }
    return [];
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

/**
 * Get Google Apps Script Webhook config
 */
export async function getAppsScriptConfig(): Promise<{ configured: boolean; webhookUrl: string }> {
  try {
    const res = await fetch('/api/applications/config');
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return { configured: false, webhookUrl: '' };
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
