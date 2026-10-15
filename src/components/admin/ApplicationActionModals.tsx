import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Spinner } from '../common/Spinner';
import { JobApplication, CandidateProfile } from '../../types';
import {
  saveFile,
  getFile,
  deleteFile,
  getFileId,
  readPdfAsDataUrl,
  isValidDriveUrl,
  FILE_LIMITS,
} from '../../services/files';
import { loadLocalMedia } from '../../services/localMedia';
import { LocalFolderPicker } from './LocalFolderPicker';
import {
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Send,
  Link as LinkIcon,
  Upload,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Download,
} from 'lucide-react';
import { DrivePickerButton } from '../drive/DrivePickerButton';

interface RejectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  appId: string;
}

export const RejectModal: React.FC<RejectModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  appId,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setLoading(true);
    await onConfirm(reason.trim());
    setLoading(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`আবেদন বাতিল (${appId})`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-600">
          প্রার্থীর আবেদনটি বাতিল করার কারণ লিখুন। এই বার্তাটি প্রার্থীর নোটিফিকেশনে পাঠানো হবে:
        </p>
        <textarea
          rows={3}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="যেমন: ভুল Transaction ID বা অপর্যাপ্ত টাকা পাঠানো হয়েছে..."
          className="w-full p-3 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-rose-500"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            ফিরে যান
          </Button>
          <Button type="submit" variant="danger" size="sm" loading={loading}>
            বাতিল নিশ্চিত করুন
          </Button>
        </div>
      </form>
    </Modal>
  );
};

interface UploadSoftCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (result: { hasFile: boolean; driveUrl?: string }) => Promise<void>;
  app: JobApplication | null;
}

export const UploadSoftCopyModal: React.FC<UploadSoftCopyModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  app,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [useDriveInput, setUseDriveInput] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setDriveUrl('');
      setErrorMsg('');
      setUseDriveInput(false);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setErrorMsg('');

    if (selected) {
      if (selected.size > FILE_LIMITS.PDF_RAW) {
        setErrorMsg('PDF ছোট করুন অথবা Google Drive লিংক দিন');
        setUseDriveInput(true);
        setFile(null);
        return;
      }
      setFile(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app) return;
    setErrorMsg('');

    if (useDriveInput || driveUrl) {
      if (!isValidDriveUrl(driveUrl)) {
        setErrorMsg('শুধুমাত্র drive.google.com বা docs.google.com লিংক গ্রহণযোগ্য');
        return;
      }
      setLoading(true);
      try {
        await onUpload({ hasFile: false, driveUrl: driveUrl.trim() });
        onClose();
      } catch (err: any) {
        setErrorMsg(err.message || 'সেভ করতে সমস্যা হয়েছে');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!file) {
      setErrorMsg('অনুগ্রহ করে ফাইল নির্বাচন করুন অথবা ড্রাইভ লিংক দিন');
      return;
    }

    setLoading(true);
    try {
      const readResult = await readPdfAsDataUrl(file);
      await saveFile({
        id: getFileId.softcopy(app.id),
        ownerUid: app.uid,
        kind: 'softcopy',
        appId: app.id,
        mime: file.type || 'application/pdf',
        sizeBytes: readResult.sizeBytes,
        data: readResult.dataUrl,
      });

      await onUpload({ hasFile: true });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'সফট কপি সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`সফট কপি সরবরাহ (${app?.id || ''})`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-600 leading-relaxed">
          Teletalk পোর্টালে ফর্ম পূরণের পর প্রাপ্ত সফট কপি PDF (সর্বোচ্চ ৬৫০ KB) আপলোড করুন অথবা গুগল ড্রাইভ লিংক দিন।
        </p>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              সফট কপি ফাইল আপলোড (PDF/Image, সর্বোচ্চ ৬৫০ KB)
            </label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileChange}
              disabled={loading}
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-sky-50 file:text-sky-700"
            />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-bold text-gray-700">
                অথবা Google Drive স্টোরেজ থেকে লিংক দিন:
              </label>
              <div className="flex items-center gap-2">
                <DrivePickerButton
                  acceptMime="pdf"
                  label="Google Drive থেকে বাছুন / আপলোড করুন"
                  onSelectDriveUrl={(url) => {
                    setDriveUrl(url);
                    setUseDriveInput(true);
                    setErrorMsg('');
                  }}
                />
                {!useDriveInput && !driveUrl && (
                  <button
                    type="button"
                    onClick={() => setUseDriveInput(true)}
                    className="text-[11px] text-emerald-700 font-semibold hover:underline"
                  >
                    লিংক লিখুন
                  </button>
                )}
              </div>
            </div>

            {(useDriveInput || driveUrl) && (
              <Input
                label=""
                placeholder="https://drive.google.com/file/d/.../view"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                helperText="Google Drive শেয়ারেবল লিংক"
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            বাতিল
          </Button>
          <Button type="submit" size="sm" loading={loading} disabled={!file && !driveUrl}>
            সংরক্ষণ ও প্রার্থীকে পাঠান
          </Button>
        </div>
      </form>
    </Modal>
  );
};

interface CompletePaidModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadPaid: (result: { hasFile: boolean; driveUrl?: string }) => Promise<void>;
  app: JobApplication | null;
}

export const CompletePaidModal: React.FC<CompletePaidModalProps> = ({
  isOpen,
  onClose,
  onUploadPaid,
  app,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [useDriveInput, setUseDriveInput] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setDriveUrl('');
      setErrorMsg('');
      setUseDriveInput(false);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setErrorMsg('');

    if (selected) {
      if (selected.size > FILE_LIMITS.PDF_RAW) {
        setErrorMsg('PDF ছোট করুন অথবা Google Drive লিংক দিন');
        setUseDriveInput(true);
        setFile(null);
        return;
      }
      setFile(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app) return;
    setErrorMsg('');

    if (useDriveInput || driveUrl) {
      if (!isValidDriveUrl(driveUrl)) {
        setErrorMsg('শুধুমাত্র drive.google.com বা docs.google.com লিংক গ্রহণযোগ্য');
        return;
      }
      setLoading(true);
      try {
        // অস্থায়ী সফট কপি মুছে ফেলা
        try {
          await deleteFile(getFileId.softcopy(app.id));
        } catch (e) {
          // Ignore
        }

        await onUploadPaid({ hasFile: false, driveUrl: driveUrl.trim() });
        onClose();
      } catch (err: any) {
        setErrorMsg(err.message || 'সেভ করতে সমস্যা হয়েছে');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!file) {
      setErrorMsg('অনুগ্রহ করে পেইড কপি ফাইল আপলোড করুন অথবা ড্রাইভ লিংক দিন');
      return;
    }

    setLoading(true);
    try {
      const readResult = await readPdfAsDataUrl(file);

      await saveFile({
        id: getFileId.paidcopy(app.id),
        ownerUid: app.uid,
        kind: 'paidcopy',
        appId: app.id,
        mime: file.type || 'application/pdf',
        sizeBytes: readResult.sizeBytes,
        data: readResult.dataUrl,
      });

      // পেইড কপি সেভ হলে অস্থায়ী সফট কপি মুছবে
      try {
        await deleteFile(getFileId.softcopy(app.id));
      } catch (e) {
        // Non-fatal if soft copy did not exist
      }

      await onUploadPaid({ hasFile: true });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'পেইড কপি সংরক্ষণ করতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`আবেদন সম্পন্ন ও পেইড কপি প্রদান (${app?.id || ''})`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-900 space-y-1">
          <span className="font-bold block">টেলিটক ফি পরিশোধ নিশ্চিত করুন:</span>
          <span>সরকারি ফি পরিশোধের পর প্রাপ্ত অফিসিয়াল পেইড কপি PDF (≤650 KB) আপলোড করুন অথবা গুগল ড্রাইভ লিংক দিন। পেইড কপি সেভ হওয়ার পর আগের অস্থায়ী সফট কপি ডকুমেন্ট স্বয়ংক্রিয়ভাবে মুছে যাবে।</span>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              পেইড কপি PDF (বাধ্যতামূলক, সর্বোচ্চ ৬৫০ KB) <span className="text-rose-500">*</span>
            </label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileChange}
              disabled={loading}
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-50 file:text-emerald-700"
            />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-bold text-gray-700">
                অথবা Google Drive স্টোরেজ থেকে লিংক দিন:
              </label>
              <div className="flex items-center gap-2">
                <DrivePickerButton
                  acceptMime="pdf"
                  label="Google Drive থেকে বাছুন / আপলোড করুন"
                  onSelectDriveUrl={(url) => {
                    setDriveUrl(url);
                    setUseDriveInput(true);
                    setErrorMsg('');
                  }}
                />
                {!useDriveInput && !driveUrl && (
                  <button
                    type="button"
                    onClick={() => setUseDriveInput(true)}
                    className="text-[11px] text-emerald-700 font-semibold hover:underline"
                  >
                    লিংক লিখুন
                  </button>
                )}
              </div>
            </div>

            {(useDriveInput || driveUrl) && (
              <Input
                label=""
                placeholder="https://drive.google.com/file/d/.../view"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                helperText="Google Drive শেয়ারেবল লিংক"
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            বাতিল
          </Button>
          <Button type="submit" variant="success" size="sm" loading={loading} disabled={!file && !driveUrl}>
            সম্পন্ন করুন (Mark Applied)
          </Button>
        </div>
      </form>
    </Modal>
  );
};

interface AutofillModalProps {
  isOpen: boolean;
  onClose: () => void;
  app: JobApplication | null;
  profile: CandidateProfile | null;
}

export const AutofillModal: React.FC<AutofillModalProps> = ({
  isOpen,
  onClose,
  app,
  profile,
}) => {
  const [copied, setCopied] = useState(false);
  const [posted, setPosted] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState<number>(60);
  const [photoData, setPhotoData] = useState<string>('');
  const [sigData, setSigData] = useState<string>('');
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isOpen || !app || !profile) return;

    const loadFiles = async () => {
      setLoadingMedia(true);
      try {
        // 1. প্রার্থীর মোবাইল নম্বরের ফোল্ডার থেকে
        const local = await loadLocalMedia(app.smsNumber || app.mobile || '');
        if (local.photo) setPhotoData(local.photo);
        if (local.signature) setSigData(local.signature);

        // 2. ফোল্ডারে না থাকলে আগের উৎস
        if (!local.photo) {
          const photoDoc = await getFile(getFileId.photo(app.uid));
          if (photoDoc?.data) setPhotoData(photoDoc.data);
          else if (profile.photoUrl) setPhotoData(profile.photoUrl);
          else if (profile.data?.photoDataUrl) setPhotoData(profile.data.photoDataUrl);
        }
        if (!local.signature) {
          const sigDoc = await getFile(getFileId.signature(app.uid));
          if (sigDoc?.data) setSigData(sigDoc.data);
          else if (profile.signatureUrl) setSigData(profile.signatureUrl);
          else if (profile.data?.signatureDataUrl) setSigData(profile.data.signatureDataUrl);
        }
      } catch (e) {
        // Fallback
      } finally {
        setLoadingMedia(false);
      }
    };
    loadFiles();
  }, [isOpen, app, profile, reloadKey]);

  const [extensionAck, setExtensionAck] = useState<string | null>(null);

  useEffect(() => {
    const handleAck = (event: MessageEvent) => {
      if (event.data?.type === 'CAREER_PORTAL_AUTOFILL_ACK') {
        setExtensionAck(event.data.profileName || 'প্রার্থী');
        setPosted(true);
      }
    };
    window.addEventListener('message', handleAck);
    return () => window.removeEventListener('message', handleAck);
  }, []);

  if (!app || !profile) return null;

  const autofillPayload = {
    ...profile.data,
    id: app.id,
    appId: app.id,
    uid: app.uid,
    jobId: app.jobId,
    jobTitle: app.jobTitle,
    postName: app.postName,
    district: app.district,
    applyLink: app.applyLink || '',
    educationLevel: app.educationLevel,
    smsNumber: app.smsNumber,
    mobile: app.smsNumber || app.mobile,
    mobileConfirm: app.smsNumber || app.mobile,
    fullName: profile.data?.fullName || app.fullName,
    name: profile.data?.fullName || app.fullName,
    photoDataUrl: photoData || undefined,
    signatureDataUrl: sigData || undefined,
    sessionMinutes: sessionMinutes,
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(autofillPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendAutofill = (openPortal = false) => {
    // 1. window.postMessage for Chrome extension content script
    window.postMessage(
      {
        type: 'CAREER_PORTAL_AUTOFILL',
        source: 'CAREER_PORTAL_ADMIN',
        payload: autofillPayload,
      },
      '*'
    );

    // 2. CustomEvent for content script
    document.dispatchEvent(
      new CustomEvent('CAREER_PORTAL_AUTOFILL', {
        detail: autofillPayload,
      })
    );

    // 3. Fallback localStorage
    try {
      localStorage.setItem('CAREER_PORTAL_AUTOFILL_ACTIVE', JSON.stringify({
        timestamp: Date.now(),
        payload: autofillPayload,
      }));
    } catch {}

    setPosted(true);

    if (openPortal && app.applyLink) {
      window.open(app.applyLink, '_blank');
    }

    setTimeout(() => setPosted(false), 3500);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`অটোফিল ডাটা: ${app.fullName} (${app.id})`}>
      <div className="space-y-4">
        {/* Official Teletalk Portal link banner */}
        {app.applyLink ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <span className="font-bold text-emerald-900 block mb-0.5">অফিসিয়াল Teletalk আবেদন লিংক:</span>
              <a
                href={app.applyLink}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:text-emerald-900 underline font-mono truncate block"
              >
                {app.applyLink}
              </a>
            </div>
            <a
              href={app.applyLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shrink-0 shadow-xs"
            >
              <span>পোর্টাল খুলুন</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs">
            ⚠️ এই সার্কুলারে টেলিটক আবেদন লিংক যুক্ত নেই। সার্কুলার সম্পাদনায় গিয়ে লিংক যুক্ত করতে পারেন।
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div><span className="text-gray-400">নাম:</span> <strong>{profile.data?.fullName || app.fullName}</strong></div>
          <div><span className="text-gray-400">পদ:</span> <strong>{app.postName}</strong></div>
          <div><span className="text-gray-400">পিতা:</span> <strong>{profile.data?.fatherName}</strong></div>
          <div><span className="text-gray-400">মাতা:</span> <strong>{profile.data?.motherName}</strong></div>
          <div><span className="text-gray-400">মোবাইল:</span> <strong>{app.smsNumber}</strong></div>
          <div><span className="text-gray-400">NID:</span> <strong>{profile.data?.nidNo || 'নেই'}</strong></div>
          <div><span className="text-gray-400">জেলা:</span> <strong>{profile.data?.permanentDistrict}</strong></div>
          <div><span className="text-gray-400">উপজেলা:</span> <strong>{profile.data?.permanentUpazila}</strong></div>
        </div>

        {/* Loaded Photo & Signature preview */}
        <div className="p-3 bg-white rounded-lg border border-gray-200 flex items-center justify-around gap-4">
          <div className="text-center">
            <span className="text-[10px] text-gray-500 block mb-1">প্রার্থীর ছবি (৩০০×৩০০)</span>
            {loadingMedia ? (
              <Spinner size="sm" />
            ) : photoData ? (
              <img src={photoData} alt="Photo" className="w-16 h-16 object-cover rounded border border-gray-300 mx-auto" />
            ) : (
              <span className="text-[10px] text-gray-400">ছবি পাওয়া যায়নি</span>
            )}
          </div>

          <div className="text-center">
            <span className="text-[10px] text-gray-500 block mb-1">স্বাক্ষর (৩০০×৮০)</span>
            {loadingMedia ? (
              <Spinner size="sm" />
            ) : sigData ? (
              <img src={sigData} alt="Signature" className="h-10 w-24 object-contain rounded border border-gray-300 mx-auto bg-white" />
            ) : (
              <span className="text-[10px] text-gray-400">স্বাক্ষর পাওয়া যায়নি</span>
            )}
          </div>
        </div>

        {/* Session duration & Temporary Session Info */}
        <div className="p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50/40 border border-emerald-200 rounded-xl space-y-2 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="font-bold text-emerald-900 flex items-center gap-1.5">
              <span>⏱️ এক্সটেনশনে ডাটা মনে রাখার সময়সীমা:</span>
            </span>
            <select
              value={sessionMinutes}
              onChange={(e) => setSessionMinutes(Number(e.target.value))}
              className="bg-white border border-emerald-300 rounded-lg px-2.5 py-1 text-xs text-emerald-900 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs"
            >
              <option value={30}>৩০ মিনিট (অস্থায়ী সেশন)</option>
              <option value={60}>১ ঘণ্টা (স্ট্যান্ডার্ড)</option>
              <option value={120}>২ ঘণ্টা</option>
              <option value={360}>৬ ঘণ্টা</option>
              <option value={1440}>১ দিন</option>
            </select>
          </div>
          <p className="text-[11px] text-emerald-700 leading-relaxed">
            💡 <strong>কোনো প্রোফাইল সেভ হবে না:</strong> প্রার্থীর তথ্য এক্সটেনশনের অস্থায়ী সেশনে সংরক্ষিত থাকবে। টেলিটক পোর্টালে গিয়ে উপরে ফ্লোটিং বারে <strong>"এক ক্লিকে ফর্ম পূরণ করুন"</strong> চাপলেই সব পূরণ হবে এবং ছবির পেজে ছবি-স্বাক্ষর নিজে থেকেই অ্যাটাচ হয়ে যাবে!
          </p>
        </div>

        {extensionAck && (
          <div className="p-2.5 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>এক্সটেনশনে [{extensionAck}] এর তথ্য সফলভাবে সক্রিয় হয়েছে! Teletalk পেজে গিয়ে ফ্লোটিং বার থেকে এক ক্লিকে পূরণ করতে পারবেন।</span>
          </div>
        )}

        {/* ফোল্ডার থেকে ছবি-স্বাক্ষর (ডেস্কটপ Chrome/Edge) */}
        <LocalFolderPicker onChanged={() => setReloadKey((k) => k + 1)} />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            {app.applyLink ? (
              <Button
                size="sm"
                onClick={() => handleSendAutofill(true)}
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                className="bg-emerald-700 hover:bg-emerald-800 shadow-xs"
              >
                Autofill-এ পাঠান ও Teletalk খুলুন ↗
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleSendAutofill(false)}
              icon={posted ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            >
              {posted ? 'অস্থায়ী সেশনে সক্রিয় ✓' : 'Autofill-এ পাঠান'}
            </Button>
          </div>
        </div>

        {/* Optional JSON details for Admin */}
        <details className="pt-1 text-xs text-gray-500 border-t border-gray-100">
          <summary className="cursor-pointer hover:text-gray-700 font-medium py-1">
            Advanced / অপশনাল: JSON ডাটা দেখুন ও কপি করুন
          </summary>
          <div className="mt-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-600">প্রয়োজনে ম্যানুয়াল টেস্ট বা ডিবাগিংয়ের জন্য JSON কপি করতে পারেন।</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyJSON}
              icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copied ? 'কপি হয়েছে' : 'JSON কপি'}
            </Button>
          </div>
        </details>

        {/* Extension Download notice */}
        <div className="pt-2 text-center border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-center gap-2">
          <span>ক্রোম এক্সটেনশন প্রয়োজন?</span>
          <a
            href="/bd-job-autofill-extension.zip"
            download="bd-job-autofill-extension.zip"
            className="text-emerald-700 hover:underline font-semibold inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            <span>Autofill Extension (.zip) ডাউনলোড করুন</span>
          </a>
        </div>
      </div>
    </Modal>
  );
};
