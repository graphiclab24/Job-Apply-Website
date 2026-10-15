import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { doc, getDoc, serverTimestamp, collection, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import {
  saveFile,
  getFileId,
  compressImageToDataUrl,
  FILE_LIMITS,
} from '../../services/files';
import { PaymentSettings, PaymentMethod } from '../../types';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { PaymentHeaderReference } from '../../components/payment/PaymentHeaderReference';
import { useToast } from '../../components/common/Toast';
import { invalidateCache } from '../../services/cache';
import { isValidMobile } from '../../utils/auth';
import { submitJobApplication } from '../../services/applicationsService';
import { Copy, Check, AlertCircle, ArrowRight } from 'lucide-react';

export const ApplicationPaymentPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error } = useToast();
  const state = location.state as any;

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    bkashNumber: '01704368053',
    rocketNumber: '01771522503',
    nagadNumber: '01771522503',
    instructions: 'bKash, Rocket বা Nagad অ্যাপ থেকে Send Money করুন এবং Reference-এ আপনার আবেদন আইডি দিন।',
    whatsappNumber: '01704368053',
  });

  const [method, setMethod] = useState<PaymentMethod>('bkash');
  const [senderNumber, setSenderNumber] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotUploading, setScreenshotUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'payment'));
        if (snap.exists()) {
          setPaymentSettings(snap.data() as PaymentSettings);
        }
      } catch (e) {
        // Fallback silently
      }
    };
    fetchSettings();
  }, []);

  if (!state || !state.appId || !state.jobId) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-xl border border-gray-200 text-center space-y-3">
        <p className="text-sm font-semibold text-gray-800">কোনো সক্রিয় আবেদন পাওয়া যায়নি।</p>
        <Link to="/jobs">
          <Button size="sm">চাকরি খুঁজুন</Button>
        </Link>
      </div>
    );
  }

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    const cleanSender = senderNumber.trim();

    if (!isValidMobile(cleanSender)) {
      setLocalError('১১ ডিজিটের প্রেরকের মোবাইল নম্বর দিন');
      return;
    }

    if (!user) return;
    setSubmitting(true);

    try {
      let hasScreenshot = false;

      if (screenshotFile) {
        setScreenshotUploading(true);
        // Auto compress screenshot to <=150KB JPEG
        const compressed = await compressImageToDataUrl(
          screenshotFile,
          1000,
          1000,
          FILE_LIMITS.SCREENSHOT,
          'image/jpeg'
        );

        await saveFile({
          id: getFileId.screenshot(state.appId),
          ownerUid: user.uid,
          kind: 'screenshot',
          appId: state.appId,
          mime: 'image/jpeg',
          sizeBytes: compressed.sizeBytes,
          data: compressed.dataUrl,
        });

        hasScreenshot = true;
        setScreenshotUploading(false);
      }

      // 1. Submit to Server, Cloudflare R2 and Google Sheets
      const submitPayload = {
        id: state.appId,
        uid: user.uid,
        mobile: state.smsNumber,
        fullName: state.fullName,
        jobId: state.jobId,
        jobTitle: state.jobTitle,
        applyLink: state.applyLink || '',
        postName: state.postName,
        postCount: state.postCount,
        district: state.district,
        educationLevel: state.educationLevel,
        smsNumber: state.smsNumber,
        fee: state.fee,
        payment: {
          method: method as any,
          senderNumber: cleanSender,
          amount: state.fee.total,
          submittedAt: new Date().toISOString(),
        },
        hasScreenshot,
      };

      await submitJobApplication(submitPayload);

      // 2. আবেদন Firestore-এ সেভ (Transaction ID নেই)
      try {
        const appDocRef = doc(db, 'applications', state.appId);

        await setDoc(appDocRef, {
          ...submitPayload,
          termsAccepted: true,
          status: 'waiting',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const notifId = doc(collection(db, 'notifications')).id;
        await setDoc(doc(db, 'notifications', notifId), {
          uid: user.uid,
          title: 'আবেদন সফলভাবে সাবমিট হয়েছে',
          body: `আপনার আবেদন (${state.appId}) প্রাপ্ত হয়েছে। পেমেন্ট যাচাই শেষে অপারেটর Teletalk-এ আবেদন সম্পন্ন করবেন।`,
          appId: state.appId,
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      } catch (fbErr: any) {
        console.warn('Background Firestore sync notice:', fbErr?.message || fbErr);
      }

      invalidateCache('user_');
      invalidateCache('admin_');
      success('আপনার আবেদন যাচাইয়ের অপেক্ষায় আছে!');
      navigate('/applications/waiting', { replace: true });
    } catch (err: any) {
      console.error('Payment submit error:', err);
      if (err.message && err.message.toLowerCase().includes('permission')) {
        setLocalError('অনুমোদন যাচাই ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন বা পুনরায় লগইন করুন।');
      } else {
        setLocalError(err?.message || 'পেমেন্ট সাবমিট করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
      }
    } finally {
      setSubmitting(false);
      setScreenshotUploading(false);
    }
  };

  const activeNumber =
    method === 'bkash'
      ? paymentSettings.bkashNumber || '01704368053'
      : method === 'rocket'
      ? paymentSettings.rocketNumber || '01771522503'
      : paymentSettings.nagadNumber || '01771522503';

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-xs space-y-6">
        <PaymentHeaderReference
          appId={state.appId}
          jobTitle={state.jobTitle}
          postName={state.postName}
          fee={state.fee}
          onCopy={handleCopy}
          copiedText={copiedText}
        />

        <div className="space-y-3">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
            টাকা পাঠানোর মাধ্যম নির্বাচন করুন:
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setMethod('bkash')}
              className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                method === 'bkash'
                  ? 'border-pink-600 bg-pink-50 text-pink-700 shadow-xs ring-2 ring-pink-500/20'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>bKash</span>
            </button>
            <button
              type="button"
              onClick={() => setMethod('rocket')}
              className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                method === 'rocket'
                  ? 'border-purple-600 bg-purple-50 text-purple-700 shadow-xs ring-2 ring-purple-500/20'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>Rocket</span>
            </button>
            <button
              type="button"
              onClick={() => setMethod('nagad')}
              className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                method === 'nagad'
                  ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-xs ring-2 ring-orange-500/20'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>Nagad</span>
            </button>
          </div>

          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-emerald-800 block">
                {method === 'bkash' ? 'bKash নম্বর:' : method === 'rocket' ? 'Rocket নম্বর:' : 'Nagad নম্বর:'}
              </span>
              <span className="font-mono text-base font-bold text-emerald-950">
                {activeNumber}
              </span>
            </div>
            {activeNumber && (
              <button
                type="button"
                onClick={() => handleCopy(activeNumber.split(' ')[0], 'phone')}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
              >
                {copiedText === 'phone' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedText === 'phone' ? 'কপি হয়েছে' : 'নম্বর কপি'}</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-gray-500 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
            {paymentSettings.instructions}
          </p>
        </div>

        {localError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{localError}</span>
          </div>
        )}

        <form onSubmit={handleSubmitPayment} className="space-y-4 pt-2 border-t border-gray-100">
          <Input
            label="যে নম্বর থেকে টাকা পাঠিয়েছেন (Sender Mobile No)"
            placeholder="017XXXXXXXX"
            value={senderNumber}
            onChange={(e) => setSenderNumber(e.target.value.replace(/\D/g, ''))}
            maxLength={11}
            requiredStar
          />

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              পেমেন্ট স্ক্রিনশট (ঐচ্ছিক)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700"
            />
          </div>

          <Button
            type="submit"
            className="w-full mt-2"
            loading={submitting || screenshotUploading}
            icon={<ArrowRight className="w-4 h-4" />}
          >
            পেমেন্ট নিশ্চিত ও আবেদন সাবমিট করুন
          </Button>
        </form>
      </div>
    </div>
  );
};
