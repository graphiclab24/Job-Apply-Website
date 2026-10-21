import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../../services/firebase';
import { WORKER_URL, R2_BASE } from '../../services/jobsStore';
import { useToast } from '../../components/common/Toast';
import { Spinner } from '../../components/common/Spinner';
import { Plus, Trash2, Save, ChevronDown, ChevronRight, Edit, ClipboardPaste } from 'lucide-react';

interface PrepItem {
  id: string;
  question: string;
  answer: string;
  note: string;
  tags: string[];
}

interface PrepTopic {
  id: string;
  name: string;
  items: PrepItem[];
}

interface PrepDoc {
  version: number;
  updatedAt?: string;
  topics: PrepTopic[];
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/**
 * বাল্ক পেস্ট ফরম্যাট: প্রতিটি প্রশ্ন-উত্তর আলাদা করতে একটি লাইনে --- লিখুন।
 * প্রতি ব্লকের প্রথম লাইন = প্রশ্ন, বাকি লাইন = উত্তর।
 */
function parseBulk(raw: string): { question: string; answer: string }[] {
  return raw
    .split(/\n\s*---\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [first, ...rest] = block.split('\n');
      return { question: first.trim(), answer: rest.join('\n').trim() };
    })
    .filter((x) => x.question && x.answer);
}

export const AdminPrepPage: React.FC = () => {
  const { success, error } = useToast();
  const [doc, setDoc] = useState<PrepDoc>({ version: 0, topics: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // নতুন টপিক
  const [newTopicName, setNewTopicName] = useState('');

  // প্রশ্ন যোগ / সম্পাদনা
  const [editing, setEditing] = useState<{ topicId: string; item: PrepItem } | null>(null);

  // বাল্ক পেস্ট
  const [bulkTopicId, setBulkTopicId] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${R2_BASE}/prep-data.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setDoc({ version: data.version || 0, updatedAt: data.updatedAt, topics: Array.isArray(data.topics) ? data.topics : [] });
      } else {
        setDoc({ version: 0, topics: [] });
      }
    } catch {
      error('প্রস্তুতির ডেটা লোড করা যায়নি');
    } finally {
      setLoading(false);
      setDirty(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = (fn: (d: PrepDoc) => PrepDoc) => {
    setDoc((d) => fn(d));
    setDirty(true);
  };

  const addTopic = () => {
    const name = newTopicName.trim();
    if (!name) return;
    if (doc.topics.some((t) => t.name === name)) {
      error('এই নামে টপিক আছে');
      return;
    }
    update((d) => ({ ...d, topics: [...d.topics, { id: uid(), name, items: [] }] }));
    setNewTopicName('');
    setOpenTopic(null);
  };

  const removeTopic = (topicId: string) => {
    const t = doc.topics.find((x) => x.id === topicId);
    if (!t) return;
    if (!window.confirm(`"${t.name}" টপিক ও এর ${t.items.length}টি প্রশ্ন মুছবেন?`)) return;
    update((d) => ({ ...d, topics: d.topics.filter((x) => x.id !== topicId) }));
  };

  const renameTopic = (topicId: string, name: string) => {
    update((d) => ({ ...d, topics: d.topics.map((t) => (t.id === topicId ? { ...t, name } : t)) }));
  };

  const saveItem = (topicId: string, item: PrepItem) => {
    if (!item.question.trim() || !item.answer.trim()) {
      error('প্রশ্ন ও উত্তর দুটোই লিখুন');
      return;
    }
    update((d) => ({
      ...d,
      topics: d.topics.map((t) => {
        if (t.id !== topicId) return t;
        const exists = t.items.some((i) => i.id === item.id);
        const items = exists ? t.items.map((i) => (i.id === item.id ? item : i)) : [...t.items, item];
        return { ...t, items };
      }),
    }));
    setEditing(null);
  };

  const removeItem = (topicId: string, itemId: string) => {
    if (!window.confirm('এই প্রশ্নটি মুছবেন?')) return;
    update((d) => ({
      ...d,
      topics: d.topics.map((t) => (t.id === topicId ? { ...t, items: t.items.filter((i) => i.id !== itemId) } : t)),
    }));
  };

  const addBulk = () => {
    if (!bulkTopicId) return;
    const parsed = parseBulk(bulkText);
    if (parsed.length === 0) {
      error('কোনো প্রশ্ন-উত্তর পাওয়া যায়নি। ফরম্যাট দেখুন।');
      return;
    }
    update((d) => ({
      ...d,
      topics: d.topics.map((t) =>
        t.id === bulkTopicId
          ? {
              ...t,
              items: [
                ...t.items,
                ...parsed.map((p) => ({ id: uid(), question: p.question, answer: p.answer, note: '', tags: [] })),
              ],
            }
          : t
      ),
    }));
    success(`${parsed.length}টি প্রশ্ন যোগ হয়েছে। সেভ করতে ভুলবেন না।`);
    setBulkText('');
    setBulkTopicId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('লগইন প্রয়োজন');
      const token = await u.getIdToken();

      const res = await fetch(`${WORKER_URL}/api/admin/prep`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: doc.topics }),
      });
      if (!res.ok) throw new Error(`সেভ ব্যর্থ (HTTP ${res.status})`);
      const data = await res.json();
      setDoc((d) => ({ ...d, version: data.version }));
      setDirty(false);
      success(`সেভ হয়েছে (সংস্করণ ${data.version})। ব্যবহারকারীরা পরের সংযোগে আপডেট পাবে।`);
    } catch (err: any) {
      error(err?.message || 'সেভ করতে সমস্যা হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  const totalItems = useMemo(() => doc.topics.reduce((s, t) => s + t.items.length, 0), [doc]);

  const filteredTopics = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return doc.topics;
    return doc.topics
      .map((t) => ({
        ...t,
        items: t.items.filter((i) => i.question.toLowerCase().includes(term) || i.answer.toLowerCase().includes(term)),
      }))
      .filter((t) => t.name.toLowerCase().includes(term) || t.items.length > 0);
  }, [doc, search]);

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" text="প্রস্তুতির ডেটা লোড হচ্ছে..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">চাকরির প্রস্তুতি</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {doc.topics.length}টি টপিক • {totalItems}টি প্রশ্ন • সংস্করণ {doc.version}
            {dirty && <span className="ml-2 text-amber-700 font-semibold">• সেভ হয়নি</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'সেভ হচ্ছে...' : 'সব পরিবর্তন সেভ করুন'}</span>
        </button>
      </div>

      {/* নতুন টপিক ও খোঁজা */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            placeholder="নতুন টপিকের নাম (যেমন: বাংলা ব্যাকরণ, English Grammar)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
          />
          <button
            type="button"
            onClick={addTopic}
            className="inline-flex items-center gap-1 px-3 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold"
          >
            <Plus className="w-4 h-4" /> টপিক
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="সব টপিকে প্রশ্ন বা উত্তর খুঁজুন"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
        />
      </div>

      {/* টপিক তালিকা */}
      {filteredTopics.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500 bg-white rounded-xl border border-gray-200">
          এখনো কোনো টপিক নেই। উপরে একটি টপিকের নাম লিখে যোগ করুন।
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTopics.map((topic) => {
            const open = openTopic === topic.id || Boolean(search.trim());
            return (
              <div key={topic.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpenTopic(open && !search.trim() ? null : topic.id)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                    <input
                      type="text"
                      value={topic.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => renameTopic(topic.id, e.target.value)}
                      className="text-sm font-bold text-gray-900 bg-transparent border-b border-transparent focus:border-emerald-600 focus:outline-none min-w-0 flex-1"
                    />
                  </button>
                  <span className="text-xs text-gray-500 shrink-0">{topic.items.length}টি প্রশ্ন</span>
                  <button
                    type="button"
                    onClick={() => removeTopic(topic.id)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"
                    title="টপিক মুছুন"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {open && (
                  <div className="border-t border-gray-100 p-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ topicId: topic.id, item: { id: uid(), question: '', answer: '', note: '', tags: [] } })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" /> একটি প্রশ্ন
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkTopicId(topic.id);
                          setBulkText('');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-semibold"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" /> অনেক প্রশ্ন একসাথে
                      </button>
                    </div>

                    {/* বাল্ক পেস্ট */}
                    {bulkTopicId === topic.id && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                          প্রতি প্রশ্ন-উত্তরের মাঝে <code className="font-mono bg-white px-1">---</code> লাইন দিন। প্রতি ব্লকের প্রথম লাইন প্রশ্ন, বাকি লাইন উত্তর। প্রশ্ন ও উত্তর বাংলা, English বা মিশ্র হতে পারে।
                        </p>
                        <textarea
                          rows={8}
                          value={bulkText}
                          onChange={(e) => setBulkText(e.target.value)}
                          className="w-full p-3 text-sm border border-gray-300 rounded-lg font-mono focus:outline-none focus:border-emerald-600"
                          placeholder={'Tense কী?\nTense হলো ক্রিয়ার সময় নির্দেশক রূপ।\n---\nবাংলা সন্ধি কাকে বলে?\nদুটি বর্ণের মিলনকে সন্ধি বলে।'}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setBulkTopicId(null)}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg"
                          >
                            বাতিল
                          </button>
                          <button
                            type="button"
                            onClick={addBulk}
                            className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg font-semibold"
                          >
                            যোগ করুন
                          </button>
                        </div>
                      </div>
                    )}

                    {/* প্রশ্ন তালিকা */}
                    {topic.items.length === 0 && <p className="text-xs text-gray-400">এই টপিকে এখনো প্রশ্ন নেই।</p>}
                    {topic.items.map((item, idx) => (
                      <div key={item.id} className="p-3 rounded-xl border border-gray-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-semibold text-gray-900">
                              {idx + 1}. {item.question}
                            </p>
                            <p className="text-xs text-gray-600 whitespace-pre-line">{item.answer}</p>
                            {item.note && <p className="text-[11px] text-gray-500 italic">নোট: {item.note}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditing({ topicId: topic.id, item: { ...item } })}
                              className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"
                              title="সম্পাদনা"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItem(topic.id, item.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                              title="মুছুন"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* একটি প্রশ্ন যোগ/সম্পাদনা */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-3 shadow-xl">
            <h3 className="text-sm font-bold text-gray-900">{editing.item.question ? 'প্রশ্ন সম্পাদনা' : 'নতুন প্রশ্ন'}</h3>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">প্রশ্ন</label>
              <textarea
                rows={2}
                value={editing.item.question}
                onChange={(e) => setEditing({ ...editing, item: { ...editing.item, question: e.target.value } })}
                className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">উত্তর</label>
              <textarea
                rows={5}
                value={editing.item.answer}
                onChange={(e) => setEditing({ ...editing, item: { ...editing.item, answer: e.target.value } })}
                className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">নোট (ঐচ্ছিক)</label>
              <textarea
                rows={2}
                value={editing.item.note}
                onChange={(e) => setEditing({ ...editing, item: { ...editing.item, note: e.target.value } })}
                className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">ট্যাগ (কমা দিয়ে, ঐচ্ছিক)</label>
              <input
                type="text"
                value={editing.item.tags.join(', ')}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    item: {
                      ...editing.item,
                      tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean),
                    },
                  })
                }
                className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3 py-2 text-xs border border-gray-300 rounded-lg"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => saveItem(editing.topicId, editing.item)}
                className="px-3 py-2 text-xs bg-emerald-600 text-white rounded-lg font-semibold"
              >
                প্রশ্ন যোগ/আপডেট করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
