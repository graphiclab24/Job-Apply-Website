import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WORKER_URL } from '../../services/jobsStore';
import { isValidMobile, isValidPassword } from '../../utils/auth';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import { KeyRound, AlertCircle } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [mobile, setMobile] = useState('');
  const [dob, setDob] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!isValidMobile(mobile)) {
      setLocalError('সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন');
      return;
    }
    if (!dob) {
      setLocalError('জন্মতারিখ দিন');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${WORKER_URL}/auth/reset/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, dob }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLocalError(data.error || 'তথ্য মেলেনি');
        return;
      }
      setResetToken(data.resetToken);
      setStep(2);
    } catch {
      setLocalError('সার্ভারে কানেক্ট করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!isValidPassword(newPassword)) {
      setLocalError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
      return;
    }
    if (newPassword !== confirm) {
      setLocalError('দুটি পাসওয়ার্ড মিলছে না');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${WORKER_URL}/auth/reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLocalError(data.error || 'পাসওয়ার্ড বদলানো যায়নি');
        return;
      }
      success('পাসওয়ার্ড বদলানো হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।');
      navigate('/login', { replace: true });
    } catch {
      setLocalError('সার্ভারে কানেক্ট করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-bold text-gray-900">পাসওয়ার্ড ভুলে গেছেন?</h1>
        </div>

        {localError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{localError}</span>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleCheck} className="space-y-4">
            <p className="text-xs text-gray-600">
              আপনার মোবাইল নম্বর ও সিভিতে দেওয়া জন্মতারিখ দিন।
            </p>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">মোবাইল নম্বর</label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                placeholder="017XXXXXXXX"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">জন্মতারিখ</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              যাচাই করুন
            </Button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-xs text-gray-600">যাচাই সফল হয়েছে। নতুন পাসওয়ার্ড দিন।</p>
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
            <Button type="submit" className="w-full" loading={loading}>
              পাসওয়ার্ড বদলান
            </Button>
          </form>
        )}

        <div className="text-center">
          <Link to="/login" className="text-xs text-emerald-700 hover:underline">
            লগইন পেজে ফিরুন
          </Link>
        </div>
      </div>
    </div>
  );
};
