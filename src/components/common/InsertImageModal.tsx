import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  HardDrive,
  Link as LinkIcon,
  Image as ImageIcon,
  Check,
  AlertCircle,
  FolderCheck,
  Trash2,
  Layers,
  Sparkles,
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

interface SelectedFileItem {
  id: string;
  file: File;
  previewUrl: string;
}

export const InsertImageModal: React.FC<Props> = ({ isOpen, onClose, onInsertImage }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'drive' | 'url'>('upload');

  // Google Drive connection state
  const [driveConnected, setDriveConnected] = useState(isDriveConnected());
  const [driveUser, setDriveUser] = useState(getDriveUser());
  const [connectingDrive, setConnectingDrive] = useState(false);

  // Multiple files state
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([]);
  const [altText, setAltText] = useState('নিয়োগ বিজ্ঞপ্তির সার্কুলার ইমেজ');
  const [layoutMode, setLayoutMode] = useState<'stacked' | 'grid'>('stacked');
  const [uploading, setUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');

  // Drive files state
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [selectedDriveFileIds, setSelectedDriveFileIds] = useState<string[]>([]);

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
      setSelectedFiles([]);
      setSelectedDriveFileIds([]);
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
      const files = await listDriveFiles({ mimeFilter: 'images', pageSize: 30 });
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

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: SelectedFileItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      newItems.push({
        id: `${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
      });
    }

    setSelectedFiles((prev) => [...prev, ...newItems]);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (id: string) => {
    setSelectedFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleUploadAndInsert = async () => {
    if (selectedFiles.length === 0) {
      setErrorMsg('অনুগ্রহ করে এক বা একাধিক ছবি নির্বাচন করুন');
      return;
    }

    setUploading(true);
    setErrorMsg('');

    try {
      const uploadedUrls: { url: string; label: string }[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const item = selectedFiles[i];
        const pageNum = i + 1;
        const total = selectedFiles.length;

        setUploadProgressMsg(
          total > 1
            ? `ছবি (${pageNum}/${total}) অপ্টিমাইজ ও আপলোড হচ্ছে...`
            : 'ছবি অপ্টিমাইজ ও প্রস্তুত করা হচ্ছে...'
        );

        let finalImgUrl = '';
        if (driveConnected) {
          const res = await uploadJobImageToDrive(item.file, item.file.name);
          finalImgUrl = res.directImageUrl;
        } else {
          // Compress to clean lightweight WebP/JPEG data URL (<150KB)
          const compressed = await compressImageToDataUrl(
            item.file,
            1200,
            1600,
            150 * 1024,
            'image/jpeg'
          );
          finalImgUrl = compressed.dataUrl;
        }

        const label = total > 1 ? `পাতা ${pageNum}` : 'সার্কুলার ইমেজ';
        uploadedUrls.push({ url: finalImgUrl, label });
      }

      // Generate clean HTML
      let htmlOutput = '';
      if (layoutMode === 'stacked' || uploadedUrls.length === 1) {
        htmlOutput = uploadedUrls
          .map((img, idx) => {
            const pageCaption =
              uploadedUrls.length > 1
                ? `<p style="text-align:center; font-size:12px; color:#4b5563; margin-top:6px; font-weight:600;">[ ${img.label} ]</p>`
                : '';
            return `<div style="text-align:center; margin:20px 0;"><img src="${img.url}" alt="${altText} - ${img.label}" style="max-width:100%; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.12); margin:0 auto; display:block;" />${pageCaption}</div>`;
          })
          .join('\n');
      } else {
        // Grid 2-column layout
        const gridItems = uploadedUrls
          .map(
            (img) =>
              `<div style="flex:1 1 45%; min-width:280px; text-align:center;"><img src="${img.url}" alt="${altText} - ${img.label}" style="width:100%; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.12); display:block;" /><p style="font-size:12px; color:#4b5563; margin-top:6px; font-weight:600;">[ ${img.label} ]</p></div>`
          )
          .join('\n');
        htmlOutput = `<div style="display:flex; flex-wrap:wrap; gap:16px; margin:20px 0; justify-content:center;">${gridItems}</div>`;
      }

      onInsertImage(htmlOutput);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'ছবি আপলোড করতে সমস্যা হয়েছে');
    } finally {
      setUploading(false);
      setUploadProgressMsg('');
    }
  };

  const handleToggleDriveSelect = (id: string) => {
    setSelectedDriveFileIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleInsertSelectedDriveFiles = () => {
    if (selectedDriveFileIds.length === 0) return;
    const selectedItems = driveFiles.filter((f) => selectedDriveFileIds.includes(f.id));

    let htmlOutput = selectedItems
      .map((f, idx) => {
        const directUrl = getDriveDirectImageUrl(f.id);
        const caption =
          selectedItems.length > 1
            ? `<p style="text-align:center; font-size:12px; color:#4b5563; margin-top:6px; font-weight:600;">[ পাতা ${idx + 1} ]</p>`
            : '';
        return `<div style="text-align:center; margin:20px 0;"><img src="${directUrl}" alt="${f.name || 'Circular Image'}" style="max-width:100%; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.12); margin:0 auto; display:block;" />${caption}</div>`;
      })
      .join('\n');

    onInsertImage(htmlOutput);
    onClose();
  };

  const handleInsertFromUrl = () => {
    if (!imageUrlInput.trim()) {
      setErrorMsg('ছবির লিংক লিখুন');
      return;
    }
    const imgTag = `<div style="text-align:center; margin:20px 0;"><img src="${imageUrlInput.trim()}" alt="${altText || 'Circular Image'}" style="max-width:100%; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.12); margin:0 auto; display:block;" /></div>`;
    onInsertImage(imgTag);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">
                বিজ্ঞপ্তিতে একাধিক ছবি আপলোড ও যুক্ত করুন
              </h3>
              <p className="text-xs text-gray-500">
                এক সাথে একাধিক পাতা/ছবি সিলেক্ট করুন, স্বয়ংক্রিয়ভাবে সিরিয়ালে সুন্দরভাবে সাজিয়ে দেবে
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
                <span>Google Drive সংযুক্ত: {driveUser?.email || 'অ্যাকাউন্ট'}</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-mono">
                  BD Job Circular Images ফোল্ডার
                </span>
              </span>
            ) : (
              <span>Google Drive সংযুক্ত করলে ছবি আনলিমিটেড স্টোরেজে জমা থাকবে</span>
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
            <span>ডিভাইস থেকে একাধিক ছবি আপলোড ({selectedFiles.length})</span>
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
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* TAB 1: MULTIPLE FILE UPLOAD */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-gray-50/60 hover:bg-emerald-50/40"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFilesSelect}
                  className="hidden"
                />
                <div className="mx-auto w-12 h-12 bg-white rounded-full border border-gray-200 flex items-center justify-center text-emerald-600 mb-2 shadow-xs">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-gray-800">
                  এক সাথে এক বা একাধিক ছবি নির্বাচন করতে ক্লিক করুন
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  JPG, PNG অথবা WebP ফরম্যাট। একাধিক পাতা থাকলে একসাথে সব সিলেক্ট করুন।
                </p>
                {driveConnected && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-2 flex items-center justify-center gap-1">
                    <FolderCheck className="w-3.5 h-3.5" />
                    <span>Google Drive এর &quot;BD Job Circular Images&quot; ফোল্ডারে সংরক্ষিত হবে</span>
                  </p>
                )}
              </div>

              {/* Selected Files Preview Strip */}
              {selectedFiles.length > 0 && (
                <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-800 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>নির্বাচিত ছবি ({selectedFiles.length}টি পাতা):</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      className="text-rose-600 hover:underline text-[11px] font-semibold"
                    >
                      সব মুছুন
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-56 overflow-y-auto p-1">
                    {selectedFiles.map((item, idx) => (
                      <div
                        key={item.id}
                        className="relative group bg-white border border-gray-200 rounded-xl overflow-hidden p-1.5 shadow-xs flex flex-col"
                      >
                        <div className="relative h-24 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                          <img
                            src={item.previewUrl}
                            alt={`Preview ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                            পাতা {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFile(item.id);
                            }}
                            className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-md opacity-80 hover:opacity-100 transition-opacity"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-[10px] text-gray-600 truncate mt-1 px-1 font-medium">
                          {item.file.name}
                        </span>
                        <span className="text-[9px] text-gray-400 px-1">
                          {(item.file.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Layout Option */}
                  {selectedFiles.length > 1 && (
                    <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-gray-700 font-semibold">বিজ্ঞপ্তিতে পাতার বিন্যাস:</span>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">
                          <input
                            type="radio"
                            name="layout"
                            checked={layoutMode === 'stacked'}
                            onChange={() => setLayoutMode('stacked')}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>একটির নিচে আরেকটি (ফুল সাইজ)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">
                          <input
                            type="radio"
                            name="layout"
                            checked={layoutMode === 'grid'}
                            onChange={() => setLayoutMode('grid')}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>পাশাপাশি ২ কলাম (গ্রিড)</span>
                        </label>
                      </div>
                    </div>
                  )}
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
                  placeholder="যেমন: নিয়োগ বিজ্ঞপ্তির পাতা"
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
                  Google Drive-এ কোনো ছবি পাওয়া যায়নি। &quot;ডিভাইস থেকে একাধিক ছবি আপলোড&quot; ট্যাব থেকে নতুন ছবি আপলোড করুন।
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>ছবিতে ক্লিক করে এক বা একাধিক সিলেক্ট করুন:</span>
                    {selectedDriveFileIds.length > 0 && (
                      <span className="text-emerald-700 font-bold">
                        {selectedDriveFileIds.length}টি ছবি নির্বাচিত
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1">
                    {driveFiles.map((f) => {
                      const isSelected = selectedDriveFileIds.includes(f.id);
                      return (
                        <div
                          key={f.id}
                          onClick={() => handleToggleDriveSelect(f.id)}
                          className={`relative group border rounded-xl p-2 text-center cursor-pointer transition-all hover:shadow-xs bg-white flex flex-col items-center justify-between ${
                            isSelected
                              ? 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50/20'
                              : 'border-gray-200 hover:border-emerald-400'
                          }`}
                        >
                          <div className="w-full h-16 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden mb-1 relative">
                            {f.thumbnailLink ? (
                              <img src={f.thumbnailLink} alt={f.name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-gray-400" />
                            )}
                            {isSelected && (
                              <div className="absolute top-1 right-1 bg-emerald-600 text-white rounded-full p-0.5 shadow-xs">
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-700 truncate w-full font-medium">
                            {f.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
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
              disabled={selectedFiles.length === 0}
              icon={<Upload className="w-3.5 h-3.5" />}
              size="sm"
            >
              {uploadProgressMsg ||
                (selectedFiles.length > 1
                  ? `সবগুলো ছবি (${selectedFiles.length}টি) বিজ্ঞপ্তিতে যুক্ত করুন`
                  : 'ছবি আপলোড ও ইনসার্ট করুন')}
            </Button>
          )}

          {activeTab === 'drive' && (
            <Button
              type="button"
              onClick={handleInsertSelectedDriveFiles}
              disabled={selectedDriveFileIds.length === 0}
              icon={<Check className="w-3.5 h-3.5" />}
              size="sm"
            >
              নির্বাচিত ছবি ({selectedDriveFileIds.length}টি) যুক্ত করুন
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
