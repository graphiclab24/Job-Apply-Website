import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCached, setCached, precacheJob, invalidateCache } from '../../services/cache';
import { fetchJobsList, deleteJobInWorker } from '../../services/jobsStore';
import { JobCircular } from '../../types';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { isDummyJob } from '../../utils/recoverLocalJobs';
import { DEFAULT_JOBS } from '../../data/defaultJobs';
import { safeFormatBnDate } from '../../utils/dateUtils';
import { sortJobsByDeadline } from '../../utils/jobSort';
import { Plus, Edit, Trash2, ExternalLink, Send } from 'lucide-react';

export const AdminJobsListPage: React.FC = () => {
  const [jobs, setJobs] = useState<JobCircular[]>(() => {
    const cached = getCached<JobCircular[]>('admin_jobs') || [];
    const clean = cached.filter((j) => !isDummyJob(j));
    if (clean.length > 0) return sortJobsByDeadline(clean);
    return sortJobsByDeadline(DEFAULT_JOBS.filter((j) => !isDummyJob(j)));
  });
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { success, error } = useToast();

  // R2 থেকে সরাসরি তালিকা (ক্যাশ ছাড়া, ড্রাফটসহ সব জব)
  const fetchJobs = async () => {
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

  useEffect(() => {
    fetchJobs();
  }, []);

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

  const now = Date.now();
  const isExpiredJob = (j: JobCircular) => {
    const t = j.deadline ? new Date(j.deadline as any).getTime() : NaN;
    return !isNaN(t) && t < now;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">চাকরির সার্কুলার ব্যবস্থাপনা</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            চলমান সার্কুলার আগে, মেয়াদ শেষ সার্কুলার সবার নিচে • নতুন তৈরি, প্রকাশ ও নিয়ন্ত্রণ করুন
          </p>
        </div>

        <div className="flex items-center gap-2">
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
          title="কোনো সার্কুলার পাওয়া যায়নি"
          description="এখনও কোনো চাকরির বিজ্ঞপ্তি পোস্ট করা হয়নি।"
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
                            {job.status === 'published'
                              ? 'Published'
                              : job.status === 'scheduled'
                              ? 'Scheduled'
                              : 'Draft'}
                          </span>
                          {expired && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-700">
                              মেয়াদ শেষ
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        {safeFormatBnDate(job.deadline, 'নির্ধারিত নয়')}
                      </td>
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
      )}
    </div>
  );
};
