import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import {
  Link2,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Plus,
  BarChart2,
  QrCode,
  Sparkles,
  Search,
  MousePointerClick,
  Globe,
  Share2,
  X,
  Download,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Spinner } from '../../components/common/Spinner';
import { useToast } from '../../components/common/Toast';

interface ShortLink {
  id: string; // The short code (e.g. railway, job123)
  originalUrl: string;
  title?: string;
  clicks: number;
  createdAt?: any;
  lastClickedAt?: any;
}

export const AdminUrlShortenerPage: React.FC = () => {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Form state
  const [originalUrl, setOriginalUrl] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [title, setTitle] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // QR Modal state
  const [qrModalLink, setQrModalLink] = useState<ShortLink | null>(null);

  const { success, error: toastError } = useToast();
  const domain = 'https://bdjobapply.site';

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'short_links'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const items: ShortLink[] = [];
      snap.forEach((d) => {
        items.push({ id: d.id, ...(d.data() as any) });
      });
      setLinks(items);
    } catch (err: any) {
      console.warn('Short links fetch note:', err);
      // Fallback query if index is building
      try {
        const snap = await getDocs(collection(db, 'short_links'));
        const items: ShortLink[] = [];
        snap.forEach((d) => {
          items.push({ id: d.id, ...(d.data() as any) });
        });
        setLinks(items);
      } catch (e: any) {
        toastError('শর্ট লিংকগুলো লোড করতে সমস্যা হয়েছে');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  // Generate random 5-char code
  const handleGenerateRandomCode = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let res = '';
    for (let i = 0; i < 5; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCustomCode(res);
  };

  // Paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.startsWith('http')) {
        setOriginalUrl(text);
        success('ক্লিপবোর্ড থেকে লিংক পেস্ট করা হয়েছে');
      } else {
        toastError('ক্লিপবোর্ডে কোনো সঠিক লিংক পাওয়া যায়নি');
      }
    } catch {
      toastError('ক্লিপবোর্ড অ্যাক্সেস পারমিশন প্রয়োজন');
    }
  };

  // Create Short Link
  const handleCreateShortLink = async (e: React.FormEvent) => {
    e.preventDefault();

    let cleanUrl = originalUrl.trim();
    if (!cleanUrl) {
      toastError('মূল লিংকটি প্রদান করুন');
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    let code = customCode.trim().toLowerCase();
    if (!code) {
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    // Clean code (only a-z, 0-9, and hyphen)
    code = code.replace(/[^a-z0-9_-]/g, '');
    if (code.length < 2) {
      toastError('কোড কমপক্ষে ২ অক্ষরের হতে হবে');
      return;
    }

    // Check existing
    if (links.some((l) => l.id.toLowerCase() === code)) {
      toastError(`'${code}' কোডটি ইতিমধ্যে ব্যবহৃত হয়েছে! অন্য একটি কোড দিন।`);
      return;
    }

    setSaving(true);
    try {
      const newDoc: ShortLink = {
        id: code,
        originalUrl: cleanUrl,
        title: title.trim() || undefined,
        clicks: 0,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'short_links', code), newDoc);

      setLinks((prev) => [
        { ...newDoc, createdAt: new Date() },
        ...prev,
      ]);

      // Reset form
      setOriginalUrl('');
      setCustomCode('');
      setTitle('');

      success(`শর্ট লিংক সফলভাবে তৈরি হয়েছে! (${domain}/s/${code})`);
    } catch (err: any) {
      toastError(err.message || 'শর্ট লিংক সংরক্ষণ করতে সমস্যা হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  // Copy Short Link
  const handleCopyLink = (code: string) => {
    const fullUrl = `${domain}/s/${code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(code);
    success('শর্ট লিংক ক্লিপবোর্ডে কপি হয়েছে!');
    setTimeout(() => {
      setCopiedId(null);
    }, 2500);
  };

  // Delete Short Link
  const handleDeleteLink = async (code: string) => {
    if (!window.confirm(`আপনি কি নিশ্চিত যে '${code}' শর্ট লিংকটি মুছে ফেলতে চান?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'short_links', code));
      setLinks((prev) => prev.filter((l) => l.id !== code));
      success('শর্ট লিংক মুছে ফেলা হয়েছে');
    } catch (err: any) {
      toastError(err.message || 'মুছে ফেলতে সমস্যা হয়েছে');
    }
  };

  // Filter links
  const filteredLinks = links.filter(
    (l) =>
      l.id.toLowerCase().includes(search.toLowerCase()) ||
      (l.title && l.title.toLowerCase().includes(search.toLowerCase())) ||
      l.originalUrl.toLowerCase().includes(search.toLowerCase())
  );

  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const mostPopular = [...links].sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">কাস্টম URL শর্টনার</h1>
              <p className="text-xs text-gray-500">
                সম্পূর্ণ ০ খরচে নিজস্ব ডোমেইনে যেকোনো বড় লিংক ছোট করুন ও ক্লিকের পরিসংখ্যান ট্র্যাক করুন
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-full text-xs font-semibold border border-emerald-200 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            <span>ডোমেন: {domain}/s/</span>
          </span>
        </div>
      </div>

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-gray-500 font-medium block">মোট শর্ট লিংক</span>
            <span className="text-xl font-extrabold text-gray-900">{links.length} টি</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <MousePointerClick className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-gray-500 font-medium block">মোট ভিজিটর ক্লিক</span>
            <span className="text-xl font-extrabold text-gray-900">{totalClicks.toLocaleString('bn-BD')} বার</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div className="truncate">
            <span className="text-xs text-gray-500 font-medium block">সর্বোচ্চ ভিজিট লিংক</span>
            <span className="text-sm font-bold text-gray-900 truncate block">
              {mostPopular ? (
                <>
                  <span className="text-emerald-700">/s/{mostPopular.id}</span>{' '}
                  <span className="text-xs text-gray-400">({mostPopular.clicks} ক্লিক)</span>
                </>
              ) : (
                'তথ্য নেই'
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Create Short Link Form Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
          <Plus className="w-4 h-4 text-emerald-600" />
          <span>নতুন শর্ট লিংক তৈরি করুন</span>
        </h3>

        <form onSubmit={handleCreateShortLink} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original URL */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-700">
                  মূল গন্তব্য লিংক (Destination URL) <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Copy className="w-3 h-3" />
                  <span>ক্লিপবোর্ড থেকে পেস্ট</span>
                </button>
              </div>
              <input
                type="url"
                required
                placeholder="https://bdjobapply.site/jobs/railway-circular বা https://teletalk.com.bd/..."
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs bg-white text-gray-900"
              />
            </div>

            {/* Custom Short Code */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-700">
                  কাস্টম কোড (Custom Code)
                </label>
                <button
                  type="button"
                  onClick={handleGenerateRandomCode}
                  className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>অটো কোড তৈরি</span>
                </button>
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-xs text-gray-400 font-mono select-none">
                  /s/
                </span>
                <input
                  type="text"
                  placeholder="যেমন: railway, police26 (খালি রাখলে স্বয়ংক্রিয় তৈরি হবে)"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs bg-white text-gray-900 font-mono"
                />
              </div>
              <p className="text-[10px] text-gray-400">ছোট হাতের ইংরেজি অক্ষর ও সংখ্যা ব্যবহার করুন</p>
            </div>

            {/* Title / Description */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">
                টাইটেল বা বিবরণ (ঐচ্ছিক)
              </label>
              <input
                type="text"
                placeholder="যেমন: বাংলাদেশ রেলওয়ে নিয়োগ ২০২৬ লিংক"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs bg-white text-gray-900"
              />
              <p className="text-[10px] text-gray-400">সহজে চেনার জন্য একটি নাম দিতে পারেন</p>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 truncate">
              <Globe className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-gray-600">শর্ট লিংক কেমন দেখাবে:</span>
              <strong className="text-emerald-900 font-mono truncate">
                {domain}/s/{customCode || 'your-code'}
              </strong>
            </div>

            <Button type="submit" loading={saving} icon={<Plus className="w-4 h-4" />}>
              শর্ট লিংক তৈরি করুন
            </Button>
          </div>
        </form>
      </div>

      {/* Saved Short Links Table Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">সংরক্ষিত শর্ট লিংকসমূহ</h3>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
              {filteredLinks.length}টি
            </span>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="কোড বা লিংক দিয়ে খুঁজুন..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-gray-50 text-gray-900"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Spinner size="md" text="শর্ট লিংকগুলো লোড হচ্ছে..." />
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="py-16 text-center text-gray-400 space-y-2">
            <Link2 className="w-8 h-8 mx-auto text-gray-300" />
            <p className="text-xs">কোনো শর্ট লিংক পাওয়া যায়নি</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-700 uppercase tracking-wider font-semibold border-b border-gray-100">
                <tr>
                  <th className="p-3.5">শর্ট লিংক ও টাইটেল</th>
                  <th className="p-3.5">মূল গন্তব্য লিংক</th>
                  <th className="p-3.5 text-center">ক্লিক সংখ্যা</th>
                  <th className="p-3.5 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLinks.map((item) => {
                  const fullShortUrl = `${domain}/s/${item.id}`;
                  const isCopied = copiedId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="p-3.5 space-y-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyLink(item.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono font-bold rounded-lg border border-emerald-200 transition-colors group"
                            title="ক্লিপবোর্ডে কপি করতে ক্লিক করুন"
                          >
                            <span>/s/{item.id}</span>
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-emerald-600 opacity-60 group-hover:opacity-100" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setQrModalLink(item)}
                            className="p-1 hover:bg-gray-100 text-gray-500 rounded-md transition-colors"
                            title="QR কোড দেখুন ও ডাউনলোড করুন"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {item.title && (
                          <p className="text-gray-900 font-medium text-xs">{item.title}</p>
                        )}
                      </td>

                      <td className="p-3.5 max-w-xs">
                        <a
                          href={item.originalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-600 hover:text-emerald-700 hover:underline flex items-center gap-1 truncate font-mono text-[11px]"
                          title={item.originalUrl}
                        >
                          <span className="truncate">{item.originalUrl}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                        </a>
                      </td>

                      <td className="p-3.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-800 rounded-full font-bold text-xs">
                          <MousePointerClick className="w-3 h-3 text-emerald-600" />
                          <span>{item.clicks || 0}</span>
                        </span>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyLink(item.id)}
                            className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{isCopied ? 'কপি হয়েছে' : 'কপি'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteLink(item.id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {qrModalLink && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setQrModalLink(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl space-y-4 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="text-left">
                <h4 className="text-sm font-bold text-gray-900">শর্ট লিংক QR কোড</h4>
                <p className="text-[11px] text-gray-500 font-mono">/s/{qrModalLink.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalLink(null)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR Image */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 inline-block">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                  `${domain}/s/${qrModalLink.id}`
                )}`}
                alt={`QR code for /s/${qrModalLink.id}`}
                className="w-48 h-48 mx-auto rounded-lg shadow-xs"
              />
            </div>

            <p className="text-xs text-gray-600 font-mono">
              {domain}/s/{qrModalLink.id}
            </p>

            <div className="flex gap-2">
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(
                  `${domain}/s/${qrModalLink.id}`
                )}`}
                download={`qr_code_${qrModalLink.id}.png`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>QR কোড ডাউনলোড</span>
              </a>
              <button
                type="button"
                onClick={() => handleCopyLink(qrModalLink.id)}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>কপি</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
