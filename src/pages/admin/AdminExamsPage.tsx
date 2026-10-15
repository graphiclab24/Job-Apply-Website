import React, { useEffect, useState } from 'react';
import { ExamNotice } from '../../types';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../components/common/Toast';
import { invalidateCache, setCached } from '../../services/cache';
import { compressImageToDataUrl } from '../../services/files';
import { R2_BASE, putPublicJson, uploadPublicImage } from '../../services/jobsStore';
import { Plus, Trash2, Calendar, Image as ImageIcon, X } from 'lucide-react';

// সর্বোচ্চ কতটি নোটিশ রাখা হবে (exams.json ছোট রাখতে)
const MAX_NOTICES = 50;

type Notice = ExamNotice & { imageUrl?: string };

export const AdminExamsPage: React.FC = () => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('Exam Date');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  // R2-এর exams.json থেকে তালিকা (Firestore নয়)
  const fetchNotices = async () => {
    try {
      const res = await fetch(`${R2_BASE}/exams.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`exams.json লোড ব্যর্থ (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('exams.json-এর ফরম্যাট ভুল');
      }
      setNotices(data);
    } catch (err: any) {
      console.error('Exams load failed:', err);
      error(err?.message || 'নোটিশ তালিকা লোড করা যায়নি');
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

  // তালিকা Worker দিয়ে R2-তে সংরক্ষণ (নতুনটি উপরে)
  const persist = async (list: Notice[]) => {
    await putPublicJson('exams', list);
    setNotices(list);
    setCached('exams_home', list.slice(0, 4));
    invalidateCache('exams_');
  };

  const resetForm = () => {
    setTitle('');
    setDate('');
    setContent('');
    setCategory('Exam Date');
    setImageFile(null);
    setImagePreview('');
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview('');
    }
  };

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const id = `exam-${Date.now()}`;

      // ছবি থাকলে ছোট করে R2-তে আপলোড, তারপর URL সহ নোটিশ সেভ
      let imageUrl: string | undefined;
      if (imageFile) {
        const compressed = await compressImageToDataUrl(imageFile, 1200, 1200, 400 * 1024, 'image/jpeg');
        const blob = await (await fetch(compressed.dataUrl)).blob();
        imageUrl = await uploadPublicImage('exams', `${id}.jpg`, blob);
      }

      const newNotice: Notice = {
        id,
        title: title.trim(),
        date: date || now.slice(0, 10),
        category: category || 'Exam Date',
        content: content || '',
        ...(imageUrl ? { imageUrl } : {}),
        createdAt: now,
        updatedAt: now,
      } as Notice;

      const list = [newNotice, ...notices.filter((n) => n.id !== id)].slice(0, MAX_NOTICES);
      await persist(list);

      success('পরীক্ষা নোটিশ সফলভাবে সংরক্ষিত ও প্রকাশিত হয়েছে!');
      resetForm();
      setModalOpen(false);
    } catch (err: any) {
      console.error('Exam save error:', err);
      error(err?.message || 'নোটিশ সংরক্ষণ করতে ব্যর্থ হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে নোটিশটি মুছতে চান?')) return;
    try {
      await persist(notices.filter((n) => n.id !== id));
      success('নোটিশ মুছে ফেলা হয়েছে');
    } catch (err: any) {
      console.error('Exam delete error:', err);
      error(err?.message || 'মুছতে ব্যর্থ হয়েছে');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">পরীক্ষা ও রেজাল্ট নোটিশ</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            পরীক্ষার সময়সূচী, এডমিট কার্ড ও ফলাফল সংক্রান্ত আপডেট প্রকাশ করুন
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} icon={<Plus className="w-4 h-4" />}>
          নতুন নোটিশ দিন
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" text="নোটিশ লোড হচ্ছে..." />
        </div>
      ) : notices.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-gray-200 text-gray-500 text-xs">
          কোনো নোটিশ নেই। &quot;নতুন নোটিশ দিন&quot; বাটনে চাপুন।
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notices.map((n) => (
            <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700">
                    {n.category}
                  </span>
                  <button onClick={() => handleDelete(n.id)} className="text-rose-500 hover:text-rose-700 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {n.imageUrl && (
                  <img
                    src={n.imageUrl}
                    alt={n.title}
                    loading="lazy"
                    className="w-full max-h-48 object-contain rounded-lg border border-gray-100 bg-gray-50 mb-2"
                  />
                )}
                <h3 className="font-bold text-gray-900 text-sm mb-1">{n.title}</h3>
                <p className="text-xs text-gray-600 line-clamp-3">{n.content}</p>
              </div>
              <div className="pt-3 mt-3 border-t border-gray-100 flex items-center gap-1.5 text-[11px] text-gray-400">
                <Calendar className="w-3.5 h-3.5" />
                <span>তারিখ: {n.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title="নতুন পরীক্ষা / রেজাল্ট নোটিশ"
      >
        <form onSubmit={handleCreateNotice} className="space-y-4">
          <Input
            label="নোটিশের শিরোনাম"
            placeholder="যেমন: ৪৬তম বিসিএস প্রিলিমিনারি পরীক্ষার তারিখ"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            requiredStar
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="তারিখ" type="date" value={date} onChange={(e) => setDate(e.target.value)} requiredStar />
            <Select
              label="ক্যাটাগরি"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: 'Exam Date', label: 'পরীক্ষার তারিখ' },
                { value: 'Admit Card', label: 'এডমিট কার্ড' },
                { value: 'Result', label: 'ফলাফল / রেজাল্ট' },
                { value: 'Notice', label: 'সাধারণ নোটিশ' },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">নোটিশের বিবরণ / বিস্তারিত</label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="পরীক্ষার কেন্দ্র, আসন বিন্যাস বা নির্দেশনা লিখুন..."
              className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-emerald-600"
            />
          </div>

          {/* ছবি যোগ (ঐচ্ছিক) */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ছবি যোগ করুন (ঐচ্ছিক)</label>
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Preview" className="max-h-40 rounded-lg border border-gray-200" />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview('');
                  }}
                  className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-md"
                  title="ছবি সরান"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-lg cursor-pointer text-xs text-gray-600">
                <ImageIcon className="w-4 h-4" />
                <span>ছবি নির্বাচন করুন (JPG, PNG, WebP)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImagePick} className="hidden" />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
            >
              বাতিল
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              প্রকাশ করুন
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
