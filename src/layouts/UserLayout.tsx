import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Briefcase,
  FileText,
  Clock,
  CheckCircle,
  CreditCard,
  CheckCheck,
  Bell,
  LogOut,
  User,
  Home,
  BookOpen,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../services/firebase';

// নোটিফিকেশন সংখ্যা ৫ মিনিট পর্যন্ত একই থাকবে (Firestore read বাঁচাতে)
const COUNT_TTL_MS = 5 * 60 * 1000;

export const UserLayout: React.FC = () => {
  const { user, mobile, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const navigate = useNavigate();
  const location = useLocation();

  // শেষ কখন গণনা করা হয়েছে (ইউজার অনুযায়ী)
  const lastFetchRef = useRef<{ uid: string; ts: number }>({ uid: '', ts: 0 });

  const loadUnreadCount = useCallback(
    async (force = false) => {
      if (!user) return;
      const now = Date.now();
      const last = lastFetchRef.current;
      if (!force && last.uid === user.uid && now - last.ts < COUNT_TTL_MS) return;

      try {
        const q = query(
          collection(db, 'notifications'),
          where('uid', '==', user.uid),
          where('read', '==', false)
        );
        const snap = await getCountFromServer(q);
        setUnreadCount(snap.data().count);
        lastFetchRef.current = { uid: user.uid, ts: Date.now() };
      } catch {
        // গণনা ব্যর্থ হলে নীরবে আগের সংখ্যা থাকবে
      }
    },
    [user]
  );

  // লগইনের সময় একবার, এবং নোটিফিকেশন পেজে গেলে নতুন করে
  useEffect(() => {
    if (!user) return;
    const onNotifications = location.pathname.startsWith('/notifications');
    loadUnreadCount(onNotifications);
  }, [user, location.pathname, loadUnreadCount]);

  // ডেস্কটপ মেনু
  const navItems = [
    { to: '/dashboard', label: 'ড্যাশবোর্ড', icon: Home },
    { to: '/cv', label: 'আমার সিভি', icon: FileText },
    { to: '/prep', label: 'চাকরির প্রস্তুতি', icon: BookOpen },
    { to: '/applications/waiting', label: 'আমার আবেদন', icon: ClipboardList },
    { to: '/applications/checking', label: 'Check Application', icon: CheckCircle },
    { to: '/applications/payment-now', label: 'Payment Now', icon: CreditCard },
    { to: '/applications/applied', label: 'Applied Job', icon: CheckCheck },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800 pb-20 md:pb-6">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
                <Briefcase className="w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <span className="font-bold text-gray-900 text-base leading-tight block">
                  ইউজার ড্যাশবোর্ড
                </span>
                <span className="text-[11px] text-gray-500">চাকরি আবেদন সার্ভিস</span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications Icon */}
            <Link
              to="/notifications"
              className="relative p-2 text-gray-600 hover:text-emerald-600 rounded-lg hover:bg-gray-100 transition-colors"
              title="নোটিফিকেশন"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>

            {/* Mobile / Name Display */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-700">
              <User className="w-3.5 h-3.5 text-emerald-600" />
              <span>{mobile || 'ব্যবহারকারী'}</span>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-600 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors text-xs font-semibold border border-transparent hover:border-rose-200"
              title="লগআউট"
            >
              <LogOut className="w-4 h-4" />
              <span>লগআউট</span>
            </button>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="hidden md:block bg-white border-t border-gray-100 overflow-x-auto">
          <div className="max-w-6xl mx-auto px-4 flex gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                      isActive
                        ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-6xl mx-auto px-4 py-6 w-full flex-1">
        <Outlet />
      </main>

      {/* Bottom Navigation for Mobile (Mobile-first Thumb access) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-1 py-1 shadow-lg flex justify-around items-center">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex flex-col items-center py-1 px-1.5 rounded-lg text-[10px] font-medium ${
              isActive ? 'text-emerald-700' : 'text-gray-500'
            }`
          }
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span>হোম</span>
        </NavLink>

        <NavLink
          to="/cv"
          className={({ isActive }) =>
            `flex flex-col items-center py-1 px-1.5 rounded-lg text-[10px] font-medium ${
              isActive ? 'text-emerald-700' : 'text-gray-500'
            }`
          }
        >
          <FileText className="w-5 h-5 mb-0.5" />
          <span>সিভি</span>
        </NavLink>

        <NavLink
          to="/prep"
          className={({ isActive }) =>
            `flex flex-col items-center py-1 px-1.5 rounded-lg text-[10px] font-medium ${
              isActive ? 'text-emerald-700' : 'text-gray-500'
            }`
          }
        >
          <BookOpen className="w-5 h-5 mb-0.5" />
          <span>প্রস্তুতি</span>
        </NavLink>

        <NavLink
          to="/applications/waiting"
          className={({ isActive }) =>
            `flex flex-col items-center py-1 px-1.5 rounded-lg text-[10px] font-medium ${
              isActive ? 'text-emerald-700' : 'text-gray-500'
            }`
          }
        >
          <ClipboardList className="w-5 h-5 mb-0.5" />
          <span>আবেদন</span>
        </NavLink>

        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            `relative flex flex-col items-center py-1 px-1.5 rounded-lg text-[10px] font-medium ${
              isActive ? 'text-emerald-700' : 'text-gray-500'
            }`
          }
        >
          <Bell className="w-5 h-5 mb-0.5" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-1 w-3.5 h-3.5 bg-rose-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
          <span>নোটিশ</span>
        </NavLink>

        <button
          onClick={handleLogout}
          className="flex flex-col items-center py-1 px-1.5 rounded-lg text-[10px] font-medium text-gray-500 hover:text-rose-600"
        >
          <LogOut className="w-5 h-5 mb-0.5" />
          <span>লগআউট</span>
        </button>
      </nav>
    </div>
  );
};
