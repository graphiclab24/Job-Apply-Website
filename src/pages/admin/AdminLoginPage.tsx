import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import { Spinner } from '../../components/common/Spinner';

export const AdminLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const { loginAdmin, loginWithGoogle, user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { success } = useToast();

  useEffect(() => {
    if (!authLoading && user && role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [user, role, authLoading, navigate]);

  if (authLoading || (user && role === 'admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <Spinner size="lg" text="অ্যাডমিন ড্যাশবোর্ডে নিয়ে যাওয়া হচ্ছে..." />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setLoading(true);

    try {
      await loginAdmin(email, password);
      success('অ্যাডমিন হিসেবে লগইন সফল হয়েছে!');
      navigate('/admin', { replace: true });
    } catch (err: any) {
      setLocalError(err.message || 'অ্যাডমিন লগইন ব্যর্থ হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLocalError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      success('Google অ্যাকাউন্ট দিয়ে অ্যাডমিন লগইন সফল হয়েছে!');
      navigate('/admin', { replace: true });
    } catch (err: any) {
      setLocalError(err.message || 'Google দিয়ে লগইন ব্যর্থ হয়েছে');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4 py-12">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-6 md:p-8 text-white">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">অ্যাডমিন প্রবেশদ্বার</h2>
          <p className="text-xs text-gray-400 mt-1">
            শুধুমাত্র অনুমোদিত অ্যাডমিনের জন্য সংরক্ষিত
          </p>
        </div>

        {localError && (
          <div className="mb-4 p-3 bg-rose-900/50 border border-rose-500/50 text-rose-200 text-xs font-medium rounded-lg">
            {localError}
          </div>
        )}

        {/* 1-Click Google Sign-in for Admin Owner */}
        <div className="space-y-4 mb-6">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full py-2.5 px-4 bg-white hover:bg-gray-100 text-gray-800 rounded-xl font-semibold text-xs transition-all shadow-md flex items-center justify-center gap-2 border border-gray-200 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{googleLoading ? 'যাচাই করা হচ্ছে...' : 'Google দিয়ে অ্যাডমিন প্রবেশ (১-ক্লিক)'}</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-700"></div>
            <span className="text-[11px] text-gray-400 font-medium">অথবা ইমেইল ও পাসওয়ার্ড</span>
            <div className="flex-1 h-px bg-gray-700"></div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-300">
                অ্যাডমিন ইমেইল
              </label>
              <button
                type="button"
                onClick={() => setEmail('habiblinkage@gmail.com')}
                className="text-[10px] text-emerald-400 hover:underline"
              >
                habiblinkage@gmail.com
              </button>
            </div>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="habiblinkage@gmail.com"
                className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              পাসওয়ার্ড
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড"
                className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                disabled={loading}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full mt-2"
            loading={loading}
            icon={<ArrowRight className="w-4 h-4" />}
          >
            অ্যাডমিন লগইন
          </Button>
        </form>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-xs text-gray-400 hover:text-emerald-400 transition-colors"
          >
            ← পাবলিক ওয়েবসাইটে ফিরে যান
          </a>
        </div>
      </div>
    </div>
  );
};
