import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  HardDrive,
  Link as LinkIcon,
  Image as ImageIcon,
  Check,
  AlertCircle,
  ExternalLink,
  FolderCheck,
} from 'lucide-react';
import {
  isDriveConnected,
  connectGoogleDrive,
  getDriveUser,
  uploadJobImageToDrive,
  listDriveFiles,
  getDriveDirectImageUrl,
  DriveFileItem,
} from '../../services/googleDrive';
import { compressImageToDataUrl } from '../../services/files';
import { Button } from './Button';
import { Spinner } from './Spinner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (imgHtml: string) => void;
}

export const InsertImageModal: React.FC<Props> = ({ isOpen, onClose, onInsertImage }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'drive' | 'url'>('upload');

  // Google Drive connection state
  const [driveConnected, setDriveConnected] = useState(isDriveConnected());
  const [driveUser, setDriveUser] = useState(getDriveUser());
  const [connectingDrive, setConnectingDrive] = useState(false);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [altText, setAltText] = useState('চাকরির সার্কুলার ইমেজ');
  const [uploading, setUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');

  // Drive files state
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);

  // URL state
  const [imageUrlInput, setImageUrlInput] = useState('');

  // Status & error messages
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDriveConnected(isDriveConnected());
      setDriveUser(getDriveUser());
      setErrorMsg('');
      setSelectedFile(null);
      setPreviewUrl('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'drive' && isDriveConnected()) {
      fetchDriveImages();
    }
  }, [isOpen, activeTab]);

  const fetchDriveImages = async () => {
    setLoadingDriveFiles(true);
    setErrorMsg('');
    try {
      const files = await listDriveFiles({ mimeFilter: 'images', pageSize: 24 });
      setDriveFiles(files);
    } catch (err: any) {
      setErrorMsg(err.message || 'ড্রাইভ থেকে ছবি লোড করা যায়নি');
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  const handleConnectDrive = async () => {
    setConnectingDrive(true);
    setErrorMsg('');
    try {
      await connectGoogleDrive();
      setDriveConnected(true);
      setDriveUser(getDriveUser());
      if (activeTab === 'drive') {
        fetchDriveImages();
      }
    } catch (err: any) {
      setErrorMsg(
        err.message ||
          'Google Drive কানেক্ট করা যায়নি। Firebase Console-এ bdjobapply.site অনুমোদিত আছে কি না নিশ্চিত করুন।'
      );
    } finally {
      setConnectingDrive(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setErrorMsg('');
  };

  const handleUploadAndInsert = async () => {
    if (!selectedFile) {
      setErrorMsg('অনুগ্রহ করে একটি ছবি নির্বাচন করুন');
      return;
    }

    setUploading(true);
    setErrorMsg('');

    try {
      let finalImgUrl = '';

      if (driveConnected) {
        setUploadProgressMsg('Google Drive এর "BD Job Circular Images" ফোল্ডারে আপলোড হচ্ছে...');
        const res = await uploadJobImageToDrive(selectedFile, selectedFile.name);
        finalImgUrl = res.directImageUrl;
      } else {
        // Fallback: Compress to lightweight WebP data URL
        setUploadProgressMsg('ছবি অপ্টিমাইজ ও প্রস্তুত করা হচ্ছে...');
        const compressed = await compressImageToDataUrl(selectedFile, 1200, 1600, 120 * 1024, 'image/jpeg');
        finalImgUrl = compressed.dataUrl;
      }

      const imgTag = `<p style="text-align:center; margin:16px 0;"><img src="${finalImgUrl}" alt="${altText || 'Circular Image'}" style="max-width:100%; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin:0 auto; display:block;" /></p>`;

      onInsertImage(imgTag);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'ছবি আপলোড করতে সমস্যা হয়েছে');
    } finally {
      setUploading(false);
      setUploadProgressMsg('');
    }
  };

  const handleInsertFromDriveFile = (file: DriveFileItem) => {
    const directUrl = getDriveDirectImageUrl(file.id);
    const imgTag = `<p style="text-align:center; margin:16px 0;"><img src="${directUrl}" alt="${file.name || 'Circular Image'}" style="max-width:100%; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin:0 auto; display:block;" /></p>`;
    onInsertImage(imgTag);
    onClose();
  };

  const handleInsertFromUrl = () => {
    if (!imageUrlInput.trim()) {
      setErrorMsg('ছবির লিংক লিখুন');
      return;
    }
    const imgTag = `<p style="text-align:center; margin:16px 0;"><img src="${imageUrlInput.trim()}" alt="${altText || 'Circular Image'}" style="max-width:100%; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin:0 auto; display:block;" /></p>`;
    onInsertImage(imgTag);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">বিজ্ঞপ্তিতে ছবি যুক্ত করুন</h3>
              <p className="text-xs text-gray-500">
                গুগল ড্রাইভ ফোল্ডারে আনলিমিটেড স্টোরেজ অথবা সরাসরি ডিভাইস থেকে আপলোড
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Google Drive Status Strip */}
        <div className="px-5 py-2.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-blue-900 font-medium">
            <HardDrive className="w-4 h-4 text-blue-600 shrink-0" />
            {driveConnected ? (
              <span className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Google Drive সংযুক্ত আছে: {driveUser?.email || 'অ্যাকাউন্ট'}</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-mono">
                  BD Job Circular Images ফোল্ডার
                </span>
              </span>
            ) : (
              <span>Google Drive সংযুক্ত করলে ছবি স্বয়ংক্রিয়ভাবে ড্রাইভে জমা হবে</span>
            )}
          </div>

          {!driveConnected && (
            <button
              type="button"
              onClick={handleConnectDrive}
              disabled={connectingDrive}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-[11px] transition-colors shrink-0 flex items-center gap-1"
            >
              {connectingDrive ? 'কানেক্ট হচ্ছে...' : 'কানেক্ট করুন'}
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 px-5 pt-2 gap-4 text-xs font-semibold text-gray-600">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'upload'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>সরাসরি আপলোড করুন</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drive')}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'drive'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Google Drive থেকে বাছুন</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'url'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>ইমেজ লিংক (URL)</span>
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">{errorMsg}</span>
              {errorMsg.includes('unauthorized-domain') && (
                <span className="text-[11px] text-rose-700 mt-1 block">
                  💡 সমাধান: <strong>Firebase Console</strong> &gt; <strong>Authentication</strong> &gt;{' '}
                  <strong>Settings</strong> &gt; <strong>Authorized Domains</strong>-এ গিয়ে{' '}
                  <code>bdjobapply.site</code> যুক্ত করুন।
                </span>
              )}
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* TAB 1: DIRECT FILE UPLOAD */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-gray-50/50 hover:bg-emerald-50/30"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="mx-auto w-12 h-12 bg-white rounded-full border border-gray-200 flex items-center justify-center text-emerald-600 mb-2 shadow-xs">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  {selectedFile ? selectedFile.name : 'ছবি বেছে নিতে এখানে ক্লিক করুন'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  JPG, PNG অথবা WebP ফরম্যাট (সর্বোচ্চ সাইজ ১০ MB)
                </p>
                {driveConnected && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-2 flex items-center justify-center gap-1">
                    <FolderCheck className="w-3.5 h-3.5" />
                    <span>Google Drive এর "BD Job Circular Images" ফোল্ডারে স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে</span>
                  </p>
                )}
              </div>

              {previewUrl && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <span className="text-xs font-bold text-gray-700 block">ছবির প্রিভিউ:</span>
                  <div className="rounded-lg overflow-hidden border border-gray-200 max-h-48 bg-white flex items-center justify-center">
                    <img src={previewUrl} alt="Preview" className="max-h-48 object-contain" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  ছবির বিবরণ / Alt Text (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="যেমন: নিয়োগ বিজ্ঞপ্তির পাতা ১"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>
          )}

          {/* TAB 2: PICK FROM GOOGLE DRIVE */}
          {activeTab === 'drive' && (
            <div className="space-y-3">
              {!driveConnected ? (
                <div className="text-center py-8 space-y-3">
                  <HardDrive className="w-12 h-12 text-gray-300 mx-auto" />
                  <p className="text-sm font-bold text-gray-800">Google Drive সংযুক্ত নেই</p>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    আপনার যেকোনো জিমেইল অ্যাকাউন্টের Google Drive সংযুক্ত করে সরাসরি ড্রাইভের ছবি এখানে বসাতে পারেন।
                  </p>
                  <Button onClick={handleConnectDrive} loading={connectingDrive} size="sm">
                    Google Drive সংযুক্ত করুন
                  </Button>
                </div>
              ) : loadingDriveFiles ? (
                <div className="py-12 flex justify-center">
                  <Spinner size="md" text="Google Drive থেকে ছবি লোড হচ্ছে..." />
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500">
                  Google Drive-এ কোনো ছবি পাওয়া যায়নি। &quot;সরাসরি আপলোড করুন&quot; ট্যাব থেকে নতুন ছবি আপলোড করুন।
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1">
                  {driveFiles.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => handleInsertFromDriveFile(f)}
                      className="group border border-gray-200 hover:border-emerald-600 rounded-lg p-2 text-center cursor-pointer transition-all hover:shadow-xs bg-white flex flex-col items-center justify-between"
                      title="ক্লিক করে এই ছবিটি বিজ্ঞপ্তিতে যুক্ত করুন"
                    >
                      <div className="w-full h-16 bg-gray-50 rounded flex items-center justify-center overflow-hidden mb-1">
                        {f.thumbnailLink ? (
                          <img src={f.thumbnailLink} alt={f.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      <span className="text-[10px] text-gray-700 truncate w-full group-hover:text-emerald-700 font-medium">
                        {f.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: IMAGE URL */}
          {activeTab === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  ছবির সরাসরি লিংক (Direct Image URL)
                </label>
                <input
                  type="text"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  ছবির বিবরণ / Alt Text
                </label>
                <input
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="যেমন: সরকারি সার্কুলার নোটিশ"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/70 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 font-semibold"
          >
            বাতিল
          </button>

          {activeTab === 'upload' && (
            <Button
              type="button"
              onClick={handleUploadAndInsert}
              loading={uploading}
              disabled={!selectedFile}
              icon={<Upload className="w-3.5 h-3.5" />}
              size="sm"
            >
              {uploadProgressMsg || 'ছবি আপলোড ও ইনসার্ট করুন'}
            </Button>
          )}

          {activeTab === 'url' && (
            <Button
              type="button"
              onClick={handleInsertFromUrl}
              disabled={!imageUrlInput.trim()}
              icon={<Check className="w-3.5 h-3.5" />}
              size="sm"
            >
              ছবি ইনসার্ট করুন
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
