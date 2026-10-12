import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { deleteFile, getFileId } from '../../services/files';
import { syncJobToFeed } from '../../services/feed';
import { getCached, setCached, precacheJob, invalidateCache } from '../../services/cache';
import { JobCircular } from '../../types';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { Plus, Edit, Trash2, ExternalLink, Calendar, Send } from 'lucide-react';

export const AdminJobsListPage: React.FC = () => {
  const [jobs, setJobs] = useState<JobCircular[]>(() => {
    return getCached<JobCircular[]>('admin_jobs') || [];
  });
  const [loading, setLoading] = useState(() => !getCached<JobCircular[]>('admin_jobs'));
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { success, error } = useToast();

  const fetchJobs = async () => {
    try {
      try {
        const res = await fetch('/api/jobs?limit=50');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.jobs)) {
            setJobs(data.jobs);
            setCached('admin_jobs', data.jobs);
            data.jobs.forEach(precacheJob);
            setLoading(false);
            return;
          }
        }
      } catch {}

      const snap = await getDocs(collection(db, 'jobs'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobCircular));
      setJobs(list);
      setCached('admin_jobs', list);
      list.forEach(precacheJob);
    } catch (err) {
      error('বিজ্ঞপ্তি লোড করতে সমস্যা হয়েছে');
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
      await deleteDoc(doc(db, 'jobs', id));
      try {
        await deleteFile(getFileId.cover(id));
      } catch (e) {
        // Non-fatal
      }
      await syncJobToFeed(id, {}, 'delete');
      invalidateCache('admin_jobs');
      invalidateCache('feed_');
      invalidateCache('jobs_');
      fetch('/api/feed/purge-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => {});
      setJobs((prev) => prev.filter((j) => j.id !== id));
      success('বিজ্ঞপ্তিটি সফলভাবে মুছে ফেলা হয়েছে');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `jobs/${id}`);
      error('বিজ্ঞপ্তি মুছতে ব্যর্থ হয়েছে');
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

        <Link to="/admin/jobs/new">
          <Button icon={<Plus className="w-4 h-4" />}>নতুন সার্কুলার যোগ করুন</Button>
        </Link>
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
