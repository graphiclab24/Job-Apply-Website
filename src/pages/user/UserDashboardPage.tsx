import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getCached, setCached } from '../../services/cache';
import { fetchUserApplications } from '../../services/applicationsService';
import { CandidateProfile } from '../../types';
import { FileText, Clock, CheckCircle, CreditCard, CheckCheck, ArrowRight } from 'lucide-react';

export const UserDashboardPage: React.FC = () => {
  const { user, mobile } = useAuth();
  const cacheKeyProfile = user ? `user_profile_${user.uid}` : '';
  const cacheKeyCounts = user ? `user_counts_${user.uid}` : '';

  const [profile, setProfile] = useState<CandidateProfile | null>(() => {
    return cacheKeyProfile ? getCached<CandidateProfile>(cacheKeyProfile) : null;
  });
  const [counts, setCounts] = useState(() => {
    return (
      (cacheKeyCounts ? getCached<any>(cacheKeyCounts) : null) || {
        waiting: 0,
        checking: 0,
        paymentNow: 0,
        applied: 0,
      }
    );
  });
  const [loading, setLoading] = useState(() => {
    return cacheKeyCounts ? !getCached(cacheKeyCounts) : false;
  });

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const fetchUserData = async () => {
      try {
        // CV profile (এখনো Firestore; পরের ধাপে R2-তে যাবে)
        const profRef = doc(db, 'profiles', user.uid);
        const profPromise = getDoc(profRef);

        // আবেদন D1 থেকে (Firestore নয়)
        const appPromise = fetchUserApplications();

        const [profSnap, apps] = await Promise.all([profPromise, appPromise]);

        if (!isMounted) return;

        if (profSnap.exists()) {
          const profData = profSnap.data() as CandidateProfile;
          setProfile(profData);
          setCached(cacheKeyProfile, profData);
        }

        let w = 0;
        let c = 0;
        let p = 0;
        let a = 0;

        apps.forEach((app: any) => {
          if (app.status === 'waiting') w++;
          else if (app.status === 'checking' || app.status === 'apply_now' || app.status === 'correction') c++;
          else if (app.status === 'payment_now') p++;
          else if (app.status === 'applied') a++;
        });

        const updatedCounts = { waiting: w, checking: c, paymentNow: p, applied: a };
        setCounts(updatedCounts);
        setCached(cacheKeyCounts, updatedCounts);
      } catch (err: any) {
        console.warn('Notice loading user dashboard:', err?.message || err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUserData();
    return () => {
      isMounted = false;
    };
  }, [user, cacheKeyProfile, cacheKeyCounts]);

  const isProfileComplete =
    profile?.data?.fullName &&
    profile?.data?.fatherName &&
    profile?.data?.dateOfBirth &&
    profile?.data?.nidNo &&
    profile?.data?.permanentDistrict &&
    (profile?.hasPhoto || profile?.photoPath || profile?.photoUrl);

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-800 text-white rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs text-emerald-200 font-medium">স্বাগতম</span>
          <h2 className="text-xl font-bold mt-0.5">
            {profile?.data?.fullName || `মোবাইল: ${mobile}`}
          </h2>
          <p className="text-xs text-emerald-100/80 mt-1">
            আপনার চাকরি আবেদন সার্ভিসের নিয়ন্ত্রণ কেন্দ্র
          </p>
        </div>

        <Link
          to="/cv"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-emerald-900 rounded-xl text-xs font-bold hover:bg-emerald-50 transition-colors shadow-xs"
        >
          <FileText className="w-4 h-4 text-emerald-600" />
          <span>{profile ? 'সিভি এডিট করুন' : 'সিভি পূরণ করুন'}</span>
        </Link>
      </div>

      {/* Profile Notice if incomplete */}
      {!isProfileComplete && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start justify-between gap-3">
          <div>
            <span className="font-semibold block mb-0.5">আপনার সিভি এখনও অসম্পূর্ণ!</span>
            <span>চাকরির দ্রুত আবেদনের জন্য প্রথমে আপনার পুরো সিভি, ছবি ও স্বাক্ষর আপলোড করুন।</span>
          </div>
          <Link
            to="/cv"
            className="shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700"
          >
            সিভি পূরণ
          </Link>
        </div>
      )}

      {/* Application Status Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/applications/waiting"
          className="p-4 bg-white rounded-xl border border-gray-200 hover:border-emerald-500 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Waiting</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '…' : counts.waiting}</div>
          <p className="text-[11px] text-gray-400 mt-1">যাচাইয়ের অপেক্ষায়</p>
        </Link>

        <Link
          to="/applications/checking"
          className="p-4 bg-white rounded-xl border border-gray-200 hover:border-emerald-500 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Check App</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '…' : counts.checking}</div>
          <p className="text-[11px] text-gray-400 mt-1">সফট কপি চেক করুন</p>
        </Link>

        <Link
          to="/applications/payment-now"
          className="p-4 bg-white rounded-xl border border-gray-200 hover:border-emerald-500 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Payment Now</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '…' : counts.paymentNow}</div>
          <p className="text-[11px] text-gray-400 mt-1">টেলিটক ফি পরিশোধ বাকি</p>
        </Link>

        <Link
          to="/applications/applied"
          className="p-4 bg-white rounded-xl border border-gray-200 hover:border-emerald-500 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Applied Job</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '…' : counts.applied}</div>
          <p className="text-[11px] text-gray-400 mt-1">পেইড কপি রেডি</p>
        </Link>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">নতুন চাকরির আবেদন করবেন?</h3>
        <p className="text-xs text-gray-500">
          চলমান সরকারি ও অন্যান্য সার্কুলার দেখে আপনার পছন্দের পদে সরাসরি আবেদন করুন।
        </p>
        <Link
          to="/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800"
        >
          <span>চলমান সার্কুলারসমূহ দেখুন</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
};
