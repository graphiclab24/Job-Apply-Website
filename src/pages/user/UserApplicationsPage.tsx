import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { JobApplication } from '../../types';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../components/common/Toast';
import { UserApplicationCard } from '../../components/user/UserApplicationCard';
import { fetchUserApplications } from '../../services/applicationsService';
import { reviewMyApplication } from '../../services/applicationReview';
import { downloadOrOpenFile, getFileId } from '../../services/files';
import { KeyRound, Eye, EyeOff, Copy, FileText, ExternalLink, Download } from 'lucide-react';

// ট্যাব -> যে স্ট্যাটাসগুলো দেখাবে
const TAB_STATUSES: Record<string, string[]> = {
  waiting: ['waiting'],
  checking: ['checking', 'apply_now', 'correction'],
  'payment-now': ['payment_now'],
  applied: ['applied'],
};

// আবেদনের Teletalk তথ্য ও কপি (অ্যাডমিন সেভ করলে দেখাবে)
const CredentialsBlock: React.FC<{ app: any }> = ({ app }) => {
  const [showPass, setShowPass] = useState(false);
  const { success } = useToast();

  const hasAny =
    app.teletalkUser ||
    app.teletalkPassword ||
    app.softCopyDriveUrl ||
    app.hasSoftCopy ||
    app.paidCopyDriveUrl ||
    app.hasPaidCopy;
  if (!hasAny) return null;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    success('কপি হয়েছে');
  };

  const download = async (kind: 'soft' | 'paid') => {
    try {
      const id = kind === 'soft' ? getFileId.softcopy(app.id) : getFileId.paidcopy(app.id);
      await downloadOrOpenFile(id, `${app.id}_${kind === 'soft' ? 'soft' : 'paid'}.pdf`, 'download');
    } catch (err: any) {
      alert(err?.message || 'ফাইল পাওয়া যায়নি');
    }
  };

  return (
    <div className="mt-3 p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3 text-xs">
      <div className="font-bold text-emerald-900 flex items-center gap-1.5">
        <KeyRound className="w-4 h-4" />
        <span>আবেদনের তথ্য</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <span className="text-gray-500">পদ:</span> <strong>{app.postName}</strong>
        </div>
        <div>
          <span className="text-gray-500">প্রতিষ্ঠান / বিজ্ঞপ্তি:</span>{' '}
          <strong>{app.jobTitle || '—'}</strong>
        </div>
      </div>

      {app.teletalkUser && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-500">Teletalk ইউজার:</span>
          <strong className="font-mono">{app.teletalkUser}</strong>
          <button
            type="button"
            onClick={() => copy(app.teletalkUser)}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-300 rounded text-[11px] font-semibold"
          >
            <Copy className="w-3 h-3" /> কপি
          </button>
        </div>
      )}

      {app.teletalkPassword && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-500">পাসওয়ার্ড:</span>
          <strong className="font-mono">{showPass ? app.teletalkPassword : '••••••••'}</strong>
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-300 rounded text-[11px] font-semibold"
          >
            {showPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showPass ? 'লুকান' : 'দেখুন'}
          </button>
          <button
            type="button"
            onClick={() => copy(app.teletalkPassword)}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-300 rounded text-[11px] font-semibold"
          >
            <Copy className="w-3 h-3" /> কপি
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {(app.softCopyDriveUrl || app.hasSoftCopy) && (
          <>
            {app.softCopyDriveUrl ? (
              <a
                href={app.softCopyDriveUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-sky-300 text-sky-800 rounded-lg font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" /> সফট কপি (Drive)
              </a>
            ) : (
              <button
                type="button"
                onClick={() => download('soft')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-sky-300 text-sky-800 rounded-lg font-semibold"
              >
                <FileText className="w-3.5 h-3.5" /> সফট কপি PDF
              </button>
            )}
          </>
        )}

        {(app.paidCopyDriveUrl || app.hasPaidCopy) && (
          <>
            {app.paidCopyDriveUrl ? (
              <a
                href={app.paidCopyDriveUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" /> পেইড কপি (Drive)
              </a>
            ) : (
              <button
                type="button"
                onClick={() => download('paid')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold"
              >
                <Download className="w-3.5 h-3.5" /> পেইড কপি PDF ডাউনলোড
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const UserApplicationsPage: React.FC = () => {
  const { status } = useParams<{ status: string }>();
  const { user } = useAuth();
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [correctionSaving, setCorrectionSaving] = useState(false);

  const { success, error } = useToast();

  const currentStatuses = TAB_STATUSES[status || 'waiting'] || ['waiting'];

  const fetchApps = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const all = await fetchUserApplications();
      const list = all
        .filter((a: any) => currentStatuses.includes(a.status))
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setApps(list as JobApplication[]);
    } catch (err) {
      console.warn('Applications load failed:', err);
      error('আবেদন তালিকা লোড করতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, [user, status]);

  const handleApproveSoftCopy = async (app: JobApplication) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে সফট কপির সকল তথ্য ঠিক আছে?')) return;
    setUpdatingId(app.id);
    const res = await reviewMyApplication(app.id, { action: 'approve' });
    setUpdatingId(null);

    if (!res.success) {
      error(res.error || 'স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে');
      return;
    }
    success('আবেদনটি অনুমোদিত হয়েছে এবং Payment Now ধাপে পাঠানো হয়েছে।');
    fetchApps();
  };

  const handleRequestCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !correctionNote.trim()) {
      error('সংশোধনের বিবরণ লিখুন');
      return;
    }

    setCorrectionSaving(true);
    const res = await reviewMyApplication(selectedApp.id, {
      action: 'correction',
      note: correctionNote.trim(),
    });
    setCorrectionSaving(false);

    if (!res.success) {
      error(res.error || 'সংশোধন রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে');
      return;
    }
    success('সংশোধনের নোট পাঠানো হয়েছে।');
    setCorrectionModalOpen(false);
    setCorrectionNote('');
    setSelectedApp(null);
    fetchApps();
  };

  const titles: Record<string, { title: string; desc: string }> = {
    waiting: {
      title: 'Waiting List (যাচাইয়ের অপেক্ষায়)',
      desc: 'আপনার পেমেন্ট ও TrxID অ্যাডমিন কর্তৃক যাচাই করা হচ্ছে।',
    },
    checking: {
      title: 'Check Application (সফট কপি যাচাই)',
      desc: 'টেলিটকে পূরণকৃত সফট কপিটি দেখে অনুমোদন বা সংশোধনের নোট দিন।',
    },
    'payment-now': {
      title: 'Payment Now (সরকারি ফি পরিশোধের অপেক্ষায়)',
      desc: 'তথ্য অনুমোদন করা হয়েছে। অপারেটর এখন সরকারি টেলিটক ফি পরিশোধ করে পেইড কপি আপলোড করবেন।',
    },
    applied: {
      title: 'Applied Job (সম্পন্ন আবেদন)',
      desc: 'আবেদন সম্পূর্ণ হয়েছে! এখান থেকে আপনার Teletalk তথ্য ও অফিসিয়াল পেইড কপি দেখুন।',
    },
  };

  const currentInfo = titles[status || 'waiting'] || titles.waiting;

  return (
    <div className="space-y-6 pb-12">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-bold text-gray-900">{currentInfo.title}</h1>
        <p className="text-xs text-gray-500 mt-1">{currentInfo.desc}</p>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" text="আবেদন লোড হচ্ছে..." />
        </div>
      ) : apps.length === 0 ? (
        <EmptyState
          title="এই তালিকায় কোনো আবেদন নেই"
          description="বর্তমানে এই স্ট্যাটাসে আপনার কোনো আবেদন পেন্ডিং নেই।"
          action={
            <Link to="/jobs">
              <Button size="sm">নতুন চাকরিতে আবেদন করুন</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {apps.map((app) => (
            <div key={app.id}>
              <UserApplicationCard
                app={app}
                updatingId={updatingId}
                onApproveSoftCopy={handleApproveSoftCopy}
                onOpenCorrectionModal={(a) => {
                  setSelectedApp(a);
                  setCorrectionModalOpen(true);
                }}
              />
              <CredentialsBlock app={app} />
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={correctionModalOpen} onClose={() => setCorrectionModalOpen(false)} title="সফট কপি সংশোধনের বিবরণ লিখুন">
        <form onSubmit={handleRequestCorrection} className="space-y-4">
          <p className="text-xs text-gray-600">
            সফট কপিতে কোন তথ্যটি ভুল হয়েছে তা বিস্তারিত লিখুন যাতে অপারেটর তা সংশোধন করতে পারেন:
          </p>
          <textarea
            rows={4}
            required
            value={correctionNote}
            onChange={(e) => setCorrectionNote(e.target.value)}
            placeholder="যেমন: আমার পাসের সন ২০১৬ এর জায়গায় ২০১৭ হবে..."
            className="w-full p-3 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-emerald-600"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCorrectionModalOpen(false)}>
              বাতিল
            </Button>
            <Button type="submit" size="sm" loading={correctionSaving}>
              নোট পাঠান
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
