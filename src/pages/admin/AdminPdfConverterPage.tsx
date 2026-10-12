import React, { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  FileText,
  Upload,
  Download,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Maximize2,
  X,
  RotateCcw,
  Sparkles,
  Layers,
  Copy,
  Check,
  FileCheck,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';

// Configure pdfjs worker using unpkg or cdnjs
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface ConvertedPage {
  pageNum: number;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  format: 'image/jpeg' | 'image/webp';
}

export const AdminPdfConverterPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [pages, setPages] = useState<ConvertedPage[]>([]);
  const [lightboxPage, setLightboxPage] = useState<ConvertedPage | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Conversion options
  const [scale, setScale] = useState<number>(2.0); // 2.0 = High resolution for Bengali fonts
  const [quality, setQuality] = useState<number>(0.92);
  const [format, setFormat] = useState<'image/jpeg' | 'image/webp'>('image/jpeg');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { success, error: toastError } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.type !== 'application/pdf' && !selected.name.toLowerCase().endsWith('.pdf')) {
      toastError('অনুগ্রহ করে শুধুমাত্র PDF ফাইল নির্বাচন করুন');
      return;
    }

    setFile(selected);
    setPages([]);
    setProgress(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;

    if (dropped.type !== 'application/pdf' && !dropped.name.toLowerCase().endsWith('.pdf')) {
      toastError('অনুগ্রহ করে শুধুমাত্র PDF ফাইল ড্রপ করুন');
      return;
    }

    setFile(dropped);
    setPages([]);
    setProgress(null);
  };

  // Convert PDF to Images
  const handleConvertPdf = async () => {
    if (!file) {
      toastError('প্রথমে একটি PDF ফাইল আপলোড করুন');
      return;
    }

    setConverting(true);
    setPages([]);
    setProgress({ current: 0, total: 1 });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      setProgress({ current: 0, total: numPages });
      const convertedList: ConvertedPage[] = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        setProgress({ current: pageNum, total: numPages });

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('ক্যানভাস প্রসেসিং ব্যর্থ হয়েছে');
        }

        // Fill white background for clean rendering
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        } as any).promise;

        const dataUrl = canvas.toDataURL(format, quality);
        const base64Str = dataUrl.split(',')[1] || '';
        const sizeBytes = Math.round((base64Str.length * 3) / 4);

        convertedList.push({
          pageNum,
          dataUrl,
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
          sizeBytes,
          format,
        });
      }

      setPages(convertedList);
      success(`সফলভাবে ${numPages}টি পাতা রূপান্তর সম্পন্ন হয়েছে!`);
    } catch (err: any) {
      console.error('PDF conversion error:', err);
      toastError(err.message || 'PDF রূপান্তর করতে সমস্যা হয়েছে। ফাইলটি সুরক্ষিত বা ক্ষতিগ্রস্ত হতে পারে।');
    } finally {
      setConverting(false);
      setProgress(null);
    }
  };

  // Download Single Page
  const handleDownloadSingle = (page: ConvertedPage) => {
    const link = document.createElement('a');
    const ext = page.format === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file?.name ? file.name.replace(/\.[^/.]+$/, '') : 'circular';
    link.download = `${baseName}_page_${page.pageNum}.${ext}`;
    link.href = page.dataUrl;
    link.click();
    success(`পাতা ${page.pageNum} ডাউনলোড শুরু হয়েছে!`);
  };

  // Download All Pages Sequentially
  const handleDownloadAll = () => {
    if (pages.length === 0) return;

    pages.forEach((page, idx) => {
      setTimeout(() => {
        const link = document.createElement('a');
        const ext = page.format === 'image/webp' ? 'webp' : 'jpg';
        const baseName = file?.name ? file.name.replace(/\.[^/.]+$/, '') : 'circular';
        link.download = `${baseName}_page_${page.pageNum}.${ext}`;
        link.href = page.dataUrl;
        link.click();
      }, idx * 300);
    });

    success(`সবগুলো (${pages.length}টি) পাতা ডাউনলোড হচ্ছে...`);
  };

  // Copy Data URL
  const handleCopyDataUrl = (dataUrl: string, idx: number) => {
    navigator.clipboard.writeText(dataUrl);
    setCopiedIdx(idx);
    success('ছবির ডাটা কপি করা হয়েছে!');
    setTimeout(() => setCopiedIdx(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">PDF to JPG কনভার্টার</h1>
            <p className="text-xs text-gray-500">
              সম্পূর্ণ ০ খরচে সরকারি ও বেসরকারি নিয়োগ বিজ্ঞপ্তির PDF ফাইলকে ঝকঝকে JPG/WebP ছবিতে রূপান্তর করুন
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-full text-xs font-semibold border border-emerald-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>১০০% আনলিমিটেড ও ফ্রি</span>
          </span>
        </div>
      </div>

      {/* Main Upload & Settings Section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
        {/* Drag & Drop Upload Area */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            file
              ? 'border-emerald-500 bg-emerald-50/20'
              : 'border-gray-300 hover:border-emerald-400 bg-gray-50/50 hover:bg-emerald-50/10'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,application/pdf"
            className="hidden"
          />

          <div className="max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 bg-white text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm border border-gray-100">
              {file ? <FileCheck className="w-7 h-7 text-emerald-600" /> : <Upload className="w-7 h-7 text-gray-400" />}
            </div>

            {file ? (
              <div>
                <h4 className="text-sm font-bold text-gray-900">{file.name}</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  সাইজ: {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <span className="inline-block mt-2 text-[11px] font-semibold text-emerald-700 hover:underline">
                  অন্য PDF সিলেক্ট করতে ক্লিক করুন
                </span>
              </div>
            ) : (
              <div>
                <h4 className="text-sm font-bold text-gray-800">
                  নিয়োগ বিজ্ঞপ্তির PDF ফাইল ড্রপ করুন অথবা ব্রাউজ করুন
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  যে কোনো সাইজের সার্কুলার PDF সাপোর্ট করে (১ বা একাধিক পাতা)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quality & Format Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
          {/* Format */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">ছবির ফরম্যাট</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as any)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="image/jpeg">JPG (স্ট্যান্ডার্ড ইমেজ)</option>
              <option value="image/webp">WebP (হালকা ও সুপারফাস্ট)</option>
            </select>
          </div>

          {/* Resolution / DPI */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">রেজোলিউশন / স্পষ্টতা</label>
            <select
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="1.5">স্ট্যান্ডার্ড (1.5x - দ্রুত লোডিং)</option>
              <option value="2.0">আল্ট্রা এইচডি (2.0x - ছোট বাংলা লেখা একদম স্পষ্ট)</option>
              <option value="2.5">সুপার শার্প (2.5x - সর্বোচ্চ কোয়ালিটি)</option>
            </select>
          </div>

          {/* Quality */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">কোয়ালিটি</label>
            <select
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="0.95">হাই কোয়ালিটি (৯৫%)</option>
              <option value="0.90">ব্যালান্সড (৯০%)</option>
              <option value="0.80">কম্প্রেসড (৮০%)</option>
            </select>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-gray-500">
            💡 আপনার ব্রাউজারে সম্পূর্ণ লোকাল প্রসেসিং হয়, ফলে কোনো সার্ভার ডেটা খরচ বা গোপনীয়তার ঝুঁকি নেই।
          </p>

          <Button
            onClick={handleConvertPdf}
            loading={converting}
            disabled={!file}
            icon={<ImageIcon className="w-4 h-4" />}
          >
            {converting ? 'রূপান্তর হচ্ছে...' : 'PDF থেকে ছবিতে রূপান্তর করুন'}
          </Button>
        </div>

        {/* Progress Bar */}
        {converting && progress && (
          <div className="space-y-2 pt-2 animate-fadeIn">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
              <span>পাতা {progress.current} / {progress.total} রূপান্তর হচ্ছে...</span>
              <span>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-200"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Results Gallery */}
      {pages.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-5 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  রূপান্তরিত পাতাসমূহ ({pages.length}টি পাতা)
                </h3>
                <p className="text-[11px] text-gray-500">
                  নিচের ছবিগুলো আপনি বিজ্ঞাপন পোস্ট বা আর্টিকেলে সরাসরি ব্যবহার করতে পারেন
                </p>
              </div>
            </div>

            <Button
              onClick={handleDownloadAll}
              icon={<Download className="w-4 h-4" />}
            >
              সবগুলো পাতা ডাউনলোড করুন
            </Button>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {pages.map((p, idx) => (
              <div
                key={p.pageNum}
                className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden flex flex-col shadow-2xs hover:shadow-sm transition-shadow"
              >
                {/* Header */}
                <div className="px-3.5 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center text-[10px]">
                      {p.pageNum}
                    </span>
                    <span>পাতা {p.pageNum}</span>
                  </span>

                  <span className="text-[11px] text-gray-500 font-mono">
                    {Math.round(p.sizeBytes / 1024)} KB
                  </span>
                </div>

                {/* Thumbnail View */}
                <div
                  className="relative group p-3 flex-1 flex items-center justify-center bg-gray-100 cursor-pointer overflow-hidden min-h-[260px]"
                  onClick={() => setLightboxPage(p)}
                >
                  <img
                    src={p.dataUrl}
                    alt={`Page ${p.pageNum}`}
                    className="max-h-72 w-auto object-contain rounded shadow-xs group-hover:scale-102 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <span className="px-3 py-1.5 bg-white/90 text-gray-900 rounded-lg text-xs font-bold flex items-center gap-1 shadow-md">
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>বড় করে দেখুন</span>
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadSingle(p)}
                    className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ডাউনলোড</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyDataUrl(p.dataUrl, idx)}
                    className="py-1.5 px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                    title="ছবির ডাটা কপি করুন"
                  >
                    {copiedIdx === idx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedIdx === idx ? 'কপি হয়েছে' : 'কপি'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox Preview Modal */}
      {lightboxPage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-between p-4 animate-fadeIn"
          onClick={() => setLightboxPage(null)}
        >
          <div
            className="w-full max-w-4xl flex items-center justify-between text-white py-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h4 className="text-sm font-bold">পাতা {lightboxPage.pageNum} প্রিভিউ</h4>
              <p className="text-xs text-white/70">
                {lightboxPage.width} × {lightboxPage.height} px ({Math.round(lightboxPage.sizeBytes / 1024)} KB)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadSingle(lightboxPage)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ডাউনলোড</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxPage(null)}
                className="p-1.5 bg-white/20 hover:bg-rose-600 text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 w-full overflow-auto flex items-center justify-center p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxPage.dataUrl}
              alt={`Full Page ${lightboxPage.pageNum}`}
              className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
          </div>

          <p className="text-white/60 text-xs text-center py-1">
            স্ক্রিনের বাইরে ক্লিক করুন অথবা ESC চাপুন
          </p>
        </div>
      )}
    </div>
  );
};
