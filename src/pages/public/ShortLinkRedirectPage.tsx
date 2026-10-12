import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ExternalLink, AlertTriangle, ArrowRight } from 'lucide-react';
import { Spinner } from '../../components/common/Spinner';

export const ShortLinkRedirectPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      window.location.replace('/');
      return;
    }

    const cleanCode = code.trim().toLowerCase();

    const fetchAndRedirect = async () => {
      try {
        const snap = await getDoc(doc(db, 'short_links', cleanCode));
        if (snap.exists()) {
          const data = snap.data();
          const targetUrl = data.originalUrl || '/';

          // Increment clicks asynchronously
          updateDoc(doc(db, 'short_links', cleanCode), {
            clicks: increment(1),
            lastClickedAt: serverTimestamp(),
          }).catch(() => {});

          // Fast direct redirect
          window.location.replace(targetUrl);
          return;
        }

        setError('এই শর্ট লিংকটি খুঁজে পাওয়া যায়নি অথবা মুছে ফেলা হয়েছে।');
      } catch (err: any) {
        console.warn('Redirect error:', err);
        setError('লিংকটি লোড করতে সমস্যা হয়েছে।');
      }
    };

    fetchAndRedirect();
  }, [code]);

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-200 shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">শর্ট লিংক পাওয়া যায়নি</h2>
        <p className="text-xs text-gray-500 max-w-sm mb-6">{error}</p>
        <Link
          to="/"
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 shadow-sm transition-colors"
        >
          <span>হোমপেজে যান</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 text-center">
      <div className="p-8 max-w-sm w-full bg-white rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <Spinner size="lg" text="গন্তব্য লিংকে নিয়ে যাওয়া হচ্ছে..." />
        <p className="text-xs text-gray-400">এক মুহূর্ত অপেক্ষা করুন</p>
      </div>
    </div>
  );
};
