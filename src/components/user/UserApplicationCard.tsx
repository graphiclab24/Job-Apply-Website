import React, { useState } from 'react';
import { JobApplication } from '../../types';
import { Button } from '../common/Button';
import { downloadOrOpenFile, getFileId } from '../../services/files';
import { Calendar, FileDown, CheckCircle, Edit3, ExternalLink } from 'lucide-react';

interface Props {
  app: JobApplication;
  updatingId: string | null;
  onApproveSoftCopy: (app: JobApplication) => void;
  onOpenCorrectionModal: (app: JobApplication) => void;
}

export const UserApplicationCard: React.FC<Props> = ({
  app,
  updatingId,
  onApproveSoftCopy,
  onOpenCorrectionModal,
}) => {
  const [openingFile, setOpeningFile] = useState(false);

  const dateStr = app.createdAt?.toDate
    ? app.createdAt.toDate().toLocaleDateString('bn-BD')
    : 'সদ্য জমা';

  const hasSoft = Boolean(app.hasSoftCopy || app.softCopyUrl || app.softCopyPath);
  const hasPaid = Boolean(app.hasPaidCopy || app.paidCopyUrl || app.paidCopyPath);

  const handleOpenFile = async (fileId: string, filename: string, mode: 'open' | 'download' = 'open') => {
    setOpeningFile(true);
    try {
      await downloadOrOpenFile(fileId, filename, mode);
    } catch (e: any) {
      alert(e.message || 'ফাইল খুলতে সমস্যা হয়েছে');
    } finally {
      setOpeningFile(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-extrabold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md">
            {app.id}
          </span>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span>{dateStr}</span>
          </span>
        </div>

        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-bold self-start sm:self-auto ${
            app.status === 'applied'
              ? 'bg-emerald-100 text-emerald-800'
              : app.status === 'payment_now'
              ? 'bg-rose-100 text-rose-800'
              : app.status === 'correction'
              ? 'bg-amber-100 text-amber-800'
              : app.status === 'checking'
              ? 'bg-sky-100 text-sky-800'
              : app.status === 'apply_now'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {app.status === 'applied'
            ? 'Applied (পেইড কপি রেডি)'
            : app.status === 'payment_now'
            ? 'Payment Now (সরকারি ফি পরিশোধের অপেক্ষায়)'
            : app.status === 'correction'
            ? 'সংশোধন প্রক্রিয়ায়'
            : app.status === 'checking'
            ? 'সফট কপি যাচাই করুন'
            : app.status === 'apply_now'
            ? 'Teletalk-এ আবেদন প্রস্তুত হচ্ছে'
            : 'Waiting (পেমেন্ট যাচাইয়ের অপেক্ষায়)'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-gray-400 block">চাকরির নাম:</span>
          <span className="font-bold text-gray-900 line-clamp-2 break-words">{app.jobTitle}</span>
        </div>
        <div>
          <span className="text-gray-400 block">আবেদিত পদ:</span>
          <span className="font-bold text-gray-800 break-words">{app.postName}</span>
        </div>
        <div>
          <span className="text-gray-400 block">প্রার্থী:</span>
          <span className="font-semibold text-gray-800 break-words">
            {app.fullName} ({app.district})
          </span>
        </div>
        <div>
          <span className="text-gray-400 block">পেমেন্ট বিবরণ:</span>
          <span className="font-semibold text-gray-700 break-all block">
            ৳{app.fee?.total} ({app.payment?.method})
          </span>
        </div>
      </div>

      {app.correctionNote && (
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
          <span className="font-bold block mb-0.5">আপনার পাঠানো সংশোধনের নোট:</span>
          <span>{app.correctionNote}</span>
        </div>
      )}

      {app.status === 'checking' && (
        <div className="p-4 bg-sky-50 rounded-xl border border-sky-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-bold text-sky-950 text-xs">
              অপারেটর আবেদন ফর্ম পূরণ করেছেন। সফট কপিটি চেক করুন:
            </h4>
            <p className="text-[11px] text-sky-700">
              সব ঠিক থাকলে "ঠিক আছে" চাপুন, অথবা কোনো ভুল থাকলে "সংশোধন দরকার" চেপে নোট দিন।
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {app.softCopyDriveUrl ? (
              <a
                href={app.softCopyDriveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-sky-300 text-sky-800 rounded-lg text-xs font-bold hover:bg-sky-100"
              >
                <ExternalLink className="w-4 h-4 text-sky-600" />
                <span>সফট কপি দেখুন (ড্রাইভ) ↗</span>
              </a>
            ) : hasSoft ? (
              <Button
                size="sm"
                variant="outline"
                loading={openingFile}
                onClick={() => handleOpenFile(getFileId.softcopy(app.id), `softcopy_${app.id}.pdf`, 'open')}
                icon={<FileDown className="w-4 h-4 text-sky-600" />}
                className="text-sky-800 border-sky-300 bg-white hover:bg-sky-100"
              >
                সফট কপি দেখুন
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="success"
              loading={updatingId === app.id}
              onClick={() => onApproveSoftCopy(app)}
              icon={<CheckCircle className="w-3.5 h-3.5" />}
            >
              ঠিক আছে
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenCorrectionModal(app)}
              className="text-amber-700 border-amber-300 hover:bg-amber-100"
              icon={<Edit3 className="w-3.5 h-3.5" />}
            >
              সংশোধন দরকার
            </Button>
          </div>
        </div>
      )}

      {app.status === 'applied' && (
        <div className="pt-2 flex justify-end">
          {app.paidCopyDriveUrl ? (
            <a
              href={app.paidCopyDriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>অফিসিয়াল পেইড কপি ডাউনলোড করুন (ড্রাইভ) ↗</span>
            </a>
          ) : hasPaid ? (
            <Button
              variant="success"
              loading={openingFile}
              onClick={() => handleOpenFile(getFileId.paidcopy(app.id), `paidcopy_${app.id}.pdf`, 'download')}
              icon={<FileDown className="w-4 h-4" />}
            >
              অফিসিয়াল পেইড কপি ডাউনলোড করুন
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
};
