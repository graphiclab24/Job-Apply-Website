import React, { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { Briefcase, Menu, X, User, LogIn, ArrowRight, LogOut, Phone, MessageCircle, Facebook } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const HELPLINE = '01771522503';
const FACEBOOK_URL = 'https://www.facebook.com/bdjobapply.site';

export const PublicLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, role, mobile, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800">
      {/* Top Banner Notice */}
      <div className="bg-emerald-900 text-emerald-100 text-xs py-1.5 px-4 text-center">
        <span>সরকারি ও বেসরকারি চাকরির অনলাইন আবেদন ও টেলিটক আবেদন সার্ভিস</span>
      </div>

      {/* Main Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-gray-100 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-700 to-teal-500 flex items-center justify-center text-white shadow-sm">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-gray-900 text-lg leading-tight block">
                চাকরি আবেদন সার্ভিস
              </span>
              <span className="text-[11px] text-emerald-700 font-medium tracking-wide">
                সহজ • দ্রুত • নিরাপদ
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-sm font-medium text-gray-700 hover:text-emerald-600 transition-colors">
              হোম
            </Link>
            <Link to="/jobs" className="text-sm font-medium text-gray-700 hover:text-emerald-600 transition-colors">
              সকল চাকরি
            </Link>

            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to={role === 'admin' ? '/admin' : '/dashboard'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-xs"
                >
                  <User className="w-4 h-4" />
                  <span>{role === 'admin' ? 'অ্যাডমিন প্যানেল' : `আমার ড্যাশবোর্ড (${mobile || 'ইউজার'})`}</span>
                </Link>
                <button
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors font-medium border border-rose-200"
                  title="লগআউট"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>লগআউট</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-50"
                >
                  <LogIn className="w-4 h-4" />
                  <span>লগইন</span>
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-xs"
                >
                  <span>রেজিস্ট্রেশন</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile Hamburger */}
          <div className="md:hidden flex items-center gap-2">
            {user && (
              <button
                onClick={() => navigate(role === 'admin' ? '/admin' : '/dashboard')}
                className="p-1.5 text-emerald-700 bg-emerald-50 rounded-lg text-xs font-medium"
              >
                প্যানেল
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-600 hover:text-gray-900 rounded-lg"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-gray-100 bg-white px-4 py-3 space-y-2">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-gray-700"
            >
              হোম
            </Link>
            <Link
              to="/jobs"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-gray-700"
            >
              সকল চাকরি
            </Link>

            {user ? (
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <Link
                  to={role === 'admin' ? '/admin' : '/dashboard'}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2.5 text-center bg-emerald-600 text-white rounded-lg text-sm font-medium"
                >
                  {role === 'admin' ? 'অ্যাডমিন প্যানেল' : 'আমার ড্যাশবোর্ড'}
                </Link>
                <button
                  onClick={async () => {
                    await logout();
                    setMobileMenuOpen(false);
                    navigate('/');
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-sm font-medium border border-rose-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span>লগআউট</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 text-center border border-emerald-600 text-emerald-700 rounded-lg text-sm font-medium"
                >
                  লগইন
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 text-center bg-emerald-600 text-white rounded-lg text-sm font-medium"
                >
                  রেজিস্ট্রেশন
                </Link>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 text-sm mt-12 border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
                  <Briefcase className="w-4 h-4" />
                </div>
                <span className="font-bold text-white text-base">চাকরি আবেদন সার্ভিস</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                সরকারি ও বেসরকারি চাকরির নির্ভুল অনলাইন আবেদন সেবা। আপনার সময় ও ঝামেলা বাঁচাতে অভিজ্ঞ টিম দ্বারা আবেদন ফর্ম পূরণ ও জমা দেওয়া হয়।
              </p>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">গুরুত্বপূর্ণ লিংক</h4>
              <ul className="space-y-2 text-xs">
                <li><Link to="/jobs" className="hover:text-emerald-400">সকল চাকরির খবর</Link></li>
                <li><Link to="/login" className="hover:text-emerald-400">ইউজার লগইন</Link></li>
                <li><Link to="/register" className="hover:text-emerald-400">নতুন অ্যাকাউন্ট তৈরি</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">যোগাযোগ ও তথ্য</h4>
              <p className="text-xs text-gray-400 leading-relaxed mb-3">
                এই প্ল্যাটফর্মটি কোনো সরকারি বা প্রাতিষ্ঠানিক অফিশিয়াল ওয়েবসাইট নয়। এটি চাকরিপ্রার্থীদের হয়ে অনলাইনে আবেদনপত্র পূরণের একটি সহায়ক সেবা মাত্র।
              </p>
              <p className="text-xs text-gray-400 mb-3">
                ২৪/৭ হেল্পলাইনে যোগাযোগ করুন।
              </p>
              <ul className="space-y-2 text-xs">
                <li>
                  <a href={`tel:${HELPLINE}`} className="inline-flex items-center gap-2 hover:text-emerald-400">
                    <Phone className="w-3.5 h-3.5" />
                    <span>অফিশিয়াল হেল্পলাইন: {HELPLINE}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={`https://wa.me/88${HELPLINE}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 hover:text-emerald-400"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp: {HELPLINE}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={FACEBOOK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 hover:text-emerald-400"
                  >
                    <Facebook className="w-3.5 h-3.5" />
                    <span>Facebook Page</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-6 text-center text-xs text-gray-500">
            © {new Date().getFullYear()} চাকরি আবেদন সার্ভিস প্ল্যাটফর্ম। সর্বস্বত্ব সংরক্ষিত।
          </div>
        </div>
      </footer>
    </div>
  );
};
