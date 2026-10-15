import React, { useState } from 'react';
import { JobApplication } from '../../types';
import { Button } from '../common/Button';
import { downloadOrOpenFile, getFileId } from '../../services/files';
import {
  MessageCircle,
  XCircle,
  CheckCircle,
  ExternalLink,
  Send,
  Upload,
  FileDown,
  CheckCheck,
  AlertTriangle,
  Image as ImageIcon,
} from 'lucide-react';

interface Props {
  app: JobApplication;
  onReject: (app: JobApplication) => void;
  onVerifyPayment: (app: JobApplication) => void;
  onOpenAutofill: (app: JobApplication) => void;
  onOpenSoftCopyModal: (app: JobApplication) => void;
  onOpenCompleteModal: (app: JobApplication) => void;
}

export const ApplicationCardItem: React.FC<Props> = ({
  app,
  onReject,
  onVerifyPayment,
  onOpenAutofill,
  onOpenSoftCopyModal,
  onOpenCompleteModal,
}) => {
  const [openingFile, setOpeningFile] = useState(false);

  const getWhatsAppLink = (mobileNo: string, appId: string) => {
    const cleanNum = mobileNo.replace(/\D/g, '');
    const intlNum = cleanNum.startsWith('880') ? cleanNum : `880${cleanNum.replace(/^0/, '')}`;
    const msg = encodeURIComponent(`হ্যালো, আপনার চাকরি আবেদন আইডি (${appId}) নিয়ে যোগাযোগ করছি...`);
    return `https://wa.me/${intlNum}?text=${msg}`;
  };

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

  const dateStr = app.createdAt?.toDate
    ? app.createdAt.toDate().toLocaleString('bn-BD')
    : 'সদ্য জমা';

  const hasScreenshot = Boolean(app.payment?.hasScreenshot || app.payment?.screenshotUrl || app.payment?.screenshotPath);
  const hasSoft = Boolean(app.hasSoftCopy || app.softCopyUrl || app.softCopyPath);
  const hasPaid = Boolean(app.hasPaidCopy || app.paidCopyUrl || app.paidCopyPath);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-extrabold bg-gray-100 text-gray-800 px-2.5 py-1 rounded">
            {app.id}
          </span>
          <span className="text-xs text-gray-500">{dateStr}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {app.mobile && (
            <a
              href={getWhatsAppLink(app.mobile, app.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>হোয়াটসঅ্যাপ</span>
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-gray-400 block mb-0.5">চাকরির নাম:</span>
          <span className="font-bold text-gray-900 block break-words">{app.jobTitle}</span>
        </div>
        <div>
          <span className="text-gray-400 block mb-0.5">পদ ও জেলা:</span>
          <span className="font-bold text-gray-800 block break-words">
            {app.postName} ({app.district})
          </span>
        </div>
        <div>
          <span className="text-gray-400 block mb-0.5">প্রার্থীর নাম ও মোবাইল:</span>
          <span className="font-semibold text-gray-900 block break-words">{app.fullName}</span>
          <span className="text-[11px] text-gray-500 block break-words">{app.smsNumber || app.mobile}</span>
        </div>
        <div>
          <span className="text-gray-400 block mb-0.5">পেমেন্ট বিবরণ:</span>
          <span className="font-semibold text-gray-800 block break-all">
            ৳{app.fee?.total} ({app.payment?.method})
          </span>
          {app.payment?.senderNumber && (
            <span className="text-[10px] text-gray-500 block break-words">প্রেরক: {app.payment.senderNumber}</span>
          )}
        </div>
      </div>

      {/* Official Teletalk Apply Link Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-lg text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-emerald-900 shrink-0">অফিসিয়াল Teletalk আবেদন লিংক:</span>
          {app.applyLink ? (
            <a
              href={app.applyLink}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 hover:text-emerald-900 hover:underline font-mono truncate max-w-xs sm:max-w-md md:max-w-lg"
              title={app.applyLink}
            >
              {app.applyLink}
            </a>
          ) : (
            <span className="text-amber-700 italic">বিজ্ঞপ্তিতে লিংক যুক্ত নেই</span>
          )}
        </div>
        {app.applyLink && (
          <a
            href={app.applyLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded transition-colors shadow-xs"
          >
            <span>পোর্টাল খুলুন</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Payment screenshot button */}
      {hasScreenshot && (
        <div className="text-xs pt-1">
          <button
            type="button"
            disabled={openingFile}
            onClick={() => handleOpenFile(getFileId.screenshot(app.id), `screenshot_${app.id}.jpg`, 'open')}
            className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold hover:underline bg-emerald-50 px-2.5 py-1 rounded"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>পেমেন্ট স্ক্রিনশট দেখুন (getFile) ↗</span>
          </button>
        </div>
      )}

      {app.correctionNote && (
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
          <span className="font-bold block mb-0.5 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>প্রার্থীর সংশোধনের অনুরোধ:</span>
          </span>
          <span>{app.correctionNote}</span>
        </div>
      )}

      <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2">
        {app.status === 'waiting' && (
          <>
            <Button size="sm" variant="danger" onClick={() => onReject(app)} icon={<XCircle className="w-3.5 h-3.5" />}>
              বাতিল
            </Button>
            <Button size="sm" variant="success" onClick={() => onVerifyPayment(app)} icon={<CheckCircle className="w-3.5 h-3.5" />}>
              যাচাই OK (Apply Now)
            </Button>
          </>
        )}

        {app.status === 'apply_now' && (
          <>
            {app.applyLink ? (
              <a href={app.applyLink} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-700 hover:bg-emerald-50" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                  Teletalk লিংক খুলুন ↗
                </Button>
              </a>
            ) : (
              <Button size="sm" variant="outline" disabled title="বিজ্ঞপ্তিতে টেলিটক লিংক নেই">
                Teletalk লিংক নেই
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => onOpenAutofill(app)} icon={<Send className="w-3.5 h-3.5" />}>
              Autofill-এ পাঠান
            </Button>
            <Button size="sm" onClick={() => onOpenSoftCopyModal(app)} icon={<Upload className="w-3.5 h-3.5" />}>
              সফট কপি সরবরাহ
            </Button>
          </>
        )}

        {(app.status === 'checking' || app.status === 'correction') && (
          <>
            {app.softCopyDriveUrl ? (
              <a href={app.softCopyDriveUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                  সফট কপি দেখুন (ড্রাইভ) ↗
                </Button>
              </a>
            ) : hasSoft ? (
              <Button
                size="sm"
                variant="outline"
                loading={openingFile}
                onClick={() => handleOpenFile(getFileId.softcopy(app.id), `softcopy_${app.id}.pdf`, 'open')}
                icon={<FileDown className="w-3.5 h-3.5" />}
              >
                বর্তমান সফট কপি দেখুন
              </Button>
            ) : null}

            <Button size="sm" onClick={() => onOpenSoftCopyModal(app)} icon={<Upload className="w-3.5 h-3.5" />}>
              সংশোধিত সফট কপি আপলোড
            </Button>
          </>
        )}

        {app.status === 'payment_now' && (
          <Button size="sm" variant="success" onClick={() => onOpenCompleteModal(app)} icon={<CheckCheck className="w-3.5 h-3.5" />}>
            Complete (পেইড কপি আপলোড)
          </Button>
        )}

        {app.status === 'applied' && (
          <>
            {app.paidCopyDriveUrl ? (
              <a href={app.paidCopyDriveUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                  পেইড কপি দেখুন (ড্রাইভ) ↗
                </Button>
              </a>
            ) : hasPaid ? (
              <Button
                size="sm"
                variant="outline"
                loading={openingFile}
                onClick={() => handleOpenFile(getFileId.paidcopy(app.id), `paidcopy_${app.id}.pdf`, 'open')}
                icon={<FileDown className="w-3.5 h-3.5" />}
              >
                পেইড কপি PDF দেখুন
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};
