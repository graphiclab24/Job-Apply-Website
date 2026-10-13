import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Download,
  Info,
  Send,
  Zap,
  Layers,
  Database,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import {
  getAppsScriptConfig,
  saveAppsScriptConfig,
  testAppsScriptWebhook,
  syncApplicationsToGoogleSheets,
  fetchApplications,
} from '../../services/applicationsService';

export const AdminGoogleSheetsPage: React.FC = () => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedHeaders, setCopiedHeaders] = useState(false);
  const [totalApps, setTotalApps] = useState<number>(0);
  const [scriptCode, setScriptCode] = useState<string>('');
  const { success, error: toastError } = useToast();

  const headersList = [
    'Application ID',
    'Submission Time',
    'Applicant Name',
    'Mobile',
    'Job Title',
    'Post Name',
    'District',
    'Education',
    'Total Fee',
    'TrxID',
    'Sender Mobile',
    'Status',
    'Soft Copy Link',
    'Paid Copy Link',
  ];

  useEffect(() => {
    loadConfig();
    loadScriptTemplate();
    loadAppCount();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const cfg = await getAppsScriptConfig();
      setIsConfigured(cfg.configured);
      if (cfg.webhookUrl) setWebhookUrl(cfg.webhookUrl);
    } catch {
      // Silently handled
    } finally {
      setLoading(false);
    }
  };

  const loadAppCount = async () => {
    try {
      const apps = await fetchApplications();
      setTotalApps(apps.length);
    } catch {}
  };

  const loadScriptTemplate = async () => {
    try {
      const res = await fetch('/google_apps_script_template.js');
      if (res.ok) {
        const text = await res.text();
        setScriptCode(text);
      }
    } catch {}
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = webhookUrl.trim();
    if (!cleanUrl) {
      toastError('Apps Script Webhook URL প্রদান করুন');
      return;
    }

    if (!cleanUrl.startsWith('https://script.google.com/')) {
      toastError('ভুল URL ফরম্যাট! URL-টি "https://script.google.com/macros/s/.../exec" দিয়ে শুরু হতে হবে।');
      return;
    }

    setSaving(true);
    try {
      const ok = await saveAppsScriptConfig(cleanUrl);
      if (ok) {
        setIsConfigured(true);
        success('Google Sheets Webhook সফলভাবে সংরক্ষিত হয়েছে!');
      } else {
        toastError('সংরক্ষণ ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      toastError(err?.message || 'সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const cleanUrl = webhookUrl.trim();
    if (!cleanUrl) {
      toastError('প্রথমে Webhook URL প্রদান বা সংরক্ষণ করুন');
      return;
    }
    setTesting(true);
    try {
      const res = await testAppsScriptWebhook(cleanUrl);
      if (res.success) {
        setIsConfigured(true);
        success(res.message || 'গুগল শিটে সফলভাবে টেস্ট পিং সম্পন্ন হয়েছে!');
      } else {
        toastError(res.error || 'টেস্ট সংযোগ ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      toastError(err?.message || 'টেস্ট সংযোগ ব্যর্থ হয়েছে');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncAll = async () => {
    if (!isConfigured && !webhookUrl) {
      toastError('প্রথমে Webhook URL সেটআপ করুন');
      return;
    }
    setSyncingAll(true);
    try {
      const res = await syncApplicationsToGoogleSheets();
      if (res.success) {
        success(res.message || `${res.count || 0}টি আবেদন সফলভাবে গুগল শিটে সিঙ্ক হয়েছে!`);
      } else {
        toastError(res.error || 'সিঙ্ক ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      toastError(err?.message || 'সিঙ্ক ব্যর্থ হয়েছে');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleCopyCode = () => {
    if (!scriptCode) return;
    navigator.clipboard.writeText(scriptCode);
    setCopiedCode(true);
    success('Apps Script সম্পূর্ণ কোড কপি হয়েছে!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyHeaders = () => {
    navigator.clipboard.writeText(headersList.join('\t'));
    setCopiedHeaders(true);
    success('হেডার কলাম কপি হয়েছে! গুগল শিটে সরাসরি Row 1 এ পেস্ট করতে পারবেন।');
    setTimeout(() => setCopiedHeaders(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2.5">
            <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            Google Sheets Webhook কনফিগারেশন
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            আজীবন ০ খরচে ১ মিলিয়নের বেশি প্রার্থীর আবেদন, ফি ও পেমেন্ট ট্রানজ্যাকশন গুগল শিটে আনলিমিটেড ব্যাকআপ
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/google_apps_script_template.js"
            download="bdjob_google_apps_script.js"
            className="px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-50 text-gray-700 flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            স্ক্রিপ্ট ডাউনলোড
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyCode}
            icon={copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          >
            {copiedCode ? 'কপি হয়েছে' : 'কোড কপি করুন'}
          </Button>
        </div>
      </div>

      {/* Live Status Card */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isConfigured
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            : 'bg-amber-50/80 border-amber-200 text-amber-950'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`p-2.5 rounded-xl mt-0.5 ${
                isConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isConfigured ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">
                  {isConfigured
                    ? 'Google Sheets Webhook সফলভাবে সংযুক্ত ও সক্রিয়!'
                    : 'Google Sheets Webhook সংযোগ অপেক্ষমাণ (ফ্রি ১M+ স্কেল)'}
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isConfigured ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
                  }`}
                >
                  {isConfigured ? 'সক্রিয় (Active)' : 'অপেক্ষমাণ'}
                </span>
              </div>
              <p className="text-xs mt-1.5 opacity-90 leading-relaxed max-w-3xl">
                {isConfigured
                  ? 'প্রার্থীরা ওয়েবসাইট বা টেলিটকে আবেদন করার সাথে সাথে সকল তথ্য সরাসরি আপনার গুগল শিটের "Applications" ট্যাবে রিয়েল-টাইমে যোগ হচ্ছে। কোনো ফায়ারবেস কোটা বা ডেটাবেস খরচ হবে না।'
                  : 'গুগল শিট স্ক্রিপ্টটি ডিপ্লয় করে প্রাপ্ত Web app URL নিচে সংরক্ষণ করুন। এতে যেকোনো সময় যেকোনো ভিজিটর আবেদন করলে ডেটা শতভাগ নিরাপদে আপনার শিটে থাকবে।'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing || !webhookUrl}
              icon={testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
              className="bg-white text-xs whitespace-nowrap"
            >
              {testing ? 'যাচাই হচ্ছে...' : 'কানেকশন টেস্ট'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSyncAll}
              disabled={syncingAll || !webhookUrl}
              icon={syncingAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-xs whitespace-nowrap"
            >
              {syncingAll ? 'সিঙ্ক হচ্ছে...' : `সকল আবেদন শিটে পাঠান (${totalApps})`}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form & Guide */}
        <div className="lg:col-span-7 space-y-6">
          {/* Webhook Configuration Box */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-emerald-600" />
              Apps Script Web App URL কনফিগারেশন
            </h3>
            <p className="text-xs text-gray-500 mb-5">
              Google Apps Script থেকে প্রাপ্ত ওয়েব অ্যাপ এক্সিকিউটেবল URL নিচে পেস্ট করে সংরক্ষণ করুন।
            </p>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Webhook URL <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="url"
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 pr-10"
                    required
                  />
                  {isConfigured && (
                    <span className="absolute right-3 top-2.5 text-emerald-600" title="সক্রিয় URL">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  নোট: URL-এর শেষে অবশ্যই <code>/exec</code> থাকতে হবে (যেমন: <code>https://script.google.com/macros/s/.../exec</code>)।
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing || !webhookUrl}
                  icon={testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  className="text-xs"
                >
                  {testing ? 'টেস্ট হচ্ছে...' : 'কানেকশন টেস্ট করুন'}
                </Button>

                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-sm"
                >
                  {saving ? 'সংরক্ষণ হচ্ছে...' : 'Webhook সংরক্ষণ করুন'}
                </Button>
              </div>
            </form>
          </div>

          {/* Setup Guide */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600" />
              ৩ মিনিটে ফ্রি Google Sheets Webhook সেটআপ করার নির্দেশিকা
            </h4>

            <div className="space-y-3.5 text-xs text-gray-600">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="w-6 h-6 bg-emerald-100 text-emerald-800 font-bold rounded-full flex items-center justify-center shrink-0 text-xs">
                  ১
                </span>
                <div>
                  <p className="font-bold text-gray-800">নতুন গুগল শিট তৈরি করুন</p>
                  <p className="mt-0.5 text-gray-500">
                    <a
                      href="https://sheets.new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-semibold inline-flex items-center gap-1"
                    >
                      sheets.new <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    ওপেন করুন এবং শিটের নাম দিন <b>BD Job Apply Data</b>।
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="w-6 h-6 bg-emerald-100 text-emerald-800 font-bold rounded-full flex items-center justify-center shrink-0 text-xs">
                  ২
                </span>
                <div>
                  <p className="font-bold text-gray-800">Apps Script কোড পেস্ট করুন</p>
                  <p className="mt-0.5 text-gray-500">
                    শিটের মেনু থেকে <b>Extensions &gt; Apps Script</b> এ ক্লিক করুন। আগের ডিফল্ট কোড মুছে ডানপাশের বক্সের সম্পূর্ণ স্ক্রিপ্ট কোডটি পেস্ট করুন।
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="w-6 h-6 bg-emerald-100 text-emerald-800 font-bold rounded-full flex items-center justify-center shrink-0 text-xs">
                  ৩
                </span>
                <div>
                  <p className="font-bold text-gray-800">Web App হিসেবে Deploy করুন</p>
                  <p className="mt-0.5 text-gray-500">
                    উপরে নীল <b>Deploy &gt; New deployment</b> বাটনে ক্লিক করুন।
                    <br />
                    • Type: <b>Web app</b>
                    <br />
                    • Execute as: <b>Me</b>
                    <br />
                    • Who has access: <b>Anyone</b> (অবশ্যই Anyone সিলেক্ট করতে হবে)।
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="w-6 h-6 bg-emerald-100 text-emerald-800 font-bold rounded-full flex items-center justify-center shrink-0 text-xs">
                  ৪
                </span>
                <div>
                  <p className="font-bold text-gray-800">URL কপি ও সংরক্ষণ করুন</p>
                  <p className="mt-0.5 text-gray-500">
                    ডিপ্লয় শেষে প্রদর্শিত Web app URL কপি করে উপরের বক্সে পেস্ট করে <b>“Webhook সংরক্ষণ করুন”</b> এবং <b>“কানেকশন টেস্ট”</b> দিন।
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Script Code & Columns */}
        <div className="lg:col-span-5 space-y-6">
          {/* Header Columns Reference */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-xs text-gray-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                শিটের কলাম তালিকা (Applications Tab)
              </h4>
              <button
                type="button"
                onClick={handleCopyHeaders}
                className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
              >
                {copiedHeaders ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copiedHeaders ? 'কপি হয়েছে' : 'কলাম কপি'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              স্ক্রিপ্টটি স্বয়ংক্রিয়ভাবে এই কলামগুলো তৈরি করবে, অথবা আপনি সরাসরি শিটের Row 1-এ পেস্ট করতে পারেন:
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100 max-h-48 overflow-y-auto">
              {headersList.map((h, idx) => (
                <div key={idx} className="flex items-center gap-1.5 truncate">
                  <span className="text-[10px] text-gray-400 font-sans">{idx + 1}.</span>
                  <span className="truncate">{h}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Script Code Viewer */}
          <div className="bg-gray-900 rounded-2xl p-5 text-gray-200 shadow-sm border border-gray-800">
            <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-mono font-bold text-gray-300">google_apps_script.js</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'কপি হয়েছে' : 'কোড কপি'}
                </button>
              </div>
            </div>

            <pre className="text-[11px] font-mono text-gray-300 overflow-x-auto max-h-96 leading-relaxed p-2 bg-gray-950/60 rounded-xl border border-gray-800/80">
              <code>{scriptCode || '// Loading script template...'}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
