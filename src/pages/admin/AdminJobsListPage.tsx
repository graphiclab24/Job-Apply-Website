import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCached, setCached, precacheJob, invalidateCache } from '../../services/cache';
import { fetchJobsList, deleteJobInWorker, R2_BASE, WORKER_URL } from '../../services/jobsStore';
import { auth } from '../../services/firebase';
import { JobCircular } from '../../types';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { isDummyJob } from '../../utils/recoverLocalJobs';
import { DEFAULT_JOBS } from '../../data/defaultJobs';
import { safeFormatBnDate } from '../../utils/dateUtils';
import { sortJobsByDeadline } from '../../utils/jobSort';
import { Plus, Edit, Trash2, ExternalLink, Send, Archive, ChevronDown, ChevronRight } from 'lucide-react';

type Tab = 'active' | 'archive';

interface ArchiveEntry {
  id: string;
  slug: string;
  title: string;
  month: string;
  deadline?: string;
}

export const AdminJobsListPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('active');

  // ---------- চলমান ----------
  const [jobs, setJobs] = useState<JobCircular[]>(() => {
    const cached = getCached<JobCircular[]>('admin_jobs') || [];
    const clean = cached.filter((j) => !isDummyJob(j));
    if (clean.length > 0) return sortJobsByDeadline(clean);
    return sortJobsByDeadline(DEFAULT_JOBS.filter((j) => !isDummyJob(j)));
  });
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ---------- আর্কাইব ----------
  const [archiveIndex, setArchiveIndex] = useState<ArchiveEntry[] | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [monthJobs, setMonthJobs] = useState<Record<string, any[]>>({});
  const [monthLoading, setMonthLoading] = useState<Record<string, boolean>>({});
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveDeletingId, setArchiveDeletingId] = useState<string | null>(null);

  const { success, error } = useToast();

  const fetchActive = async () => {
    setLoading(true);
    try {
      const list = await fetchJobsList(true);
      const clean = list.filter((j: any) => !isDummyJob(j)) as JobCircular[];
      const sorted = sortJobsByDeadline(clean);
      setJobs(sorted);
      setCached('admin_jobs', sorted);
      sorted.forEach(precacheJob);
    } catch (err) {
      console.warn('Jobs fetch failed:', err);
      const cached = getCached<JobCircular[]>('admin_jobs');
      if (cached && cached.length > 0) {
        setJobs(sortJobsByDeadline(cached.filter((j) => !isDummyJob(j))));
      }
      error('তালিকা নতুন করে লোড করা যায়নি, সংরক্ষিত তালিকা দেখানো হচ্ছে');
    } finally {
      setLoading(false);
    }
  };

  const fetchArchiveIndex = async () => {
    setArchiveLoading(true);
    try {
      const res = await fetch(`${R2_BASE}/jobs/archive/index.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        setArchiveIndex([]);
        return;
      }
      const data = await res.json();
      setArchiveIndex(Array.isArray(data) ? data : []);
    } catch {
      setArchiveIndex([]);
      error('আর্কাইব সূচক লোড করা যায়নি');
    } finally {
      setArchiveLoading(false);
    }
  };

  // মাসের পুরো তালিকা শুধু প্রথমবার খুললে আনা হয়
  const toggleMonth = async (month: string) => {
    const next = new Set(openMonths);
    if (next.has(month)) {
      next.delete(month);
      setOpenMonths(next);
      return;
    }
    next.add(month);
    setOpenMonths(next);

    if (monthJobs[month]) return;
    setMonthLoading((p) => ({ ...p, [month]: true }));
    try {
      const res = await fetch(`${R2_BASE}/jobs/archive/${month}.json?t=${Date.now()}`, { cache: 'no-store' });
      const data = res.ok ? await res.json() : [];
      setMonthJobs((p) => ({ ...p, [month]: Array.isArray(data) ? data : [] }));
    } catch {
      setMonthJobs((p) => ({ ...p, [month]: [] }));
      error(`${month} মাসের তালিকা লোড করা যায়নি`);
    } finally {
      setMonthLoading((p) => ({ ...p, [month]: false }));
    }
  };

  useEffect(() => {
    fetchActive();
  }, []);

  useEffect(() => {
    if (tab === 'archive' && archiveIndex === null && !archiveLoading) {
      fetchArchiveIndex();
    }
  }, [tab]);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`আপনি কি নিশ্চিত যে "${title}" বিজ্ঞপ্তিটি মুছে ফেলতে চান?`)) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteJobInWorker(id);
      invalidateCache('admin_jobs');
      invalidateCache('feed_');
      invalidateCache('jobs_');
      setJobs((prev) => prev.filter((j) => j.id !== id));
      success('বিজ্ঞপ্তিটি সফলভাবে মুছে ফেলা হয়েছে');
    } catch (err: any) {
      error(err?.message || 'বিজ্ঞপ্তি মুছতে ব্যর্থ হয়েছে');
    } finally {
      setDeletingId(null);
    }
  };

  // আর্কাইবের সার্কুলার মোছা (Worker-এর DELETE রুট)
  const handleArchiveDelete = async (id: string, title: string, month: string) => {
    if (!window.confirm(`আর্কাইব থেকে "${title}" স্থায়ীভাবে মুছে ফেলতে চান?`)) return;

    setArchiveDeletingId(id);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('লগইন প্রয়োজন');
      const token = await u.getIdToken();

      const res = await fetch(`${WORKER_URL}/api/admin/archive/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`মোছা যায়নি (HTTP ${res.status})`);

      setMonthJobs((p) => ({ ...p, [month]: (p[month] || []).filter((j) => j.id !== id) }));
      setArchiveIndex((p) => (p || []).filter((e) => e.id !== id));
      success('আর্কাইব থেকে মুছে ফেলা হয়েছে');
    } catch (err: any) {
      error(err?.message || 'আর্কাইব থেকে মুছতে ব্যর্থ হয়েছে');
    } finally {
      setArchiveDeletingId(null);
    }
  };

  const now = Date.now();
  const isExpiredJob = (j: { deadline?: any }) => {
    const t = j.deadline ? new Date(j.deadline as any).getTime() : NaN;
    return !isNaN(t) && t < now;
  };

  // আর্কাইব: মাস অনুযায়ী গোষ্ঠী, সর্বশেষ মাস আগে
  const archiveGroups = useMemo(() => {
    const term = archiveSearch.trim().toLowerCase();
    const groups = new Map<string, ArchiveEntry[]>();
    for (const e of archiveIndex || []) {
      if (term && !(e.title || '').toLowerCase().includes(term) && !(e.slug || '').toLowerCase().includes(term)) {
        continue;
      }
      if (!groups.has(e.month)) groups.set(e.month, []);
      groups.get(e.month)!.push(e);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [archiveIndex, archiveSearch]);

  const archiveTotal = (archiveIndex || []).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">চাকরির সার্কুলার ব্যবস্থাপনা</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            চলমান সার্কুলার সম্পাদনা করুন। মেয়াদ শেষ সার্কুলার আর্কাইবে থাকে এবং মাস অনুযায়ী দেখা যায়।
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/admin/jobs/new">
            <Button icon={<Plus className="w-4 h-4" />}>নতুন সার্কুলার যোগ করুন</Button>
          </Link>
        </div>
      </div>

      {/* ট্যাব */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('active')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
            tab === 'active'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          চলমান ({jobs.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('archive')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
            tab === 'archive'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>আর্কাইব{archiveIndex ? ` (${archiveTotal})` : ''}</span>
        </button>
      </div>

      {/* ---------- চলমান ট্যাব ---------- */}
      {tab === 'active' &&
        (loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" text="সার্কুলার তালিকা লোড হচ্ছে..." />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="কোনো চলমান সার্কুলার নেই"
            description="এখন কোনো চলমান চাকরির বিজ্ঞপ্তি নেই।"
            action={
              <Link to="/admin/jobs/new">
                <Button size="sm">প্রথম বিজ্ঞপ্তি তৈরি করুন</Button>
              </Link>
            }
          />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                  <tr>
                    <th className="p-3.5">শিরোনাম ও ক্যাটাগরি</th>
                    <th className="p-3.5">স্ট্যাটাস</th>
                    <th className="p-3.5">শেষ তারিখ</th>
                    <th className="p-3.5">অনলাইন সার্ভিস</th>
                    <th className="p-3.5 text-right">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {jobs.map((job) => {
                    const expired = isExpiredJob(job);
                    return (
                      <tr
                        key={job.id}
                        className={`transition-colors ${expired ? 'bg-gray-50/60 text-gray-500' : 'hover:bg-gray-50/70'}`}
                      >
                        <td className="p-3.5 max-w-sm">
                          <span className="font-bold text-gray-900 block line-clamp-1">{job.title}</span>
                          <span className="text-[11px] text-gray-500">
                            {job.category} • পদের সংখ্যা: {job.posts?.length || 0}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                job.status === 'published'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : job.status === 'scheduled'
                                  ? 'bg-sky-50 text-sky-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {job.status === 'published' ? 'Published' : job.status === 'scheduled' ? 'Scheduled' : 'Draft'}
                            </span>
                            {expired && (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-700">
                                মেয়াদ শেষ
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">{safeFormatBnDate(job.deadline, 'নির্ধারিত নয়')}</td>
                        <td className="p-3.5">
                          {job.applyServiceEnabled ? (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <Send className="w-3.5 h-3.5" />
                              <span>চালু (৳{(job.applicationFee || 0) + (job.serviceCharge || 0)})</span>
                            </span>
                          ) : (
                            <span className="text-gray-400">বন্ধ</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={`/jobs/${job.slug || job.id}`}
                              target="_blank"
                              className="p-1.5 text-gray-500 hover:text-emerald-600 rounded-lg hover:bg-gray-100"
                              title="পাবলিক ভিউ"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                            <Link
                              to={`/admin/jobs/edit/${job.id}`}
                              className="p-1.5 text-sky-600 hover:text-sky-800 rounded-lg hover:bg-sky-50"
                              title="এডিট"
                            >
                              <Edit className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => handleDelete(job.id, job.title)}
                              disabled={deletingId === job.id}
                              className="p-1.5 text-rose-600 hover:text-rose-800 rounded-lg hover:bg-rose-50 disabled:opacity-50"
                              title="মুছুন"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {/* ---------- আর্কাইব ট্যাব ---------- */}
      {tab === 'archive' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="text"
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              placeholder="আর্কাইবে শিরোনাম বা স্লাগ দিয়ে খুঁজুন"
              className="flex-1 max-w-md px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
            />
            <p className="text-[11px] text-gray-500">
              মাসের তালিকায় ক্লিক করলে তখন সেই মাসের সার্কুলার আসবে। সম্পাদনায় শেষ তারিখ ভবিষ্যতে দিলে সার্কুলার আবার চলমানে ফিরবে।
            </p>
          </div>

          {archiveLoading || archiveIndex === null ? (
            <div className="py-20 flex justify-center">
              <Spinner size="lg" text="আর্কাইব লোড হচ্ছে..." />
            </div>
          ) : archiveGroups.length === 0 ? (
            <EmptyState title="আর্কাইবে কোনো সার্কুলার নেই" description="মেয়াদ শেষ হওয়া সার্কুলার এখানে জমা হবে।" />
          ) : (
            <div className="space-y-3">
              {archiveGroups.map(([month, entries]) => {
                const open = openMonths.has(month);
                const loadedJobs = monthJobs[month];
                const term = archiveSearch.trim().toLowerCase();
                return (
                  <div key={month} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleMonth(month)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
                    >
                      <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        {month}
                      </span>
                      <span className="text-xs text-gray-500">{entries.length}টি সার্কুলার</span>
                    </button>

                    {open && (
                      <div className="border-t border-gray-100">
                        {monthLoading[month] || !loadedJobs ? (
                          <div className="py-8 flex justify-center">
                            <Spinner size="md" text="মাসের তালিকা লোড হচ্ছে..." />
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-gray-50 text-gray-700 font-semibold">
                                <tr>
                                  <th className="p-3">শিরোনাম</th>
                                  <th className="p-3">শেষ তারিখ</th>
                                  <th className="p-3 text-right">অ্যাকশন</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {loadedJobs
                                  .filter((j: any) => !term || (j.title || '').toLowerCase().includes(term) || (j.slug || '').toLowerCase().includes(term))
                                  .map((j: any) => (
                                    <tr key={j.id} className="text-gray-600">
                                      <td className="p-3 font-semibold text-gray-800 max-w-md">
                                        <span className="line-clamp-1">{j.title}</span>
                                      </td>
                                      <td className="p-3 whitespace-nowrap">{safeFormatBnDate(j.deadline, 'নির্ধারিত নয়')}</td>
                                      <td className="p-3 text-right whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-2">
                                          <Link
                                            to={`/jobs/${j.slug || j.id}`}
                                            target="_blank"
                                            className="p-1.5 text-gray-500 hover:text-emerald-600 rounded-lg hover:bg-gray-100"
                                            title="পাবলিক ভিউ"
                                          >
                                            <ExternalLink className="w-4 h-4" />
                                          </Link>
                                          <Link
                                            to={`/admin/jobs/edit/${j.id}`}
                                            className="p-1.5 text-sky-600 hover:text-sky-800 rounded-lg hover:bg-sky-50"
                                            title="এডিট"
                                          >
                                            <Edit className="w-4 h-4" />
                                          </Link>
                                          <button
                                            type="button"
                                            onClick={() => handleArchiveDelete(j.id, j.title, month)}
                                            disabled={archiveDeletingId === j.id}
                                            className="p-1.5 text-rose-600 hover:text-rose-800 rounded-lg hover:bg-rose-50 disabled:opacity-50"
                                            title="মুছুন"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
