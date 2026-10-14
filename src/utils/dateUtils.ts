/**
 * Safe Date Utilities for BDJobApply
 * Bulletproof date parsing and formatting in Bengali with 0 risk of Invalid time value crashes.
 */

export function safeFormatBnDate(rawDate: any, fallback = 'বিজ্ঞপ্তি দেখুন'): string {
  if (!rawDate) return fallback;
  try {
    const d = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
    if (!d || isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString('bn-BD');
  } catch {
    return fallback;
  }
}

export function isJobExpired(rawDeadline: any, now: Date = new Date()): boolean {
  if (!rawDeadline) return false;
  try {
    const d = rawDeadline?.toDate ? rawDeadline.toDate() : new Date(rawDeadline);
    if (!d || isNaN(d.getTime())) return false;
    return d.getTime() < now.getTime();
  } catch {
    return false;
  }
}

export function getDeadlineDiffMs(rawDeadline: any, now: Date = new Date()): number | null {
  if (!rawDeadline) return null;
  try {
    const d = rawDeadline?.toDate ? rawDeadline.toDate() : new Date(rawDeadline);
    if (!d || isNaN(d.getTime())) return null;
    return d.getTime() - now.getTime();
  } catch {
    return null;
  }
}
