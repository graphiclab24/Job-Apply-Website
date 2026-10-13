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
  Database,
  Globe,
  FileSpreadsheet,
  Send,
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
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { useToast } from '../../components/common/Toast';
import {
  testAppsScriptWebhook,
  syncApplicationsToGoogleSheets,
  DEFAULT_APPS_SCRIPT_URL,
} from '../../services/applicationsService';

export const AdminGoogleDrivePage: React.FC = () => {
  // Test upload state
  const [testingUpload, setTestingUpload] = useState(false);
  const [testResultUrl, setTestResultUrl] = useState<string | null>(null);

  // Sheets sync states
  const [testingSheets, setTestingSheets] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);

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

  useEffect(() => {
    const isConn = isDriveConnected();
    setConnected(isConn);
    setDriveUser(getDriveUser());
    if (isConn) {
      loadDriveData();
    }
  }, [filterType]);

  const loadDriveData = async () => {
    setLoadingDrive(true);
    try {
      const [filesList, info] = await Promise.all([
        listDriveFiles({
          mimeFilter: filterType,
          searchQuery: searchQuery,
        }),
        getDriveStorageInfo(),
      ]);
      setFiles(filesList);
      setStorageInfo(info);
    } catch (err: any) {
      console.warn('Google Drive load notice:', err?.message || err);
    } finally {
      setLoadingDrive(false);
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
            success(`ফাইল সফলভাবে Cloudflare R2 তে আপলোড হয়েছে!`);
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

  const handleTestSheets = async () => {
    setTestingSheets(true);
    try {
      const res = await testAppsScriptWebhook();
      if (res.success) {
        success(res.message || 'Google Sheets Webhook সফলভাবে যাচাই হয়েছে!');
      } else {
        toastError(res.error || 'টেস্ট কানেকশন ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      toastError(err?.message || 'টেস্ট কানেকশন ব্যর্থ হয়েছে');
    } finally {
      setTestingSheets(false);
    }
  };

  const handleSyncSheets = async () => {
    setSyncingSheets(true);
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
      setSyncingSheets(false);
    }
  };

  const handleDriveConnect = async () => {
    setConnectingDrive(true);
    try {
      const u = await connectGoogleDrive();
      setConnected(true);
      setDriveUser(u.user);
      success('Google Drive সফলভাবে সংযুক্ত হয়েছে!');
      loadDriveData();
    } catch (err: any) {
      toastError(err.message || 'Google Drive সংযোগ ব্যর্থ হয়েছে');
    } finally {
      setConnectingDrive(false);
    }
  };

  const handleDriveDisconnect = () => {
    disconnectGoogleDrive();
    setConnected(false);
    setDriveUser(null);
    setFiles([]);
    setStorageInfo(null);
    success('Google Drive সংযোগ বিচ্ছিন্ন করা হয়েছে');
  };

  const handleDriveUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploadingDrive(true);
    try {
      let successCount = 0;
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
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Cloud className="w-6 h-6" />
            </span>
            <h1 className="text-xl font-bold text-gray-900">ক্লাউড মিডিয়া ও ফাইল স্টোরেজ সিস্টেম</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Cloudflare R2 ও Google Sheets সরাসরি কোডে ইমপ্লান্ট করা। কোনো অতিরিক্ত কনফিগারেশন ছাড়াই আজীবন ০-খরচে সক্রিয়।
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestSheets}
            disabled={testingSheets}
            icon={testingSheets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
            className="text-xs bg-white"
          >
            {testingSheets ? 'যাচাই হচ্ছে...' : 'শিট পিং টেস্ট'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSyncSheets}
            disabled={syncingSheets}
            icon={syncingSheets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            className="text-xs bg-emerald-600 hover:bg-emerald-700"
          >
            {syncingSheets ? 'সিঙ্ক হচ্ছে...' : 'সকল আবেদন শিটে পাঠান'}
          </Button>
        </div>
      </div>

      {/* Cloud Infrastructure Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Cloudflare R2 */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                <HardDrive className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                  Cloudflare R2 স্টোরেজ
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </h3>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                  সরাসরি কোডে ইমপ্লান্ট করা (Active)
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs">
              ১০ GB ফ্রি / ০ ব্যান্ডউইথ ফি
            </span>
          </div>

          <p className="text-xs text-emerald-900/90 leading-relaxed">
            বাকেট: <b>bdjob-files</b> | পাবলিক CDN: <code>pub-1c4d2bddd5d943c38d6824eeb890c6f0.r2.dev</code>
            <br />
            সার্কুলার পিডিএফ, ছবি ও ফাইল সরাসরি গ্লোবাল এজ ক্যাশে হোস্ট করা থাকে। কোটি ভিজিটর আসলেও ফায়ারবেস বা ব্যান্ডউইথ খরচ হবে না।
          </p>

          <div className="pt-2 flex items-center justify-between border-t border-emerald-200/60">
            <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition-all">
              <UploadCloud className="w-4 h-4 text-emerald-600" />
              {testingUpload ? 'আপলোড হচ্ছে...' : 'R2 টেস্ট ফাইল আপলোড'}
              <input
                type="file"
                className="hidden"
                disabled={testingUpload}
                onChange={handleTestUpload}
              />
            </label>

            {testResultUrl && (
              <a
                href={testResultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-700 font-semibold underline inline-flex items-center gap-1"
              >
                আপলোড ফাইল দেখুন <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Card 2: Google Sheets Webhook */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                  Google Sheets Webhook
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </h3>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                  সরাসরি কোডে ইমপ্লান্ট করা (Active)
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs">
              ১M+ স্কেল / ০ খরচ
            </span>
          </div>

          <p className="text-xs text-emerald-900/90 leading-relaxed truncate" title={DEFAULT_APPS_SCRIPT_URL}>
            Webhook URL: <code>{DEFAULT_APPS_SCRIPT_URL.slice(0, 48)}...</code>
            <br />
            প্রার্থীদের প্রতিটি নতুন আবেদন ও পেমেন্ট রিয়েল-টাইমে স্বয়ংক্রিয়ভাবে আপনার গুগল শিটের "Applications" ট্যাবে ব্যাকআপ হচ্ছে।
          </p>

          <div className="pt-2 flex items-center gap-2 border-t border-emerald-200/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestSheets}
              disabled={testingSheets}
              icon={testingSheets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
              className="bg-white text-xs border-emerald-300 text-emerald-800"
            >
              {testingSheets ? 'যাচাই হচ্ছে...' : 'কানেকশন টেস্ট'}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSyncSheets}
              disabled={syncingSheets}
              icon={syncingSheets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-xs"
            >
              {syncingSheets ? 'সিঙ্ক হচ্ছে...' : 'সকল আবেদন শিটে পাঠান'}
            </Button>
          </div>
        </div>
      </div>

      {/* Google Drive Integration Section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-blue-600" />
              Google Drive ফাইল ব্যাকআপ (১৫ GB ফ্রি)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              ঐচ্ছিক: আপনার গুগল ড্রাইভে অতিরিক্ত ব্যাকআপ হিসেবে পিডিএফ ও রেজাল্ট কপি সেভ রাখতে কানেক্ট করুন
            </p>
          </div>

          <div>
            {!connected ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleDriveConnect}
                disabled={connectingDrive}
                icon={connectingDrive ? <Spinner size="sm" /> : <HardDrive className="w-4 h-4" />}
                className="bg-blue-600 hover:bg-blue-700 text-xs"
              >
                {connectingDrive ? 'সংযোগ হচ্ছে...' : 'Google Drive কানেক্ট করুন'}
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600 font-medium">
                  {driveUser?.name || driveUser?.email}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDriveDisconnect}
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs"
                >
                  ডিসকানেক্ট
                </Button>
              </div>
            )}
          </div>
        </div>

        {connected ? (
          <div className="space-y-4">
            {/* Storage Usage Bar */}
            {storageInfo && (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-gray-700">
                  <PieChart className="w-4 h-4 text-blue-600" />
                  <span>
                    ব্যবহৃত: <b>{storageInfo.usageFormatted}</b> / <b>{storageInfo.limitFormatted}</b>
                  </span>
                </div>
                <div className="w-full sm:w-48 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (parseInt(storageInfo.usage || '0') / Math.max(1, parseInt(storageInfo.limit || '1'))) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Upload Area & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition-all self-start sm:self-auto">
                <UploadCloud className="w-4 h-4" />
                {uploadingDrive ? 'আপলোড হচ্ছে...' : 'Google Drive-এ ফাইল আপলোড'}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={uploadingDrive}
                  onChange={handleDriveUpload}
                />
              </label>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ফাইল খুঁজুন..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white outline-none"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadDriveData}
                  disabled={loadingDrive}
                  icon={<RefreshCw className={`w-3.5 h-3.5 ${loadingDrive ? 'animate-spin' : ''}`} />}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Files List */}
            {loadingDrive ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : files.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">
                কোনো ফাইল পাওয়া যায়নি
              </div>
            ) : (
              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-100 font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">ফাইলের নাম</th>
                      <th className="py-2.5 px-4">সাইজ</th>
                      <th className="py-2.5 px-4 text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {files.map((file) => (
                      <tr key={file.id} className="hover:bg-gray-50/60">
                        <td className="py-2.5 px-4 font-medium text-gray-800 flex items-center gap-2 truncate max-w-xs">
                          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </td>
                        <td className="py-2.5 px-4 text-gray-500">
                          {file.size ? `${(parseInt(file.size) / 1024).toFixed(1)} KB` : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right space-x-1">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-semibold inline-flex items-center gap-1"
                            >
                              ভিউ <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDriveDelete(file.id, file.name)}
                            className="p-1 text-gray-400 hover:text-rose-600 rounded"
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
        ) : (
          <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <HardDrive className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-gray-700">Google Drive বর্তমানে ডিসকানেক্টেড</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              ক্লাউডফ্লেয়ার R2 ইতিপূর্বে কোডে ইমপ্লান্ট করা আছে এবং ডিফল্টভাবে কাজ করছে। অতিরিক্ত সুবিধা হিসেবে গুগল ড্রাইভ কানেক্ট করতে পারেন।
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
