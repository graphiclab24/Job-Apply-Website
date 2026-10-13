import React, { useState, useEffect } from 'react';
import {
  Cloud,
  HardDrive,
  UploadCloud,
  FileText,
  Trash2,
  ExternalLink,
  Check,
  RefreshCw,
  Search,
  AlertCircle,
  Copy,
  FolderOpen,
  PieChart,
  ShieldCheck,
  Zap,
  Info,
  CheckCircle2,
  KeyRound,
  Database,
  Globe,
  FileSpreadsheet,
} from 'lucide-react';
import {
  isDriveConnected,
  connectGoogleDrive,
  disconnectGoogleDrive,
  getDriveUser,
  listDriveFiles,
  uploadFileToGoogleDrive,
  deleteDriveFile,
  getDriveStorageInfo,
  DriveFileItem,
  DriveStorageInfo,
} from '../../services/googleDrive';
import { GoogleSignInButton } from '../../components/common/GoogleSignInButton';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { useToast } from '../../components/common/Toast';
import {
  getAppsScriptConfig,
  saveAppsScriptConfig,
  testAppsScriptWebhook,
  syncApplicationsToGoogleSheets,
  DEFAULT_APPS_SCRIPT_URL,
} from '../../services/applicationsService';

export const AdminGoogleDrivePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'r2' | 'drive' | 'sheets'>('r2');
  const [appsScriptUrl, setAppsScriptUrl] = useState(DEFAULT_APPS_SCRIPT_URL);
  const [appsScriptConfigured, setAppsScriptConfigured] = useState(true);
  const [savingAppsScript, setSavingAppsScript] = useState(false);
  const [testingAppsScript, setTestingAppsScript] = useState(false);
  const [syncingAppsScript, setSyncingAppsScript] = useState(false);

  // Cloudflare R2 State
  const [r2Config, setR2Config] = useState({
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    publicUrl: '',
  });
  const [r2Status, setR2Status] = useState<{
    isConfigured: boolean;
    provider: string;
    bucketName?: string;
    publicUrl?: string;
    accountId?: string;
    accessKeyId?: string;
  } | null>(null);
  const [loadingR2Status, setLoadingR2Status] = useState(true);
  const [savingR2, setSavingR2] = useState(false);
  const [testingUpload, setTestingUpload] = useState(false);
  const [testResultUrl, setTestResultUrl] = useState<string | null>(null);
  const [showR2Tutorial, setShowR2Tutorial] = useState(false);

  // Google Drive State
  const [connected, setConnected] = useState(isDriveConnected());
  const [driveUser, setDriveUser] = useState(getDriveUser());
  const [storageInfo, setStorageInfo] = useState<DriveStorageInfo | null>(null);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [uploadingDrive, setUploadingDrive] = useState(false);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pdf' | 'images'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { success, error: toastError } = useToast();

  // Load R2 Status on mount
  useEffect(() => {
    fetchR2Status();
  }, []);

  const fetchR2Status = async () => {
    setLoadingR2Status(true);
    try {
      const res = await fetch('/api/storage/config');
      if (res.ok) {
        const data = await res.json();
        setR2Status(data);
        if (data.bucketName) {
          setR2Config((prev) => ({
            ...prev,
            bucketName: data.bucketName || '',
            publicUrl: data.publicUrl || '',
          }));
        }
      }
      const appsCfg = await getAppsScriptConfig();
      setAppsScriptConfigured(appsCfg.configured);
      if (appsCfg.webhookUrl) setAppsScriptUrl(appsCfg.webhookUrl);
    } catch (e) {
      console.warn('Failed to fetch storage config:', e);
    } finally {
      setLoadingR2Status(false);
    }
  };

  const handleSaveAppsScript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appsScriptUrl.trim()) {
      toastError('Apps Script Webhook URL প্রদান করুন');
      return;
    }
    setSavingAppsScript(true);
    try {
      const ok = await saveAppsScriptConfig(appsScriptUrl.trim());
      if (ok) {
        setAppsScriptConfigured(true);
        success('Google Sheets Webhook সফলভাবে সংরক্ষিত হয়েছে!');
      } else {
        toastError('সংরক্ষণ ব্যর্থ হয়েছে');
      }
    } catch {
      toastError('সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setSavingAppsScript(false);
    }
  };

  const handleTestAppsScript = async () => {
    if (!appsScriptUrl.trim()) {
      toastError('প্রথমে Webhook URL প্রদান বা সংরক্ষণ করুন');
      return;
    }
    setTestingAppsScript(true);
    try {
      const res = await testAppsScriptWebhook(appsScriptUrl.trim());
      if (res.success) {
        setAppsScriptConfigured(true);
        success(res.message || 'গুগল শিটে সফলভাবে টেস্ট পিং সম্পন্ন হয়েছে!');
      } else {
        toastError(res.error || 'টেস্ট সংযোগ ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      toastError(err?.message || 'টেস্ট সংযোগ ব্যর্থ হয়েছে');
    } finally {
      setTestingAppsScript(false);
    }
  };

  const handleSyncAppsScript = async () => {
    if (!appsScriptUrl.trim() && !appsScriptConfigured) {
      toastError('প্রথমে Webhook URL কনফিগার করুন');
      return;
    }
    setSyncingAppsScript(true);
    try {
      const res = await syncApplicationsToGoogleSheets();
      if (res.success) {
        success(res.message || 'সকল আবেদন গুগল শিটে সফলভাবে পাঠানো হয়েছে!');
      } else {
        toastError(res.error || 'সিঙ্ক ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      toastError(err?.message || 'সিঙ্ক ব্যর্থ হয়েছে');
    } finally {
      setSyncingAppsScript(false);
    }
  };

  const handleSaveR2Config = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!r2Config.accountId || !r2Config.accessKeyId || !r2Config.secretAccessKey || !r2Config.bucketName) {
      toastError('Account ID, Access Key, Secret Key এবং Bucket Name প্রদান করুন');
      return;
    }

    setSavingR2(true);
    try {
      const res = await fetch('/api/storage/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r2Config),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        success(data.message || 'Cloudflare R2 সফলভাবে কানেক্ট হয়েছে!');
        fetchR2Status();
        setR2Config((prev) => ({ ...prev, secretAccessKey: '' })); // Clear secret from form memory
      } else {
        toastError(data.error || 'Cloudflare R2 কানেকশন ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      toastError(err?.message || 'কানেকশন টেস্টে সমস্যা হয়েছে');
    } finally {
      setSavingR2(false);
    }
  };

  const handleTestUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTestingUpload(true);
    setTestResultUrl(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileData: base64,
              fileName: file.name,
              folder: 'test',
              mimeType: file.type,
            }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setTestResultUrl(data.url);
            success(`ফাইল সফলভাবে আপলোড হয়েছে! (${data.provider})`);
          } else {
            toastError(data.error || 'আপলোড ব্যর্থ হয়েছে');
          }
        } catch (uploadErr: any) {
          toastError(uploadErr?.message || 'আপলোড ব্যর্থ হয়েছে');
        } finally {
          setTestingUpload(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setTestingUpload(false);
    }
  };

  // Google Drive Handlers
  useEffect(() => {
    const isConn = isDriveConnected();
    setConnected(isConn);
    setDriveUser(getDriveUser());
    if (isConn && activeTab === 'drive') {
      loadDriveData();
    }
  }, [filterType, activeTab]);

  const loadDriveData = async () => {
    setLoadingDrive(true);
    try {
      const [filesList, info] = await Promise.all([
        listDriveFiles({
          pageSize: 50,
          mimeFilter: filterType,
          searchQuery,
        }),
        getDriveStorageInfo().catch(() => null),
      ]);
      setFiles(filesList);
      if (info) setStorageInfo(info);
    } catch (err: any) {
      toastError(err.message || 'Google Drive তথ্য লোড করা যায়নি');
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleDriveConnectSuccess = () => {
    setConnected(true);
    setDriveUser(getDriveUser());
    success('Google Drive সফলভাবে সংযুক্ত হয়েছে');
    loadDriveData();
  };

  const handleConnectDrive = async () => {
    try {
      await connectGoogleDrive();
      handleDriveConnectSuccess();
    } catch (err: any) {
      toastError(err?.message || 'গুগল কানেকশন ব্যর্থ হয়েছে');
    }
  };

  const handleDriveDisconnect = () => {
    if (window.confirm('আপনি কি নিশ্চিত যে Google Drive সংযোগ বিচ্ছিন্ন করতে চান?')) {
      disconnectGoogleDrive();
      setConnected(false);
      setDriveUser(null);
      setFiles([]);
      setStorageInfo(null);
      success('Google Drive সংযোগ বিচ্ছিন্ন করা হয়েছে');
    }
  };

  const handleDriveUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploadingDrive(true);
    let successCount = 0;
    try {
      for (let i = 0; i < fileList.length; i++) {
        await uploadFileToGoogleDrive(fileList[i], fileList[i].name);
        successCount++;
      }
      success(`${successCount} টি ফাইল Google Drive-এ আপলোড হয়েছে`);
      loadDriveData();
    } catch (err: any) {
      toastError(err.message || 'ফাইল আপলোড করতে সমস্যা হয়েছে');
    } finally {
      setUploadingDrive(false);
      e.target.value = '';
    }
  };

  const handleDriveDelete = async (fileId: string, fileName: string) => {
    if (!window.confirm(`আপনি কি "${fileName}" ফাইলটি মুছে ফেলতে চান?`)) return;
    try {
      await deleteDriveFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      success('ফাইল মুছে ফেলা হয়েছে');
    } catch (err: any) {
      toastError(err.message || 'মুছে ফেলতে ব্যর্থ হয়েছে');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    success('লিংক কপি করা হয়েছে');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Tabs */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Cloud className="w-6 h-6" />
            </span>
            <h1 className="text-xl font-bold text-gray-900">ক্লাউড মিডিয়া ও ফাইল স্টোরেজ</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            চাকরির সার্কুলার পিডিএফ, ব্যানার ছবি ও আবেদনকারীদের ছবি সংরক্ষণের জন্য ০-টাকার হাই-স্পিড ক্লাউড স্টোরেজ
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-gray-100 rounded-xl self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('r2')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'r2'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-500" />
            Cloudflare R2 (সেরা / ১০ GB ফ্রি)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drive')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'drive'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <HardDrive className="w-4 h-4 text-blue-500" />
            Google Drive (১৫ GB)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sheets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'sheets'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Google Sheets (১M+ স্কেল / ০ খরচ)
          </button>
        </div>
      </div>

      {/* TAB 1: CLOUDFLARE R2 */}
      {activeTab === 'r2' && (
        <div className="space-y-6">
          {/* Status Box */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              r2Status?.isConfigured
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/70 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-xl mt-0.5 ${
                    r2Status?.isConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {r2Status?.isConfigured ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {r2Status?.isConfigured
                      ? 'Cloudflare R2 সফলভাবে সংযুক্ত ও সক্রিয়!'
                      : 'লোকাল ডিস্ক ব্যাকআপ মোড সক্রিয় (Cloudflare R2 সংযোগ অপেক্ষমাণ)'}
                  </h3>
                  <p className="text-xs mt-1 opacity-90">
                    {r2Status?.isConfigured
                      ? `বাকেট: "${r2Status.bucketName}" | প্রতি মাসে ১০ GB স্টোরেজ এবং আনলিমিটেড ডাউনলোড আজীবন সম্পূর্ণ ০ টাকায় নিশ্চিত।`
                      : 'Cloudflare R2 ক্রেডেনশিয়াল দিলে আনলিমিটেড ভিজিটর সার্কুলার ডাউনলোড করলেও কোনো ব্যান্ডউইথ ফি বা অতিরিক্ত খরচ কাটবে না।'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowR2Tutorial(!showR2Tutorial)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/90 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-white transition-all shadow-2xs self-start sm:self-center"
              >
                <Info className="w-4 h-4 text-blue-600" />
                {showR2Tutorial ? 'গাইড লুকান' : 'কিভাবে সেটাপ করবেন? (সহজ গাইড)'}
              </button>
            </div>
          </div>

          {/* Tutorial Dropdown / Card */}
          {showR2Tutorial && (
            <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl border border-slate-800 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-amber-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Cloudflare R2 থেকে তথ্য পাওয়ার ৩ মিনিটের প্রসেস:
                </h4>
                <button
                  type="button"
                  onClick={() => setShowR2Tutorial(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  ✕ বন্ধ করুন
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-300">
                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
                  <span className="font-bold text-white block mb-1">১. বাকেট তৈরি করুন (Bucket):</span>
                  <a
                    href="https://dash.cloudflare.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                  >
                    dash.cloudflare.com <ExternalLink className="w-3 h-3" />
                  </a>
                  -এ গিয়ে বাঁপাশের মেনু থেকে <b>R2</b>-তে যান। <b>Create Bucket</b> বাটনে ক্লিক করে একটি নাম দিন (যেমন: <code>bdjob-files</code>)।
                </div>

                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
                  <span className="font-bold text-white block mb-1">২. পাবলিক অ্যাক্সেস চালু করুন:</span>
                  বাকেটের ভেতরে গিয়ে <b>Settings</b> ট্যাবে যান। স্ক্রোল করে <b>Public Access</b> সেকশনে <b>R2.dev subdomain</b> অপশনে <b>Allow</b> করুন (পাবলিক লিংক পাবেন)।
                </div>

                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
                  <span className="font-bold text-white block mb-1">৩. API টোকেন সংগ্রহ করুন:</span>
                  R2 ড্যাশবোর্ডে <b>Manage R2 API Tokens</b>-এ যান। <b>Create API Token</b>-এ ক্লিক করে পারমিশন দিন <b>Object Read & Write</b>।
                </div>

                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
                  <span className="font-bold text-white block mb-1">৪. ফর্ম পূরণ ও সেভ:</span>
                  টোকেন পেজ থেকে <b>Account ID</b>, <b>Access Key ID</b>, এবং <b>Secret Access Key</b> কপি করে নিচের ফর্মে পেস্ট করে সেভ করুন।
                </div>
              </div>
            </div>
          )}

          {/* Form & Test Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Configuration Form */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-5">
              <div>
                <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-600" />
                  Cloudflare R2 সংযোগ সেটিংস
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  ক্রেডেনশিয়াল সংরক্ষণ করলে সিস্টেম স্বয়ংক্রিয়ভাবে ক্লাউডফ্লেয়ারের সাথে হ্যান্ডশেক করে ভেরিফাই করবে।
                </p>
              </div>

              <form onSubmit={handleSaveR2Config} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Account ID */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Account ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 5a1b2c3d4e5f6g7h8i9j0k..."
                      value={r2Config.accountId}
                      onChange={(e) => setR2Config({ ...r2Config, accountId: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    />
                    {r2Status?.accountId && (
                      <span className="text-[10px] text-gray-400 mt-0.5 block">
                        বর্তমানে সংরক্ষিত: {r2Status.accountId}
                      </span>
                    )}
                  </div>

                  {/* Bucket Name */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Bucket Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. bdjob-files"
                      value={r2Config.bucketName}
                      onChange={(e) => setR2Config({ ...r2Config, bucketName: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Access Key ID */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Access Key ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 9f8e7d6c5b4a3..."
                      value={r2Config.accessKeyId}
                      onChange={(e) => setR2Config({ ...r2Config, accessKeyId: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    />
                    {r2Status?.accessKeyId && (
                      <span className="text-[10px] text-gray-400 mt-0.5 block">
                        বর্তমানে সংরক্ষিত: {r2Status.accessKeyId}
                      </span>
                    )}
                  </div>

                  {/* Secret Access Key */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Secret Access Key <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      placeholder={r2Status?.isConfigured ? '••••••••••••••••••••' : 'Secret Key পেস্ট করুন'}
                      value={r2Config.secretAccessKey}
                      onChange={(e) => setR2Config({ ...r2Config, secretAccessKey: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Public URL */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Public Domain / URL (ঐচ্ছিক কিন্তু বাকেটের ছবির জন্য প্রয়োজনীয়)
                  </label>
                  <input
                    type="url"
                    placeholder="e.g. https://pub-xxxxxx.r2.dev অথবা https://cdn.bdjobapply.site"
                    value={r2Config.publicUrl}
                    onChange={(e) => setR2Config({ ...r2Config, publicUrl: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                  <span className="text-[11px] text-gray-400 mt-0.5 block">
                    Cloudflare বাকেট সেটিংসের Public Access থেকে R2.dev সাব-ডোমেন অথবা আপনার কাস্টম সাব-ডোমেন।
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    AWS S3 এনক্রিপশন স্ট্যান্ডার্ড সমর্থিত
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={savingR2}
                    className="!px-6 !py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm"
                  >
                    {savingR2 ? (
                      <span className="flex items-center gap-2">
                        <Spinner size="sm" />
                        কানেকশন টেস্ট হচ্ছে...
                      </span>
                    ) : (
                      'সংরক্ষণ ও কানেকশন টেস্ট করুন'
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* Test Upload Card */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-emerald-600" />
                  রিয়েল-টাইম আপলোড টেস্ট
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  একটি ছবি বা ফাইল আপলোড করে ক্লাউড স্টোরেজের অ্যাক্সেস ও ডেলিভারি স্পিড পরীক্ষা করুন।
                </p>

                <div className="mt-4">
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-emerald-500 bg-gray-50 hover:bg-emerald-50/30 rounded-xl p-5 cursor-pointer transition-all">
                    <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-xs font-semibold text-gray-700">ফাইল নির্বাচন করুন</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, PDF (Max 10 MB)</span>
                    <input
                      type="file"
                      onChange={handleTestUpload}
                      disabled={testingUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {testingUpload && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-emerald-700 font-medium">
                    <Spinner size="sm" />
                    ক্লাউডে আপলোড হচ্ছে...
                  </div>
                )}

                {testResultUrl && (
                  <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                      <span>✅ সফলভাবে আপলোড সম্পন্ন!</span>
                      <a
                        href={testResultUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 hover:underline inline-flex items-center gap-1 text-[11px]"
                      >
                        ভিউ <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="text-[11px] font-mono text-gray-600 break-all bg-white p-2 rounded-lg border border-emerald-100">
                      {testResultUrl}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 text-[11px] text-gray-400">
                <span className="font-semibold text-gray-600">টিপস:</span> R2 সক্রিয় হলে সব সার্কুলারের ইমেজ ও আবেদনকারীর ডেটা কোনো লিমিট ছাড়াই দ্রুততম সময়ে লোড হবে।
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GOOGLE DRIVE */}
      {activeTab === 'drive' && (
        <div className="space-y-6">
          {/* Connection Status Box */}
          <div
            className={`p-6 rounded-2xl border transition-all ${
              connected
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-white border-gray-200 text-gray-900 shadow-sm'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`p-3 rounded-xl mt-1 ${
                    connected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold">
                      {connected ? 'Google Drive সংযুক্ত রয়েছে' : 'Google Drive সংযোগ বিচ্ছিন্ন'}
                    </h2>
                    {connected && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        সক্রিয়
                      </span>
                    )}
                  </div>
                  {connected && driveUser ? (
                    <p className="text-xs text-gray-600 mt-1">
                      অ্যাকাউন্ট: <span className="font-semibold text-gray-900">{driveUser.name}</span> ({driveUser.email})
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      আপনার সাধারণ জিমেইল অ্যাকাউন্টের সাথে যুক্ত করে ১৫ GB ফ্রি স্টোরেজ ব্যবহার করুন।
                    </p>
                  )}
                </div>
              </div>

              <div>
                {connected ? (
                  <Button
                    onClick={handleDriveDisconnect}
                    variant="outline"
                    className="!text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                  >
                    সংযোগ বিচ্ছিন্ন করুন
                  </Button>
                ) : (
                  <GoogleSignInButton
                    onClick={handleConnectDrive}
                    text="Google Drive সংযুক্ত করুন"
                  />
                )}
              </div>
            </div>

            {/* Storage Usage Bar if Connected */}
            {connected && storageInfo && (
              <div className="mt-6 pt-6 border-t border-emerald-100/80">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="font-semibold text-gray-700">স্টোরেজ ব্যবহার</span>
                  <span className="text-gray-500 font-mono">
                    {storageInfo.usageFormatted} / {storageInfo.limitFormatted} ({storageInfo.usagePercent ?? 0}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (storageInfo.usagePercent ?? 0) > 90
                        ? 'bg-rose-500'
                        : (storageInfo.usagePercent ?? 0) > 70
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, storageInfo.usagePercent ?? 0)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Files List Section if Connected */}
          {connected && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-gray-500" />
                  <h3 className="font-bold text-sm text-gray-800">ড্রাইভ ফাইলসমূহ ({files.length})</h3>
                </div>

                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-sm">
                    {uploadingDrive ? (
                      <>
                        <Spinner size="sm" /> আপলোড হচ্ছে...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" /> ড্রাইভে আপলোড
                      </>
                    )}
                    <input
                      type="file"
                      multiple
                      onChange={handleDriveUpload}
                      disabled={uploadingDrive}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={loadDriveData}
                    disabled={loadingDrive}
                    className="p-2 border border-gray-200 text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-50 transition-all"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingDrive ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ফাইল সার্চ করুন..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadDriveData()}
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl self-start">
                  {(['all', 'pdf', 'images'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFilterType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                        filterType === t ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {t === 'all' ? 'সব' : t === 'pdf' ? 'PDF' : 'Images'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table / List */}
              {loadingDrive ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                  <Spinner size="md" />
                  <span className="text-xs mt-2">ফাইল লোড হচ্ছে...</span>
                </div>
              ) : files.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">কোনো ফাইল পাওয়া যায়নি</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 bg-gray-50/50">
                        <th className="py-3 px-3">ফাইলের নাম</th>
                        <th className="py-3 px-3">সাইজ</th>
                        <th className="py-3 px-3">তারিখ</th>
                        <th className="py-3 px-3 text-right">অ্যাকশন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {files.map((file) => (
                        <tr key={file.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="py-3 px-3 font-medium text-gray-800 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                            <span className="truncate max-w-[240px] sm:max-w-md">{file.name}</span>
                          </td>
                          <td className="py-3 px-3 text-gray-500 font-mono">{file.sizeFormatted || '-'}</td>
                          <td className="py-3 px-3 text-gray-400">
                            {file.createdTime ? new Date(file.createdTime).toLocaleDateString() : '-'}
                          </td>
                          <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                            {file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[11px] font-semibold"
                              >
                                ভিউ <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDriveDelete(file.id, file.name)}
                              className="p-1 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                              title="মুছে ফেলুন"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GOOGLE SHEETS WEBHOOK (0-Cost 1M+ Scale) */}
      {activeTab === 'sheets' && (
        <div className="space-y-6">
          {/* Status Box */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              appsScriptConfigured
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/70 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-xl mt-0.5 ${
                    appsScriptConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {appsScriptConfigured ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {appsScriptConfigured
                      ? 'Google Sheets Webhook সক্রিয় ও সংযুক্ত!'
                      : 'Google Sheets Webhook সংযোগ অপেক্ষমাণ (ফ্রি ১M+ আবেদন স্কেল)'}
                  </h3>
                  <p className="text-xs mt-1 opacity-90">
                    {appsScriptConfigured
                      ? 'প্রার্থীদের সকল নতুন আবেদন ও পেমেন্ট ট্রানজ্যাকশন স্বয়ংক্রিয়ভাবে আপনার গুগল শিটে ব্যাকআপ হচ্ছে (০ ফায়ারবেস কোটা ব্যবহার)।'
                      : 'Apps Script Webhook URL যুক্ত করলে প্রার্থীর কোনো আবেদন মিস হবে না এবং আনলিমিটেড ট্রানজ্যাকশন গুগল শিটে আজীবন সম্পূর্ণ ফ্রিতে রেকর্ড থাকবে।'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/google_apps_script_template.js"
                  download="bdjob_google_apps_script.js"
                  className="px-3.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-50 flex items-center gap-1.5 shadow-sm"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  স্ক্রিপ্ট টেমপ্লেট কোড
                </a>
              </div>
            </div>
          </div>

          {/* Webhook Configuration Form */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Google Apps Script Webhook URL কনফিগারেশন
            </h3>
            <p className="text-xs text-gray-500 mb-6">
              Google Sheet-এর <code>Extensions &gt; Apps Script</code> থেকে প্রস্তুত করা Web App URL নিচে পেস্ট করুন।
            </p>

            <form onSubmit={handleSaveAppsScript} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Apps Script Web App URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  value={appsScriptUrl}
                  onChange={(e) => setAppsScriptUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Deploy &gt; New deployment &gt; Type: Web app &gt; Execute as: Me &gt; Who has access: Anyone
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestAppsScript}
                    disabled={testingAppsScript || !appsScriptUrl}
                    icon={testingAppsScript ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
                    className="text-xs"
                  >
                    {testingAppsScript ? 'যাচাই হচ্ছে...' : 'কানেকশন টেস্ট'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSyncAppsScript}
                    disabled={syncingAppsScript || !appsScriptUrl}
                    icon={syncingAppsScript ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5 text-blue-500" />}
                    className="text-xs"
                  >
                    {syncingAppsScript ? 'সিঙ্ক হচ্ছে...' : 'সকল আবেদন শিটে সিঙ্ক'}
                  </Button>
                </div>

                <Button
                  type="submit"
                  disabled={savingAppsScript}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-sm"
                >
                  {savingAppsScript ? 'সংরক্ষণ হচ্ছে...' : 'Webhook সংরক্ষণ করুন'}
                </Button>
              </div>
            </form>
          </div>

          {/* Setup Guide */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-blue-600" />
              কীভাবে ৩ মিনিটে ফ্রি গুগল শিট ওয়েবুক চালু করবেন:
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-xs text-gray-600 leading-relaxed">
              <li>
                <a href="https://sheets.new" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-semibold">sheets.new</a> ওপেন করে একটি নতুন শিট তৈরি করুন।
              </li>
              <li>
                মেনু থেকে <b>Extensions &gt; Apps Script</b> এ ক্লিক করুন।
              </li>
              <li>
                উপরে <b>“স্ক্রিপ্ট টেমপ্লেট কোড”</b> বাটনে ক্লিক করে কোডটি কপি করে Apps Script এ পেস্ট করুন।
              </li>
              <li>
                <b>Deploy &gt; New deployment &gt; Web app</b> সিলেক্ট করুন। <i>Who has access</i> ড্রপডাউনে <b>Anyone</b> সিলেক্ট করে Deploy দিন।
              </li>
              <li>
                পাওয়া Web app URL-টি কপি করে উপরের বক্সে পেস্ট করে <b>“Webhook সংরক্ষণ করুন”</b> বাটনে ক্লিক করুন।
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};
