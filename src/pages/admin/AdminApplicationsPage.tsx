import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { auth } from '../../services/firebase';
import { WORKER_URL } from '../../services/jobsStore';
import { fetchProfileAsAdmin } from '../../services/profileStore';
import { CandidateProfile } from '../../types';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { ApplicationCardItem } from '../../components/admin/ApplicationCardItem';
import {
  RejectModal,
  UploadSoftCopyModal,
  CompletePaidModal,
  AutofillModal,
} from '../../components/admin/ApplicationActionModals';
import { ChevronLeft, ChevronRight, RefreshCw, Search, Download } from 'lucide-react';

const PAGE_SIZE = 10;

// পাইপলাইন ধাপ -> D1 স্ট্যাটাস (কমা দিয়ে একাধিক)
const STEP_STATUSES: Record<string, string> = {
  waiting: 'waiting',
  'apply-now': 'apply_now',
  check: 'checking,correction',
  'payment-now': 'payment_now',
  complete: 'applied',
  rejected: 'rejected',
};

const STEP_TITLES: Record<string, string> = {
  waiting: '১. Waiting List (পেমেন্ট যাচাই)',
  'apply-now': '২. Apply Now (Teletalk আবেদন ও সফট কপি)',
  check: '৩. Check Application (প্রার্থী রিভিউ ও সংশোধন)',
  'payment-now': '৪. Payment Now (টেলিটক ফি পরিশোধ)',
  complete: '৫. Complete (সম্পন্ন আবেদন ও পেইড কপি)',
  rejected: 'বাতিলকৃত আবেদনসমূহ',
};

const STEP_COUNT_KEYS: Record<string, string[]> = {
  waiting: ['waiting'],
  'apply-now': ['apply_now'],
  check: ['checking', 'correction'],
  'payment-now': ['payment_now'],
  complete: ['applied'],
  rejected: ['rejected'],
};

type View = { step: string; page: number; q: string };

async function authHeaders(): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (!u) throw new Error('লগইন প্রয়োজন');
  const token = await u.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export const AdminApplicationsPage: React.FC = () => {
  const { step } = useParams<{ step: string }>();
  const currentStep = step && STEP_STATUSES[step] ? step : 'waiting';
  const { success, error } = useToast();

  const [view, setView] = useState<View>({ step: currentStep, page: 1, q: '' });
  const [searchInput, setSearchInput] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [activeApp, setActiveApp] = useState<any | null>(null);
  const [activeProfile, setActiveProfile] = useState<CandidateProfile | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [softOpen, setSoftOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [autofillOpen, setAutofillOpen] = useState(false);

  // ধাপ বদলালে ১ম পেজ ও search রিসেট
  useEffect(() => {
    setView({ step: currentStep, page: 1, q: '' });
    setSearchInput('');
  }, [currentStep]);

  const loadStats = async () => {
    try {
      const res = await fetch(`${WORKER_URL}/api/admin/stats`, { headers: await authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || {});
      }
    } catch {
      // পরিসংখ্যান না এলেও পেজ চলবে
    }
  };

  const loadList = async (v: View, force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const statuses = STEP_STATUSES[v.step] || 'waiting';
      const params = new URLSearchParams({
        status: statuses,
        page: String(v.page),
        limit: String(PAGE_SIZE),
      });
      if (v.q) params.set('q', v.q);

      const res = await fetch(`${WORKER_URL}/api/admin/applications?${params.toString()}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) {
        throw new Error(`তালিকা লোড ব্যর্থ (HTTP ${res.status})`);
      }
      const data = await res.json();
      setItems(data.items || []);
      setHasNext(Boolean(data.hasNext));
    } catch (err: any) {
      console.warn('Applications load failed:', err);
      error(err?.message || 'আবেদন তালিকা লোড করতে ব্যর্থ হয়েছে');
      setItems([]);
      setHasNext(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // একটিমাত্র লোড: view বর্তমান ধাপের সাথে মিললেই
  useEffect(() => {
    if (view.step !== currentStep) return;
    loadList(view);
  }, [view, currentStep]);

  useEffect(() => {
    loadStats();
  }, []);

  const removeFromList = (id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
  };

  const patchApplication = async (id: string, body: any) => {
    const res = await fetch(`${WORKER_URL}/api/admin/applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `আপডেট ব্যর্থ (HTTP ${res.status})`);
    }
    return res.json();
  };

  const afterChange = (id: string) => {
    removeFromList(id);
    loadStats();
  };

  const handleVerifyPayment = async (app: any) => {
    setBusyId(app.id);
    try {
      await patchApplication(app.id, {
        status: 'apply_now',
        data: { paymentVerified: true, paymentVerifiedBy: auth.currentUser?.email || 'admin' },
      });
      afterChange(app.id);
      success('পেমেন্ট যাচাই সফল! আবেদনটি Apply Now তালিকায় গেছে।');
    } catch (err: any) {
      error(err?.message || 'আপডেট করতে ব্যর্থ হয়েছে');
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!activeApp) return;
    try {
      await patchApplication(activeApp.id, {
        status: 'rejected',
        data: { rejectReason: reason },
      });
      afterChange(activeApp.id);
      success('আবেদনটি বাতিল করা হয়েছে।');
    } catch (err: any) {
      error(err?.message || 'বাতিল করতে ব্যর্থ হয়েছে');
    }
  };

  const handleUploadSoftCopy = async (result: { hasFile: boolean; driveUrl?: string }) => {
    if (!activeApp) return;
    try {
      await patchApplication(activeApp.id, {
        status: 'checking',
        data: {
          hasSoftCopy: result.hasFile,
          softCopyDriveUrl: result.driveUrl || null,
        },
      });
      afterChange(activeApp.id);
      success('সফট কপি সংরক্ষিত হয়েছে এবং আবেদনটি Check তালিকায় গেছে।');
    } catch (err: any) {
      error(err?.message || 'সফট কপি আপডেট করতে সমস্যা হয়েছে');
    }
  };

  const handleCompletePaid = async (result: { hasFile: boolean; driveUrl?: string }) => {
    if (!activeApp) return;
    try {
      await patchApplication(activeApp.id, {
        status: 'applied',
        data: {
          hasPaidCopy: result.hasFile,
          paidCopyDriveUrl: result.driveUrl || null,
          hasSoftCopy: false,
          softCopyDriveUrl: null,
        },
      });
      afterChange(activeApp.id);
      success('আবেদন সম্পন্ন হয়েছে এবং পেইড কপি যুক্ত হয়েছে!');
    } catch (err: any) {
      error(err?.message || 'পেইড কপি সংরক্ষণ করতে সমস্যা হয়েছে');
    }
  };

  const handleOpenAutofill = async (app: any) => {
    setBusyId(app.id);
    try {
      // আবেদনের পূর্ণ তথ্য (ফি, লিংক, জেলা ইত্যাদি) D1 থেকে
      const res = await fetch(`${WORKER_URL}/api/admin/applications/${encodeURIComponent(app.id)}`, {
        headers: await authHeaders(),
      });
      const detail = res.ok ? await res.json() : app;

      const prof = await fetchProfileAsAdmin(app.uid);
      if (!prof) {
        error('প্রার্থীর সিভি প্রোফাইল পাওয়া যায়নি');
        return;
      }
      setActiveApp({ ...app, ...detail });
      setActiveProfile(prof as CandidateProfile);
      setAutofillOpen(true);
    } catch (err: any) {
      error(err?.message || 'প্রোফাইল লোড করতে সমস্যা হয়েছে');
    } finally {
      setBusyId(null);
    }
  };

  const countFor = (stepKey: string) =>
    (STEP_COUNT_KEYS[stepKey] || []).reduce((sum, k) => sum + (stats[k] || 0), 0);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setView((v) => ({ ...v, page: 1, q: searchInput.trim() }));
  };

  const goPrev = () => setView((v) => ({ ...v, page: Math.max(1, v.page - 1) }));
  const goNext = () => setView((v) => ({ ...v, page: v.page + 1 }));

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{STEP_TITLES[currentStep]}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            এই ধাপে মোট: {countFor(currentStep)}টি • পাতা {view.page}
            {view.q ? ` • খোঁজা: "${view.q}"` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              loadList(view, true);
              loadStats();
            }}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
            <span>রিফ্রেশ</span>
          </button>
          <a
            href="/bd-job-autofill-extension.zip"
            download="bd-job-autofill-extension.zip"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold border border-emerald-200 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Autofill Extension (.zip)</span>
          </a>
        </div>
      </div>

      {/* ধাপ ট্যাব */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(STEP_STATUSES).map((key) => (
          <Link
            key={key}
            to={`/admin/applications/${key}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              currentStep === key
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {key === 'waiting' && 'Waiting'}
            {key === 'apply-now' && 'Apply Now'}
            {key === 'check' && 'Check'}
            {key === 'payment-now' && 'Payment Now'}
            {key === 'complete' && 'Complete'}
            {key === 'rejected' && 'বাতিল'}
            <span className="ml-1.5 opacity-80">({countFor(key)})</span>
          </Link>
        ))}
      </div>

      {/* খোঁজা */}
      <form onSubmit={onSearch} className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="আবেদন আইডি, মোবাইল বা নাম দিয়ে খুঁজুন"
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-semibold"
        >
          খুঁজুন
        </button>
        {view.q && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setView((v) => ({ ...v, page: 1, q: '' }));
            }}
            className="px-3 py-2 text-xs text-gray-600 hover:text-gray-900"
          >
            মুছুন
          </button>
        )}
      </form>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" text="আবেদন লোড হচ্ছে..." />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="এই পাতায় কোনো আবেদন নেই"
          description={view.q ? 'খোঁজার সাথে মেলে এমন আবেদন পাওয়া যায়নি।' : 'এই ধাপে বর্তমানে কোনো আবেদন নেই।'}
        />
      ) : (
        <div className="space-y-4">
          {items.map((app) => (
            <div key={app.id} className={busyId === app.id ? 'opacity-60 pointer-events-none' : ''}>
              <ApplicationCardItem
                app={app}
                onReject={(a: any) => {
                  setActiveApp(a);
                  setRejectOpen(true);
                }}
                onVerifyPayment={handleVerifyPayment}
                onOpenAutofill={handleOpenAutofill}
                onOpenSoftCopyModal={(a: any) => {
                  setActiveApp(a);
                  setSoftOpen(true);
                }}
                onOpenCompleteModal={(a: any) => {
                  setActiveApp(a);
                  setCompleteOpen(true);
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* পাতা নেভিগেশন: প্রতিবার ১০টি */}
      {!loading && (view.page > 1 || hasNext) && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={view.page <= 1 || refreshing}
            className="inline-flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>আগের ১০টি</span>
          </button>
          <span className="text-xs font-semibold text-gray-700 px-3 py-1 bg-gray-100 rounded-md">
            পাতা {view.page}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={!hasNext || refreshing}
            className="inline-flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
          >
            <span>পরের ১০টি</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <RejectModal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        appId={activeApp?.id || ''}
        onConfirm={handleRejectConfirm}
      />
      <UploadSoftCopyModal
        isOpen={softOpen}
        onClose={() => setSoftOpen(false)}
        app={activeApp}
        onUpload={handleUploadSoftCopy}
      />
      <CompletePaidModal
        isOpen={completeOpen}
        onClose={() => setCompleteOpen(false)}
        app={activeApp}
        onUploadPaid={handleCompletePaid}
      />
      <AutofillModal
        isOpen={autofillOpen}
        onClose={() => setAutofillOpen(false)}
        app={activeApp}
        profile={activeProfile}
      />
    </div>
  );
};
