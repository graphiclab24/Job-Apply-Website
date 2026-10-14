import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteFile, getFileId } from '../../services/files';
import { syncJobToFeed } from '../../services/feed';
import { getCached, setCached, precacheJob, invalidateCache } from '../../services/cache';
import { JobCircular } from '../../types';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { recoverLocalJobs, isDummyJob } from '../../utils/recoverLocalJobs';
import { Plus, Edit, Trash2, ExternalLink, Calendar, Send, CloudUpload, RefreshCw } from 'lucide-react';

export const AdminJobsListPage: React.FC = () => {
  const [jobs, setJobs] = useState<JobCircular[]>(() => {
    const cached = getCached<JobCircular[]>('admin_jobs') || [];
    return cached.filter((j) => !isDummyJob(j));
  });
  const [loading, setLoading] = useState(() => !getCached<JobCircular[]>('admin_jobs'));
  const [syncingR2, setSyncingR2] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { success, error } = useToast();

  const handleSyncR2 = async () => {
    setSyncingR2(true);
    try {
      const res = await fetch('/api/admin/jobs/sync-r2', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        success(`Cloudflare R2-তে ${data.count}টি সার্কুলার সফলভাবে সিঙ্ক হয়েছে!`);
        fetchJobs();
      } else {
        error(data.error || 'R2 সিঙ্ক ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      error('R2 সার্ভারের সাথে কানেক্ট করা যায়নি');
    } finally {
      setSyncingR2(false);
    }
  };

  const fetchJobs = async () => {
    setLoading(true);
    try {
      // 1. Try resilient server API route (returns cached or stored jobs even if quota is 0)
      try {
        const res = await fetch('/api/jobs?limit=50');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.jobs)) {
            const clean = data.jobs.filter((j: any) => !isDummyJob(j));
            setJobs(clean);
            setCached('admin_jobs', clean);
            clean.forEach(precacheJob);
            setLoading(false);
            return;
          }
        }
      } catch {}

      // 1.5. Try direct Cloudflare R2 public URL (100% uptime, quota-immune)
      try {
        const r2Res = await fetch('https://pub-1c4d2bddd5d943c38d6824eeb890c6f0.r2.dev/jobs.json');
        if (r2Res.ok) {
          const r2Data = await r2Res.json();
          if (Array.isArray(r2Data)) {
            const clean = r2Data.filter((j: any) => !isDummyJob(j));
            setJobs(clean);
            setCached('admin_jobs', clean);
            clean.forEach(precacheJob);
            setLoading(false);
            return;
          }
        }
      } catch {}

      // 2. Fallback to Cloudflare R2 CDN directly
      try {
        const r2Res = await fetch('https://pub-1c4d2bddd5d943c38d6824eeb890c6f0.r2.dev/jobs.json');
        if (r2Res.ok) {
          const r2Jobs = await r2Res.json();
          if (Array.isArray(r2Jobs) && r2Jobs.length > 0) {
            const clean = r2Jobs.filter((j: any) => !isDummyJob(j));
            setJobs(clean);
            setCached('admin_jobs', clean);
            clean.forEach(precacheJob);
            setLoading(false);
            return;
          }
        }
      } catch {}

      // 3. Fallback to cached jobs
      const cached = getCached<JobCircular[]>('admin_jobs');
      if (cached && cached.length > 0) {
        setJobs(cached.filter((j) => !isDummyJob(j)));
      }
    } catch (err) {
      console.warn('Jobs fetch catch notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    recoverLocalJobs().then((count) => {
      if (count > 0) {
        success(`${count}টি সার্কুলার লোকাল ক্যাশ থেকে উদ্ধার করে R2-তে সংরক্ষিত হয়েছে!`);
        fetchJobs();
      }
    });
    fetchJobs();
  }, []);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`আপনি কি নিশ্চিত যে "${title}" বিজ্ঞপ্তিটি মুছে ফেলতে চান?`)) {
      return;
    }

    setDeletingId(id);
    try {
      await fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
      try {
        await deleteFile(getFileId.cover(id));
      } catch {}
      await syncJobToFeed(id, {}, 'delete').catch(() => {});
      invalidateCache('admin_jobs');
      invalidateCache('feed_');
      invalidateCache('jobs_');
      setJobs((prev) => prev.filter((j) => j.id !== id));
      success('বিজ্ঞপ্তিটি সফলভাবে মুছে ফেলা হয়েছে');
    } catch (err: any) {
      error(err?.message || 'বিজ্ঞপ্তি মুছতে ব্যর্থ হয়েছে');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">চাকরির সার্কুলার ব্যবস্থাপনা</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            নতুন চাকরির নিয়োগ বিজ্ঞপ্তি তৈরি, প্রকাশ ও নিয়ন্ত্রণ করুন
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncR2}
            disabled={syncingR2}
            icon={syncingR2 ? <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" /> : <CloudUpload className="w-4 h-4 text-emerald-600" />}
          >
            {syncingR2 ? 'R2 সিঙ্ক হচ্ছে...' : 'R2 ক্লাউডে সিঙ্ক করুন'}
          </Button>

          <Link to="/admin/jobs/new">
            <Button icon={<Plus className="w-4 h-4" />}>নতুন সার্কুলার যোগ করুন</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" text="সার্কুলার তালিকা লোড হচ্ছে..." />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          title="কোনো সার্কুলার পাওয়া যায়নি"
          description="এখনও কোনো চাকরির বিজ্ঞপ্তি পোস্ট করা হয়নি।"
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
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="p-3.5 max-w-sm">
                      <span className="font-bold text-gray-900 block line-clamp-1">{job.title}</span>
                      <span className="text-[11px] text-gray-500">{job.category} • পদের সংখ্যা: {job.posts?.length || 0}</span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          job.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700'
                            : job.status === 'scheduled'
                            ? 'bg-sky-50 text-sky-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {job.status === 'published'
                          ? 'Published'
                          : job.status === 'scheduled'
                          ? 'Scheduled'
                          : 'Draft'}
                      </span>
                    </td>
                    <td className="p-3.5 text-gray-600 whitespace-nowrap">
                      {job.deadline ? new Date(job.deadline.toDate ? job.deadline.toDate() : job.deadline).toLocaleDateString('bn-BD') : 'নির্ধারিত নয়'}
                    </td>
                    <td className="p-3.5">
                      {job.applyServiceEnabled ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <Send className="w-3.5 h-3.5" />
                          <span>চালু (৳{job.applicationFee + job.serviceCharge})</span>
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
                          className="p-1.5 text-rose-600 hover:text-rose-800 rounded-lg hover:bg-rose-50"
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
        </div>
      )}
    </div>
  );
};
