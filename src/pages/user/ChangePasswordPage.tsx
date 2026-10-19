import React, { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { isValidPassword } from '../../utils/auth';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import { ShieldCheck, AlertCircle } from 'lucide-react';

export const ChangePasswordPage: React.FC = () => {
  const { success, error } = useToast();
  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!isValidPassword(newPassword)) {
      setLocalError('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
      return;
    }
    if (newPassword !== confirm) {
      setLocalError('নতুন পাসওয়ার্ড দুটি মিলছে না');
      return;
    }
    if (newPassword === current) {
      setLocalError('নতুন পাসওয়ার্ড আগের পাসওয়ার্ড থেকে আলাদা হতে হবে');
      return;
    }

    const u = auth.currentUser;
    if (!u || !u.email) {
      setLocalError('আবার লগইন করুন');
      return;
    }

    setLoading(true);
    try {
      // নিরাপত্তার জন্য বর্তমান পাসওয়ার্ড দিয়ে আবার যাচাই
      const cred = EmailAuthProvider.credential(u.email, current);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, newPassword);

      success('পাসওয়ার্ড সফলভাবে বদলানো হয়েছে।');
      setCurrent('');
      setNewPassword('');
      setConfirm('');
    } catch (err: any) {
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        setLocalError('বর্তমান পাসওয়ার্ড সঠিক নয়');
      } else if (err?.code === 'auth/requires-recent-login') {
        setLocalError('নিরাপত্তার জন্য আবার লগইন করে চেষ্টা করুন');
      } else {
        setLocalError(err?.message || 'পাসওয়ার্ড বদলানো যায়নি');
        error('পাসওয়ার্ড বদলানো যায়নি');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6 pb-12">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-xl font-bold text-gray-900">পাসওয়ার্ড বদলান</h2>
        <p className="text-xs text-gray-500 mt-0.5">বর্তমান পাসওয়ার্ড দিয়ে যাচাই করে নতুন পাসওয়ার্ড সেট করুন</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
        {localError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{localError}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">বর্তমান পাসওয়ার্ড</label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">নতুন পাসওয়ার্ড</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">নতুন পাসওয়ার্ড (আবার)</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>পাসওয়ার্ড বদলালে পরের লগইনে নতুনটি ব্যবহার করুন।</span>
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          পাসওয়ার্ড বদলান
        </Button>
      </form>
    </div>
  );
};
