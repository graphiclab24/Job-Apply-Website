import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { JobApplication, CandidateProfile, ApplicationStatus } from '../../types';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { useAuth } from '../../context/AuthContext';
import { canTransitionStatus, createUserNotification } from '../../utils/statusTransitions';
import { updateApplicationStatus, fetchApplications } from '../../services/applicationsService';
import { ApplicationCardItem } from '../../components/admin/ApplicationCardItem';
import {
  RejectModal,
  UploadSoftCopyModal,
  CompletePaidModal,
  AutofillModal,
} from '../../components/admin/ApplicationActionModals';
import { Download } from 'lucide-react';

export const AdminApplicationsPage: React.FC = () => {
  const { step } = useParams<{ step: string }>();
  const { user } = useAuth();
  const { success, error } = useToast();

  const [apps, setApps] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeApp, setActiveApp] = useState<JobApplication | null>(null);
  const [activeProfile, setActiveProfile] = useState<CandidateProfile | null>(null);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [softCopyModalOpen, setSoftCopyModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [autofillModalOpen, setAutofillModalOpen] = useState(false);

  // In-memory cache for job applyLinks to avoid repeated reads
  const jobLinksRef = useRef<Record<string, string>>({});

  const enrichApplications = async (list: JobApplication[]): Promise<JobApplication[]> => {
    const missingJobIds = Array.from(
      new Set(list.filter((a) => !a.applyLink && a.jobId).map((a) => a.jobId))
    );

    if (missingJobIds.length > 0) {
      await Promise.all(
        missingJobIds.map(async (jId) => {
          if (jobLinksRef.current[jId] !== undefined) return;
          try {
            const jSnap = await getDoc(doc(db, 'jobs', jId));
            if (jSnap.exists()) {
              const jData = jSnap.data();
              jobLinksRef.current[jId] = jData.applyLink || '';
            } else {
              jobLinksRef.current[jId] = '';
            }
          } catch {
            jobLinksRef.current[jId] = '';
          }
        })
      );
    }

    return list.map((a) => {
      if (!a.applyLink && a.jobId && jobLinksRef.current[a.jobId]) {
        return { ...a, applyLink: jobLinksRef.current[a.jobId] };
      }
      return a;
    });
  };

  const stepStatusMap: Record<string, ApplicationStatus[]> = {
    waiting: ['waiting'],
    'apply-now': ['apply_now'],
    check: ['checking', 'correction'],
    'payment-now': ['payment_now'],
    complete: ['applied'],
    rejected: ['rejected'],
  };

  const currentStep = step || 'waiting';
  const targetStatuses = stepStatusMap[currentStep] || ['waiting'];
  const isActivePipeline = ['waiting', 'apply-now', 'check', 'payment-now'].includes(currentStep);

  useEffect(() => {
    setLoading(true);

    // Rule: onSnapshot for admin's active ongoing pipeline, getDocs once for completed/rejected
    if (isActivePipeline) {
      const q = query(
        collection(db, 'applications'),
        where('status', 'in', targetStatuses)
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() } as JobApplication))
            .sort((a, b) => {
              const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
              const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
              return tB - tA;
            });
          enrichApplications(list).then((enriched) => {
            setApps(enriched);
            setLoading(false);
          });
        },
        (err) => {
          console.error('Snapshot error:', err);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } else {
      // Completed or Rejected: single getDocs query
      const fetchOnce = async () => {
        try {
          const q = query(
            collection(db, 'applications'),
            where('status', 'in', targetStatuses)
          );
          const snap = await getDocs(q);
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as JobApplication))
            .sort((a, b) => {
              const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
              const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
              return tB - tA;
            });
          const enriched = await enrichApplications(list);
          setApps(enriched);
        } catch (err) {
          error('আবেদন তালিকা লোড করতে ব্যর্থ হয়েছে');
        } finally {
          setLoading(false);
        }
      };

      fetchOnce();
    }
  }, [step]);

  const handleVerifyPayment = async (app: JobApplication) => {
    if (!canTransitionStatus(app.status, 'apply_now')) {
      error('এই স্ট্যাটাস পরিবর্তন অনুমোদিত নয়');
      return;
    }

    try {
      await updateDoc(doc(db, 'applications', app.id), {
        status: 'apply_now',
        'payment.verified': true,
        'payment.verifiedAt': serverTimestamp(),
        'payment.verifiedBy': user?.email || 'admin',
        updatedAt: serverTimestamp(),
      });

      await createUserNotification(
        app.uid,
        app.id,
        'পেমেন্ট যাচাই সফল হয়েছে',
        `আপনার আবেদন (${app.id})-এর ফি যাচাই করা হয়েছে। অপারেটর এখন Teletalk পোর্টালে ফর্ম পূরণ করছেন।`
      );

      success('পেমেন্ট যাচাই সফল! আবেদনটি Apply Now তালিকায় পাঠানো হয়েছে।');
    } catch (err) {
      error('আপডেট করতে ব্যর্থ হয়েছে');
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!activeApp) return;
    try {
      await updateApplicationStatus(activeApp.id, {
        status: 'rejected',
        rejectReason: reason,
      });

      try {
        await updateDoc(doc(db, 'applications', activeApp.id), {
          status: 'rejected',
          rejectReason: reason,
          updatedAt: serverTimestamp(),
        });
      } catch {}

      await createUserNotification(
        activeApp.uid,
        activeApp.id,
        'আবেদন বাতিল করা হয়েছে',
        `আপনার আবেদন (${activeApp.id}) বাতিল করা হয়েছে। কারণ: ${reason}`
      );

      success('আবেদনটি বাতিল করা হয়েছে।');
    } catch (err) {
      error('বাতিল করতে ব্যর্থ হয়েছে');
    }
  };

  const handleOpenAutofill = async (app: JobApplication) => {
    setActiveApp(app);
    try {
      const snap = await getDoc(doc(db, 'profiles', app.uid));
      if (snap.exists()) {
        setActiveProfile(snap.data() as CandidateProfile);
        setAutofillModalOpen(true);
      } else {
        error('প্রার্থীর সিভি প্রোফাইল পাওয়া যায়নি');
      }
    } catch (e) {
      error('প্রোফাইল লোড করতে সমস্যা হয়েছে');
    }
  };

  const handleUploadSoftCopy = async (result: { hasFile: boolean; driveUrl?: string }) => {
    if (!activeApp) return;
    try {
      await updateApplicationStatus(activeApp.id, {
        status: 'checking',
        softCopyUrl: result.driveUrl || '',
      });

      try {
        await updateDoc(doc(db, 'applications', activeApp.id), {
          status: 'checking',
          hasSoftCopy: result.hasFile,
          softCopyDriveUrl: result.driveUrl || null,
          updatedAt: serverTimestamp(),
        });
      } catch {}

      await createUserNotification(
        activeApp.uid,
        activeApp.id,
        'সফট কপি প্রস্তুত হয়েছে',
        `আপনার আবেদন (${activeApp.id})-এর সফট কপি প্রস্তুত হয়েছে। Check Application পেজে গিয়ে সফট কপিটি দেখে অনুমোদন দিন।`
      );

      success('সফট কপি সফলভাবে প্রার্থীকে পাঠানো হয়েছে!');
    } catch (err) {
      error('সফট কপি আপডেট করতে সমস্যা হয়েছে');
    }
  };

  const handleCompletePaid = async (result: { hasFile: boolean; driveUrl?: string }) => {
    if (!activeApp) return;
    try {
      await updateApplicationStatus(activeApp.id, {
        status: 'applied',
        paidCopyUrl: result.driveUrl || '',
      });

      try {
        await updateDoc(doc(db, 'applications', activeApp.id), {
          status: 'applied',
          hasPaidCopy: result.hasFile,
          paidCopyDriveUrl: result.driveUrl || null,
          hasSoftCopy: false,
          softCopyDriveUrl: null,
          updatedAt: serverTimestamp(),
        });
      } catch {}

      await createUserNotification(
        activeApp.uid,
        activeApp.id,
        'আবেদন সম্পন্ন! পেইড কপি ডাউনলোড করুন',
        `অভিনন্দন! আপনার আবেদন (${activeApp.id}) সফলভাবে সম্পন্ন হয়েছে এবং অফিসিয়াল পেইড কপি সরবরাহ করা হয়েছে।`
      );

      success('আবেদন সম্পন্ন হয়েছে এবং পেইড কপি যুক্ত হয়েছে!');
    } catch (err) {
      error('পেইড কপি সংরক্ষণ করতে সমস্যা হয়েছে');
    }
  };

  const pageTitles: Record<string, string> = {
    waiting: '১. Waiting List (পেমেন্ট যাচাই)',
    'apply-now': '২. Apply Now (Teletalk আবেদন ও সফট কপি)',
    check: '৩. Check Application (প্রার্থী রিভিউ ও সংশোধন)',
    'payment-now': '৪. Payment Now (টেলিটক ফি পরিশোধ)',
    complete: '৫. Complete (সম্পন্ন আবেদন ও পেইড কপি)',
    rejected: 'বাতিলকৃত আবেদনসমূহ',
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{pageTitles[currentStep] || 'আবেদন তালিকা'}</h2>
          <p className="text-xs text-gray-500 mt-0.5">মোট আবেদন সংখ্যা: {apps.length}টি</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/bd-job-autofill-extension.zip"
            download="bd-job-autofill-extension.zip"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold border border-emerald-200 transition-colors shadow-xs"
            title="ব্রাউজারে এক্সটেনশন ইনস্টল করতে ডাউনলোড করুন"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Autofill Extension ডাউনলোড (.zip)</span>
          </a>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" text="আবেদন লোড হচ্ছে..." />
        </div>
      ) : apps.length === 0 ? (
        <EmptyState title="এই ধাপে কোনো আবেদন নেই" description="বর্তমানে এই পাইপলাইনে কোনো পেন্ডিং আবেদন পাওয়া যায়নি।" />
      ) : (
        <div className="space-y-4">
          {apps.map((app) => (
            <ApplicationCardItem
              key={app.id}
              app={app}
              onReject={(a) => {
                setActiveApp(a);
                setRejectModalOpen(true);
              }}
              onVerifyPayment={handleVerifyPayment}
              onOpenAutofill={handleOpenAutofill}
              onOpenSoftCopyModal={(a) => {
                setActiveApp(a);
                setSoftCopyModalOpen(true);
              }}
              onOpenCompleteModal={(a) => {
                setActiveApp(a);
                setCompleteModalOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <RejectModal isOpen={rejectModalOpen} onClose={() => setRejectModalOpen(false)} appId={activeApp?.id || ''} onConfirm={handleRejectConfirm} />
      <UploadSoftCopyModal isOpen={softCopyModalOpen} onClose={() => setSoftCopyModalOpen(false)} app={activeApp} onUpload={handleUploadSoftCopy} />
      <CompletePaidModal isOpen={completeModalOpen} onClose={() => setCompleteModalOpen(false)} app={activeApp} onUploadPaid={handleCompletePaid} />
      <AutofillModal isOpen={autofillModalOpen} onClose={() => setAutofillModalOpen(false)} app={activeApp} profile={activeProfile} />
    </div>
  );
};
