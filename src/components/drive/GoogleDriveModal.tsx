import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  UploadCloud,
  FileText,
  Trash2,
  ExternalLink,
  Check,
  RefreshCw,
  Search,
  AlertCircle,
  X,
  Plus,
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
import { GoogleSignInButton } from '../common/GoogleSignInButton';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile?: (file: { id: string; name: string; webViewLink: string }) => void;
  title?: string;
  acceptMime?: 'pdf' | 'images' | 'all';
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  onSelectFile,
  title = 'Google Drive স্টোরেজ ম্যানেজার',
  acceptMime = 'all',
}) => {
  const [connected, setConnected] = useState(isDriveConnected());
  const [driveUser, setDriveUser] = useState(getDriveUser());
  const [storageInfo, setStorageInfo] = useState<DriveStorageInfo | null>(null);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      const isConn = isDriveConnected();
      setConnected(isConn);
      setDriveUser(getDriveUser());
      if (isConn) {
        fetchFilesAndStorage();
      }
    }
  }, [isOpen]);

  const fetchFilesAndStorage = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [filesList, info] = await Promise.all([
        listDriveFiles({
          pageSize: 25,
          mimeFilter: acceptMime,
          searchQuery,
        }),
        getDriveStorageInfo().catch(() => null),
      ]);
      setFiles(filesList);
      if (info) setStorageInfo(info);
    } catch (err: any) {
      setErrorMsg(err.message || 'ফাইল তালিকা আনতে সমস্যা হয়েছে');
      if (err.message?.includes('কানেক্ট') || err.message?.includes('মেয়াদোত্তীর্ণ')) {
        setConnected(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setErrorMsg('');
    try {
      await connectGoogleDrive();
      setConnected(true);
      setDriveUser(getDriveUser());
      await fetchFilesAndStorage();
      setSuccessMsg('Google Drive সফলভাবে সংযুক্ত হয়েছে!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Google Drive কানেক্ট করতে ব্যর্থ হয়েছে');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnectGoogleDrive();
    setConnected(false);
    setDriveUser(null);
    setFiles([]);
    setStorageInfo(null);
  };

  const handleUploadLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setErrorMsg('');
    try {
      const result = await uploadFileToGoogleDrive(file, file.name, {
        makePublic: true,
      });

      setSuccessMsg(`"${file.name}" সফলভাবে Google Drive-এ আপলোড হয়েছে!`);
      setTimeout(() => setSuccessMsg(''), 4000);

      // Auto select if in picker mode
      if (onSelectFile && result.webViewLink) {
        onSelectFile({
          id: result.fileId,
          name: file.name,
          webViewLink: result.webViewLink,
        });
        onClose();
        return;
      }

      await fetchFilesAndStorage();
    } catch (err: any) {
      setErrorMsg(err.message || 'Google Drive-এ ফাইল আপলোড ব্যর্থ হয়েছে');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (file: DriveFileItem) => {
    try {
      const deleted = await deleteDriveFile(file.id, file.name);
      if (deleted) {
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        setSuccessMsg(`"${file.name}" মুছে ফেলা হয়েছে`);
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'ফাইল মুছতে ব্যর্থ হয়েছে');
    }
  };

  const formatBytes = (bytesStr?: string) => {
    if (!bytesStr) return '0 B';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm md:text-base">{title}</h3>
              <p className="text-xs text-gray-500">Google Drive ফাইল স্টোরেজ ও লিঙ্ক ব্যবস্থাপনা</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1 space-y-1">
              <span className="font-bold block">{errorMsg}</span>
              {(errorMsg.includes('unauthorized-domain') || errorMsg.includes('অনুমোদিত নয়')) && (
                <div className="bg-white/90 p-2.5 rounded-lg border border-rose-200 text-[11px] text-gray-800 space-y-1 mt-1.5">
                  <p className="font-bold text-rose-700">💡 সমাধান পদ্ধতি (মাত্র ৩০ সেকেন্ড):</p>
                  <ol className="list-decimal pl-4 space-y-0.5 text-gray-700">
                    <li><strong>Firebase Console</strong>-এ যান।</li>
                    <li>বাম পাশের মেনু থেকে <strong>Authentication</strong>-এ যান।</li>
                    <li>উপরের <strong>Settings</strong> ট্যাবে ক্লিক করে <strong>Authorized domains</strong>-এ যান।</li>
                    <li><strong>Add domain</strong> বাটনে ক্লিক করে <code>bdjobapply.site</code> লিখে <strong>Done</strong> চাপুন।</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          {!connected ? (
            <div className="py-10 text-center max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100">
                <HardDrive className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-base">Google Drive সংযুক্ত করুন</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Google Drive-এ ফাইল ও পিডিএফ আনলিমিটেড স্টোর করতে আপনার গুগল অ্যাকাউন্ট দিয়ে কানেক্ট করুন।
                </p>
              </div>
              <div className="pt-2">
                <GoogleSignInButton
                  onClick={handleConnect}
                  loading={connecting}
                  text="Google Drive সংযুক্ত করুন"
                />
              </div>
            </div>
          ) : (
            <>
              {/* Account & Storage Status Bar */}
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  {driveUser?.photoURL ? (
                    <img
                      src={driveUser.photoURL}
                      alt="Avatar"
                      className="w-8 h-8 rounded-full border border-gray-200"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                      {driveUser?.name?.[0] || 'G'}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-gray-800">
                      {driveUser?.name || 'Google Drive ব্যবহারকারী'}
                    </div>
                    <div className="text-gray-500 text-[11px]">{driveUser?.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {storageInfo?.limit && (
                    <div className="text-right hidden sm:block">
                      <div className="text-[11px] text-gray-500">Google Drive স্টোরেজ</div>
                      <div className="font-semibold text-gray-700">
                        {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.limit)} ব্যবহৃত
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleDisconnect}
                    className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2.5 py-1 hover:bg-rose-50 rounded-md transition-colors"
                  >
                    ডিসকানেক্ট
                  </button>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="ফাইল সার্চ করুন..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchFilesAndStorage()}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchFilesAndStorage}
                    loading={loading}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    রিফ্রেশ
                  </Button>

                  {/* Upload Button */}
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors">
                    {uploading ? (
                      <Spinner size="sm" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>Drive-এ আপলোড করুন</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleUploadLocalFile}
                      disabled={uploading}
                      accept={
                        acceptMime === 'pdf'
                          ? '.pdf'
                          : acceptMime === 'images'
                          ? 'image/*'
                          : undefined
                      }
                    />
                  </label>
                </div>
              </div>

              {/* Files Table / List */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {loading ? (
                  <div className="py-12 text-center text-gray-500">
                    <Spinner size="md" />
                    <p className="text-xs mt-2">Google Drive থেকে ফাইল লোড হচ্ছে...</p>
                  </div>
                ) : files.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">
                    <FileText className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-xs font-medium">কোনো ফাইল পাওয়া যায়নি</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      উপরে "Drive-এ আপলোড করুন" বাটনে ক্লিক করে নতুন ফাইল যুক্ত করতে পারেন
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                    {files.map((file) => {
                      const isPdf = file.mimeType === 'application/pdf';
                      const link =
                        file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
                      return (
                        <div
                          key={file.id}
                          className="p-3 hover:bg-blue-50/40 flex items-center justify-between gap-3 transition-colors text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isPdf
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-blue-50 text-blue-600'
                              }`}
                            >
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 truncate" title={file.name}>
                                {file.name}
                              </p>
                              <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                                <span>{formatBytes(file.size)}</span>
                                {file.modifiedTime && (
                                  <span>
                                    {new Date(file.modifiedTime).toLocaleDateString('bn-BD')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              title="ড্রাইভে দেখুন"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>

                            <button
                              onClick={() => handleDelete(file)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                              title="মুছে ফেলুন"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            {onSelectFile && (
                              <button
                                onClick={() => {
                                  onSelectFile({
                                    id: file.id,
                                    name: file.name,
                                    webViewLink: link,
                                  });
                                  onClose();
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>নির্বাচন</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
          <span>Google Drive Cloud Storage</span>
          <Button variant="outline" size="sm" onClick={onClose}>
            বন্ধ করুন
          </Button>
        </div>
      </div>
    </div>
  );
};
