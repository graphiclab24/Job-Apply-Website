import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  Send,
  CheckCircle,
  CreditCard,
  CheckCheck,
  XCircle,
  Ban,
  TrendingUp,
  Download,
  HelpCircle,
  Briefcase,
} from 'lucide-react';
import { fetchJobsList } from '../../services/jobsStore';

export const AdminDashboardPage: React.FC = () => {
  const [showGuide, setShowGuide] = useState(false);
  const [jobsTotal, setJobsTotal] = useState<number | null>(null);

  // মোট সার্কুলার R2 থেকে (D1 বা Firestore নয়, তাই খরচ নেই)
  useEffect(() => {
    fetchJobsList(true)
      .then((list) => setJobsTotal(list.length))
      .catch(() => setJobsTotal(0));
  }, []);

  // শুধু বাটন। কোনো সংখ্যা বা তালিকা এখানে আনা হয় না (ডেটা খরচ বাঁচাতে)
  const steps = [
    {
      title: 'Waiting List',
      sub: 'পেমেন্ট যাচাই বাকি',
      icon: Clock,
      color: 'bg-amber-500',
      to: '/admin/applications/waiting',
    },
    {
      title: 'Apply Now',
      sub: 'Teletalk-এ আবেদন করতে হবে',
      icon: Send,
      color: 'bg-sky-500',
      to: '/admin/applications/apply-now',
    },
    {
      title: 'Check Application',
      sub: 'সফট কপি প্রার্থী যাচাই করছে',
      icon: CheckCircle,
      color: 'bg-indigo-500',
      to: '/admin/applications/check',
    },
    {
      title: 'Payment Now',
      sub: 'টেলিটক ফি পরিশোধের অপেক্ষায়',
      icon: CreditCard,
      color: 'bg-rose-500',
      to: '/admin/applications/payment-now',
    },
    {
      title: 'Complete',
      sub: 'পেইড কপি সরবরাহকৃত',
      icon: CheckCheck,
      color: 'bg-emerald-500',
      to: '/admin/applications/complete',
    },
    {
      title: 'ক্যান্সেল (রিফান্ড বাকি)',
      sub: 'রিফান্ড দিতে হবে',
      icon: Ban,
      color: 'bg-orange-600',
      to: '/admin/applications/cancelled',
    },
    {
      title: 'বাতিলকৃত (রিফান্ড সম্পন্ন)',
      sub: 'রিফান্ড দেওয়া হয়েছে',
      icon: XCircle,
      color: 'bg-gray-600',
      to: '/admin/applications/rejected',
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">অ্যাডমিন ড্যাশবোর্ড</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            মোট সার্কুলার: {jobsTotal === null ? '...' : jobsTotal}টি • যে ধাপে কাজ করতে চান সেটিতে ক্লিক করুন
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/jobs"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>সকল বিজ্ঞপ্তি</span>
          </Link>
          <a
            href="/bd-job-autofill-extension.zip"
            download="bd-job-autofill-extension.zip"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            title="টেলিটক অটোফিল ক্রোম এক্সটেনশন ডাউনলোড (.zip)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Autofill Extension (.zip)</span>
          </a>
          <Link
            to="/admin/jobs/new"
            className="px-3.5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-semibold shadow-xs"
          >
            + নতুন চাকরির বিজ্ঞপ্তি
          </Link>
        </div>
      </div>

      {/* ধাপের বাটন */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link
              key={i}
              to={s.to}
              className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 hover:border-emerald-500 hover:shadow-md transition-all flex items-center justify-between"
            >
              <div>
                <span className="text-sm font-bold text-gray-900">{s.title}</span>
                <p className="text-[11px] text-gray-400 mt-1">{s.sub}</p>
              </div>
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${s.color} text-white flex items-center justify-center shadow-xs shrink-0`}
              >
                <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* ইনস্টলেশন গাইড (শুধু দরকারে) */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-gray-900 text-white rounded-2xl p-5 shadow-sm border border-emerald-700/60 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs text-emerald-200 font-medium">Chrome Extension v1.2.0</span>
            <h3 className="text-sm font-bold text-white">টেলিটক অটোফিল এক্সটেনশন</h3>
          </div>
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold border border-white/20 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            <span>{showGuide ? 'গাইড বন্ধ করুন' : 'ইনস্টলেশন গাইড'}</span>
          </button>
        </div>

        {showGuide && (
          <ol className="pt-3 border-t border-emerald-800/80 text-xs text-emerald-100/90 space-y-1.5 list-decimal list-inside">
            <li>উপরের বাটন দিয়ে <strong>bd-job-autofill-extension.zip</strong> ডাউনলোড করে আনজিপ করুন।</li>
            <li>Chrome-এর ঠিকানায় <code className="bg-black/40 px-1 py-0.5 rounded text-emerald-300">chrome://extensions</code> লিখুন।</li>
            <li>উপরের ডানে <strong>Developer mode</strong> অন করুন।</li>
            <li><strong>Load unpacked</strong> চেপে আনজিপ করা <code className="bg-black/40 px-1 py-0.5 rounded text-emerald-300">extension</code> ফোল্ডারটি দিন।</li>
          </ol>
        )}
      </div>

      {/* কাজের ধাপ */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-3">
        <h3 className="font-semibold text-gray-900 text-xs sm:text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>আবেদন প্রক্রিয়াকরণের ধাপ:</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3 pt-2 text-xs">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
            <span className="font-bold text-amber-800 block mb-1">১. Waiting</span>
            <p className="text-amber-700 text-[11px]">bKash/Rocket/Nagad-এ টাকা এসেছে কি না যাচাই করে অনুমোদন দিন।</p>
          </div>
          <div className="p-3 bg-sky-50 rounded-lg border border-sky-100">
            <span className="font-bold text-sky-800 block mb-1">২. Apply Now</span>
            <p className="text-sky-700 text-[11px]">Teletalk-এ আবেদন করে সফট কপি দিন।</p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <span className="font-bold text-indigo-800 block mb-1">৩. Check</span>
            <p className="text-indigo-700 text-[11px]">প্রার্থী তথ্য ঠিক আছে নিশ্চিত হলে Payment Now-তে যাবে।</p>
          </div>
          <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
            <span className="font-bold text-rose-800 block mb-1">৪. Payment Now</span>
            <p className="text-rose-700 text-[11px]">Teletalk ফি পরিশোধ করে পেইড কপি দিন।</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
            <span className="font-bold text-emerald-800 block mb-1">৫. Complete</span>
            <p className="text-emerald-700 text-[11px]">আবেদন সম্পন্ন, পেইড কপি সংরক্ষিত।</p>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
            <span className="font-bold text-orange-800 block mb-1">বাতিল → রিফান্ড</span>
            <p className="text-orange-700 text-[11px]">ক্যান্সেল তালিকা থেকে রিফান্ড দিয়ে "রিফান্ড সম্পন্ন" চিহ্নিত করুন।</p>
          </div>
        </div>
      </div>
    </div>
  );
};
