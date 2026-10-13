import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  Send,
  CheckCircle,
  CreditCard,
  CheckCheck,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Award,
  Download,
  HardDrive,
  Link2,
  FileImage,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const navSections = [
    {
      title: 'সাধারণ',
      items: [
        { to: '/admin', label: 'ড্যাশবোর্ড', icon: LayoutDashboard, end: true },
        { to: '/admin/jobs', label: 'চাকরির সার্কুলার', icon: Briefcase },
        { to: '/admin/exams', label: 'পরীক্ষা ও নোটিশ', icon: Award },
      ],
    },
    {
      title: 'আবেদন ব্যবস্থাপনা (৫টি ধাপ)',
      items: [
        { to: '/admin/applications/waiting', label: 'Waiting List', icon: Clock },
        { to: '/admin/applications/apply-now', label: 'Apply Now', icon: Send },
        { to: '/admin/applications/check', label: 'Check Application', icon: CheckCircle },
        { to: '/admin/applications/payment-now', label: 'Payment Now', icon: CreditCard },
        { to: '/admin/applications/complete', label: 'Complete', icon: CheckCheck },
      ],
    },
    {
      title: 'কনফিগারেশন ও টুলস',
      items: [
        { to: '/admin/shortener', label: 'URL শর্টনার', icon: Link2 },
        { to: '/admin/pdf-converter', label: 'PDF to JPG কনভার্টার', icon: FileImage },
        { to: '/admin/settings/payment', label: 'পেমেন্ট সেটিংস', icon: Settings },
        { to: '/admin/settings/google-sheets', label: 'গুগল শিট (Apps Script)', icon: FileSpreadsheet },
        { to: '/admin/storage', label: 'ক্লাউড স্টোরেজ (R2)', icon: HardDrive },
        { to: '/admin/export', label: 'ফাইল এক্সপোর্ট', icon: Download },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex bg-gray-100 text-gray-800">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-gray-900 text-gray-200 flex flex-col transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-white text-sm block">অ্যাডমিন প্যানেল</span>
              <span className="text-[10px] text-emerald-400">মাস্টার কন্ট্রোল</span>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navSections.map((sec, idx) => (
            <div key={idx} className="space-y-1">
              <h5 className="px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {sec.title}
              </h5>
              {sec.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer with Extension Download & Logout */}
        <div className="p-3 border-t border-gray-800 space-y-2">
          <a
            href="/bd-job-autofill-extension.zip"
            download="bd-job-autofill-extension.zip"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 hover:text-white rounded-lg text-xs font-semibold border border-emerald-600/50 transition-colors shadow-xs"
            title="টেলিটক অটোফিল ক্রোম এক্সটেনশন ডাউনলোড (.zip)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Autofill Extension (.zip)</span>
          </a>

          <div className="px-3 py-1 text-xs text-gray-400 truncate">
            {user?.email || 'Admin'}
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-rose-900/40 text-gray-300 hover:text-rose-400 rounded-lg text-xs font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>লগআউট</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-gray-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-sm md:text-base font-semibold text-gray-800">
              চাকরি আবেদন সার্ভিস এডমিন
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              target="_blank"
              className="text-xs text-emerald-700 hover:underline font-medium hidden md:inline"
            >
              পাবলিক ওয়েবসাইট দেখুন ↗
            </Link>

            {/* Direct Autofill Extension Download Button in Admin Header */}
            <a
              href="/bd-job-autofill-extension.zip"
              download="bd-job-autofill-extension.zip"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="টেলিটক অটোফিল ক্রোম এক্সটেনশন ডাউনলোড (.zip)"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Autofill Extension (.zip)</span>
              <span className="sm:hidden">Extension</span>
            </a>

            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>সক্রিয় অ্যাডমিন</span>
            </div>

            {/* Prominent Header Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 rounded-lg text-xs font-semibold border border-rose-200 transition-colors shadow-xs"
              title="অ্যাডমিন লগআউট"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>লগআউট</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
