import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCached, setCached } from '../../services/cache';
import { fetchJobsList, WORKER_URL } from '../../services/jobsStore';
import { auth } from '../../services/firebase';
import { JobApplication } from '../../types';
import {
  Clock,
  Send,
  CheckCircle,
  CreditCard,
  CheckCheck,
  Briefcase,
  AlertCircle,
  TrendingUp,
  XCircle,
  Calendar,
  RefreshCw,
  Download,
  HelpCircle,
  Check,
} from 'lucide-react';

// ড্যাশবোর্ড সংখ্যা ৩০ মিনিট পর্যন্ত একই থাকবে
const DASHBOARD_CACHE_TTL_MS = 30 * 60 * 1000;

export const AdminDashboardPage: React.FC = () => {
  const [counts, setCounts] = useState(() => {
    return (
      getCached<any>('admin_dashboard_counts', DASHBOARD_CACHE_TTL_MS) || {
        waiting: 0,
        applyNow: 0,
        checking: 0,
        paymentNow: 0,
        complete: 0,
        rejected: 0,
        jobsTotal: 0,
      }
    );
  });
  const [urgentApps, setUrgentApps] = useState<JobApplication[]>(() => {
    return getCached<JobApplication[]>('admin_dashboard_urgent', DASHBOARD_CACHE_TTL_MS) || [];
  });
  const [loading, setLoading] = useState(() => !getCached('admin_dashboard_counts', DASHBOARD_CACHE_TTL_MS));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const fetchAdminStats = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('লগইন প্রয়োজন');
      const headers = { Authorization: `Bearer ${token}` };

      // ১. আবেদনের সংখ্যা D1 থেকে (ছোট ৭টি সারি)
      const statsRes = await fetch(`${WORKER_URL}/api/admin/stats`, { headers, cache: 'no-store' });
      const s: Record<string, number> = statsRes.ok ? (await statsRes.json()).stats || {} : {};

      // ২. জবের সংখ্যা R2 থেকে
      let jobsTotal = 0;
      let jobsList: any[] = [];
      try {
        jobsList = await fetchJobsList(true);
        jobsTotal = jobsList.length;
      } catch {
        // জবের সংখ্যা না পেলে 0
      }

      const updatedCounts = {
        waiting: s.waiting || 0,
        applyNow: s.apply_now || 0,
        checking: (s.checking || 0) + (s.correction || 0),
        paymentNow: s.payment_now || 0,
        complete: s.applied || 0,
        rejected: s.rejected || 0,
        jobsTotal,
      };
      setCounts(updatedCounts);
      setCached('admin_dashboard_counts', updatedCounts);

      // ৩. জরুরি পেন্ডিং আবেদন (সর্বোচ্চ ৫টি)
      const urgentRes = await fetch(
        `${WORKER_URL}/api/admin/applications?status=waiting,apply_now,payment_now&limit=5`,
        { headers, cache: 'no-store' }
      );
      if (urgentRes.ok) {
        const data = await urgentRes.json();
        const list = (data.items || []).map((i: any) => ({
          ...i,
          jobTitle: jobsList.find((j: any) => j.id === i.jobId)?.title || '',
        })) as JobApplication[];
        setUrgentApps(list);
        setCached('admin_dashboard_urgent', list);
      }
    } catch (e: any) {
      console.warn('Notice fetching admin counts:', e?.message || e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // ক্যাশ ৩০ মিনিট পর্যন্ত বৈধ থাকলে নতুন করে আনা হবে না
    const fresh = getCached<any>('admin_dashboard_counts', DASHBOARD_CACHE_TTL_MS);
    if (fresh) {
      setLoading(false);
      return;
    }
    fetchAdminStats();
  }, []);

  const statCards = [
    {
      title: 'Waiting List',
      sub: 'পেমেন্ট যাচাই বাকি',
      count: counts.waiting,
      icon: Clock,
      color: 'bg-amber-500',
      to: '/admin/applications/waiting',
    },
    {
      title: 'Apply Now',
      sub: 'Teletalk-এ আবেদন করতে হবে',
      count: counts.applyNow,
      icon: Send,
      color: 'bg-sky-500',
      to: '/admin/applications/apply-now',
    },
    {
      title: 'Check Application',
      sub: 'সফট কপি প্রার্থী যাচাই করছে',
      count: counts.checking,
      icon: CheckCircle,
      color: 'bg-indigo-500',
      to: '/admin/applications/check',
    },
    {
      title: 'Payment Now',
      sub: 'টেলিটক ফি পরিশোধের অপেক্ষায়',
      count: counts.paymentNow,
      icon: CreditCard,
      color: 'bg-rose-500',
      to: '/admin/applications/payment-now',
    },
    {
      title: 'Complete',
      sub: 'পেইড কপি সরবরাহকৃত',
      count: counts.complete,
      icon: CheckCheck,
      color: 'bg-emerald-500',
      to: '/admin/applications/complete',
    },
    {
      title: 'বাতিলকৃত (Rejected)',
      sub: 'বাতিল আবেদনসমূহ',
      count: counts.rejected,
      icon: XCircle,
      color: 'bg-gray-600',
      to: '/admin/applications/rejected',
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">অ্যাডমিন ড্যাশবোর্ড ওভারভিউ</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            সকল আবেদন ও সিস্টেমের সার্বিক পরিসংখ্যান (মোট সার্কুলার: {loading ? '...' : counts.jobsTotal}টি)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/bd-job-autofill-extension.zip"
            download="bd-job-autofill-extension.zip"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            title="টেলিটক অটোফিল ক্রোম এক্সটেনশন ডাউনলোড (.zip)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Autofill Extension ডাউনলোড (.zip)</span>
          </a>
          <button
            onClick={() => fetchAdminStats(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
            title="রিফ্রেশ করুন"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
            <span className="hidden sm:inline">রিফ্রেশ</span>
          </button>
          <Link
            to="/admin/jobs/new"
            className="px-3.5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-semibold shadow-xs"
          >
            + নতুন চাকরির বিজ্ঞপ্তি
          </Link>
        </div>
      </div>

      {/* BD Job Autofill Chrome Extension Feature Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-gray-900 text-white rounded-2xl p-5 md:p-6 shadow-sm border border-emerald-700/60 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 rounded text-[11px] font-bold uppercase tracking-wider">
                Chrome Extension v1.2.0
              </span>
              <span className="text-xs text-emerald-200/90 font-medium">টেলিটক অটোফিল টুল</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white">
              Teletalk-এ ১-ক্লিকে প্রার্থীর আবেদন ও ছবি-স্বাক্ষর পূরণের জন্য Autofill Extension
            </h3>
            <p className="text-xs text-emerald-100/80 leading-relaxed">
              অ্যাডমিন প্যানেলে Apply Now সেকশন থেকে <strong>"Autofill-এ পাঠান ও Teletalk পোর্টাল খুলুন"</strong> দিলে প্রার্থীর সকল তথ্য, ছবি (৩০০×৩০০) ও স্বাক্ষর (৩০০×৮০) সরাসরি এই এক্সটেনশনটি দিয়ে টেলিটক পোর্টালে এক ক্লিকে স্বয়ংক্রিয়ভাবে পূরণ হয়ে যায়।
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full md:w-auto">
            <a
              href="/bd-job-autofill-extension.zip"
              download="bd-job-autofill-extension.zip"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-gray-950 font-bold rounded-xl text-xs shadow-md transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Autofill Extension ডাউনলোড (.zip)</span>
            </a>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold border border-white/20 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span>{showGuide ? 'গাইড বন্ধ করুন' : 'ইনস্টলেশন গাইড'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Installation Guide */}
        {showGuide && (
          <div className="pt-4 border-t border-emerald-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs animate-fadeIn">
            <div className="bg-emerald-950/70 p-3.5 rounded-xl border border-emerald-800/50 space-y-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-gray-950 font-bold flex items-center justify-center text-[11px] mb-1">
                ১
              </span>
              <strong className="text-white block font-bold">ফাইল ডাউনলোড ও আনজিপ</strong>
              <p className="text-emerald-200/80 text-[11px]">
                উপরের বাটন দিয়ে <strong>bd-job-autofill-extension.zip</strong> ডাউনলোড করে কম্পিউটারে আনজিপ (Extract) করুন।
              </p>
            </div>

            <div className="bg-emerald-950/70 p-3.5 rounded-xl border border-emerald-800/50 space-y-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-gray-950 font-bold flex items-center justify-center text-[11px] mb-1">
                ২
              </span>
              <strong className="text-white block font-bold">ক্রোম এক্সটেনশনে যান</strong>
              <p className="text-emerald-200/80 text-[11px]">
                Google Chrome ব্রাউজারের অ্যাড্রেসবারে <code className="bg-black/40 px-1 py-0.5 rounded text-emerald-300">chrome://extensions</code> লিখে এন্টার চাপুন।
              </p>
            </div>

            <div className="bg-emerald-950/70 p-3.5 rounded-xl border border-emerald-800/50 space-y-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-gray-950 font-bold flex items-center justify-center text-[11px] mb-1">
                ৩
              </span>
              <strong className="text-white block font-bold">Developer mode অন করুন</strong>
              <p className="text-emerald-200/80 text-[11px]">
                ডানপাশের উপরের কোণে <strong>Developer mode</strong> টগলটি অন করুন।
              </p>
            </div>

            <div className="bg-emerald-950/70 p-3.5 rounded-xl border border-emerald-800/50 space-y-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-gray-950 font-bold flex items-center justify-center text-[11px] mb-1">
                ৪
              </span>
              <strong className="text-white block font-bold">Load unpacked সিলেক্ট করুন</strong>
              <p className="text-emerald-200/80 text-[11px]">
                বামপাশের উপরের <strong>"Load unpacked"</strong> বাটনে ক্লিক করে আনজিপ করা <code className="bg-black/40 px-1 py-0.5 rounded text-emerald-300">extension</code> ফোল্ডারটি দেখিয়ে দিন।
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Urgent Pending Alert Banner */}
      {urgentApps.length > 0 && (
        <div className="p-4 sm:p-5 bg-rose-50 rounded-2xl border border-rose-200 space-y-3">
          <div className="flex items-center gap-2 text-rose-900 font-bold text-xs sm:text-sm">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600 shrink-0" />
            <span>জরুরি সতর্কতা: পেন্ডিং সক্রিয় আবেদন ({urgentApps.length}টি)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
            {urgentApps.map((u) => (
              <div key={u.id} className="p-3 bg-white rounded-xl border border-rose-200 shadow-2xs text-xs">
                <span className="font-mono font-bold text-rose-700">{u.id}</span>
                <span className="block font-semibold text-gray-900 line-clamp-1 mt-0.5">{u.jobTitle}</span>
                <span className="text-[11px] text-gray-500 block truncate">পদ: {u.postName}</span>
                <span className="text-[10px] font-bold text-amber-600 mt-1 block">
                  স্ট্যাটাস: {u.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5-Step Pipeline Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Link
              key={i}
              to={card.to}
              className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 hover:border-emerald-500 hover:shadow-md transition-all flex items-center justify-between"
            >
              <div>
                <span className="text-xs font-semibold text-gray-500">{card.title}</span>
                <div className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1">
                  {loading ? (
                    <div className="h-7 w-12 bg-gray-100 animate-pulse rounded-md mt-1" />
                  ) : (
                    card.count
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
              </div>
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${card.color} text-white flex items-center justify-center shadow-xs shrink-0`}
              >
                <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Workflow instructions banner */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-3">
        <h3 className="font-semibold text-gray-900 text-xs sm:text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>আবেদন প্রক্রিয়াকরণের ৫টি নির্ধারিত ধাপ:</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-3 pt-2">
          <div className="p-3 bg-amber-50 rounded-lg text-xs border border-amber-100">
            <span className="font-bold text-amber-800 block mb-1">১. Waiting</span>
            <p className="text-amber-700 text-[11px]">প্রার্থীর bKash/Rocket TrxID যাচাই করে অনুমোদন করুন।</p>
          </div>
          <div className="p-3 bg-sky-50 rounded-lg text-xs border border-sky-100">
            <span className="font-bold text-sky-800 block mb-1">২. Apply Now</span>
            <p className="text-sky-700 text-[11px]">Teletalk-এ আবেদন করে সফট কপি PDF বা ড্রাইভ লিংক দিন।</p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-lg text-xs border border-indigo-100">
            <span className="font-bold text-indigo-800 block mb-1">৩. Check</span>
            <p className="text-indigo-700 text-[11px]">প্রার্থী তথ্য ঠিক আছে নিশ্চিত করলে Payment Now-তে যাবে।</p>
          </div>
          <div className="p-3 bg-rose-50 rounded-lg text-xs border border-rose-100">
            <span className="font-bold text-rose-800 block mb-1">৪. Payment Now</span>
            <p className="text-rose-700 text-[11px]">Teletalk ফি পরিশোধ করে পেইড কপি PDF বা ড্রাইভ লিংক দিন।</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg text-xs border border-emerald-100">
            <span className="font-bold text-emerald-800 block mb-1">৫. Complete</span>
            <p className="text-emerald-700 text-[11px]">আবেদন সফল ও সম্পন্ন হয়েছে। পেইড কপি সংরক্ষিত।</p>
          </div>
        </div>
      </div>
    </div>
  );
};
