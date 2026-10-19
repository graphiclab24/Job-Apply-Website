/**
 * সার্কুলার সাজানো:
 * ১. চলমান (শেষ তারিখ সামনে) — নিকটতম শেষ তারিখ আগে
 * ২. শেষ তারিখ নেই — মাঝখানে
 * ৩. মেয়াদ শেষ — সবার নিচে (সাম্প্রতিক মেয়াদ শেষ আগে)
 */
const toTime = (v: any): number => {
  if (!v) return NaN;
  const d = new Date(v?.toDate ? v.toDate() : v).getTime();
  return isNaN(d) ? NaN : d;
};

export function sortJobsByDeadline<T extends { deadline?: any }>(list: T[]): T[] {
  const now = Date.now();
  const active: T[] = [];
  const none: T[] = [];
  const expired: T[] = [];

  for (const j of list) {
    const d = toTime(j.deadline);
    if (isNaN(d)) none.push(j);
    else if (d >= now) active.push(j);
    else expired.push(j);
  }

  active.sort((a, b) => toTime(a.deadline) - toTime(b.deadline));
  expired.sort((a, b) => toTime(b.deadline) - toTime(a.deadline));

  return [...active, ...none, ...expired];
}
