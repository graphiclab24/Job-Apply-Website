import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { JobApplication, ApplicationStatus } from '../../types';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../components/common/Toast';
import { UserApplicationCard } from '../../components/user/UserApplicationCard';
import { fetchUserApplications, updateApplicationStatus } from '../../services/applicationsService';

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

  const statusMap: Record<string, ApplicationStatus[]> = {
    waiting: ['waiting'],
    checking: ['checking', 'apply_now', 'correction'],
    'payment-now': ['payment_now'],
    applied: ['applied'],
  };

  const currentStatuses = statusMap[status || 'waiting'] || ['waiting'];

  const fetchApps = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch from Server / Cloudflare R2 backup (0 quota consumed)
      const serverApps = await fetchUserApplications(user.uid);
      if (serverApps.length > 0) {
        const list = serverApps
          .filter((a) => currentStatuses.includes(a.status))
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setApps(list);
        setLoading(false);
        return;
      }

      // 2. Fallback to Firestore
      const q = query(collection(db, 'applications'), where('uid', '==', user.uid));
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as JobApplication))
        .filter((a) => currentStatuses.includes(a.status))
        .sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return tB - tA;
        });
      setApps(list);
    } catch (err) {
      error('আবেদন তালিকা লোড করতে সমস্যা হয়েছে');
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
    try {
      await updateApplicationStatus(app.id, { status: 'payment_now' });
      try {
        await updateDoc(doc(db, 'applications', app.id), {
          status: 'payment_now',
          updatedAt: serverTimestamp(),
        });
      } catch {}
      success('আবেদনটি অনুমোদিত হয়েছে এবং Payment Now ধাপে পাঠানো হয়েছে।');
      fetchApps();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `applications/${app.id}`);
      error('স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRequestCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !correctionNote.trim()) {
      error('সংশোধনের বিবরণ লিখুন');
      return;
    }

    setCorrectionSaving(true);
    try {
      await updateDoc(doc(db, 'applications', selectedApp.id), {
        status: 'correction',
        correctionNote: correctionNote.trim(),
        updatedAt: serverTimestamp(),
      });
      success('সংশোধনের নোট পাঠানো হয়েছে।');
      setCorrectionModalOpen(false);
      setCorrectionNote('');
      setSelectedApp(null);
      fetchApps();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `applications/${selectedApp.id}`);
      error('সংশোধন রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে');
    } finally {
      setCorrectionSaving(false);
    }
  };

  const titles: Record<string, { title: string; desc: string }> = {
    waiting: {
      title: 'Waiting List (যাচাইয়ের অপেক্ষায়)',
      desc: 'আপনার পেমেন্ট ও TrxID অ্যাডমিন কর্তৃক যাচাই করা হচ্ছে।',
    },
    checking: {
      title: 'Check Application (সফট কপি যাচাই)',
      desc: 'টেলিটকে পূরণকৃত সফট কপিটি দেখে অনুমোদন বা সংশোধনের নোট দিন।',
    },
    'payment-now': {
      title: 'Payment Now (সরকারি ফি পরিশোধের অপেক্ষায়)',
      desc: 'তথ্য অনুমোদন করা হয়েছে। অপারেটর এখন সরকারি টেলিটক ফি পরিশোধ করে পেইড কপি আপলোড করবেন।',
    },
    applied: {
      title: 'Applied Job (সম্পন্ন আবেদন)',
      desc: 'আবেদন সম্পূর্ণ হয়েছে! এখান থেকে আপনার অফিসিয়াল পেইড কপি ডাউনলোড করুন।',
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
          title="এই তালিকায় কোনো আবেদন নেই"
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
            <UserApplicationCard
              key={app.id}
              app={app}
              updatingId={updatingId}
              onApproveSoftCopy={handleApproveSoftCopy}
              onOpenCorrectionModal={(a) => {
                setSelectedApp(a);
                setCorrectionModalOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <Modal isOpen={correctionModalOpen} onClose={() => setCorrectionModalOpen(false)} title="সফট কপি সংশোধনের বিবরণ লিখুন">
        <form onSubmit={handleRequestCorrection} className="space-y-4">
          <p className="text-xs text-gray-600">
            সফট কপিতে কোন তথ্যটি ভুল হয়েছে তা বিস্তারিত লিখুন যাতে অপারেটর তা সংশোধন করতে পারেন:
          </p>
          <textarea
            rows={4}
            required
            value={correctionNote}
            onChange={(e) => setCorrectionNote(e.target.value)}
            placeholder="যেমন: আমার পাসের সন ২০১৬ এর জায়গায় ২০১৭ হবে..."
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
