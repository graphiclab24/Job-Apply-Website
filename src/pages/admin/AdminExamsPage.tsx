import React, { useEffect, useState } from 'react';
import { collection, getDocs, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { ExamNotice } from '../../types';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../components/common/Toast';
import { invalidateCache } from '../../services/cache';
import { Award, Plus, Trash2, Calendar, FileText } from 'lucide-react';

export const AdminExamsPage: React.FC = () => {
  const [notices, setNotices] = useState<ExamNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('Exam Date');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  const fetchNotices = async () => {
    try {
      const res = await fetch('/api/exams');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.exams)) {
          setNotices(data.exams);
          return;
        }
      }
      const snap = await getDocs(collection(db, 'exams'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamNotice));
      setNotices(list);
    } catch (e) {
      // Silently handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, []);

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    setSaving(true);
    try {
      const noticeData = {
        title,
        date: date || new Date().toISOString().slice(0, 10),
        category,
        content,
      };

      const res = await fetch('/api/admin/exams/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noticeData),
      });

      if (!res.ok) {
        throw new Error('সার্ভারে সেভ করতে সমস্যা হয়েছে');
      }

      success('পরীক্ষা নোটিশ প্রকাশ ও R2-তে সংরক্ষিত হয়েছে');
      invalidateCache('exams_');
      setTitle('');
      setDate('');
      setContent('');
      setModalOpen(false);
      fetchNotices();
    } catch (err: any) {
      console.error('Exam save error:', err);
      error(err?.message || 'নোটিশ সংরক্ষণ করতে ব্যর্থ হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে নোটিশটি মুছতে চান?')) return;
    try {
      await fetch(`/api/admin/exams/${id}`, { method: 'DELETE' });
      invalidateCache('exams_');
      setNotices(notices.filter((n) => n.id !== id));
      success('নোটিশ মুছে ফেলা হয়েছে');
    } catch (err: any) {
      console.error('Exam delete error:', err);
      error(err?.message || 'মুছতে ব্যর্থ হয়েছে');
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
          কোনো নোটিশ নেই। "নতুন নোটিশ দিন" বাটনে চাপুন।
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
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="নতুন পরীক্ষা / রেজাল্ট নোটিশ">
        <form onSubmit={handleCreateNotice} className="space-y-4">
          <Input label="নোটিশের শিরোনাম" placeholder="যেমন: ৪৬তম বিসিএস প্রিলিমিনারি পরীক্ষার তারিখ" value={title} onChange={(e) => setTitle(e.target.value)} requiredStar />
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
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
