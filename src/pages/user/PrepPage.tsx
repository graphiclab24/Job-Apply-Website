import React, { useEffect, useMemo, useState } from 'react';
import { R2_BASE } from '../../services/jobsStore';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { Search, Bookmark, BookmarkCheck, CheckCircle2, ChevronDown, ChevronRight, Shuffle, RefreshCw } from 'lucide-react';

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

interface Progress {
  bookmarks: string[];
  learned: string[];
}

const PROGRESS_KEY = 'prep_progress_v1';
const VERSION_KEY = 'prep_seen_version';

const readProgress = (): Progress => {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { bookmarks: [], learned: [] };
    const p = JSON.parse(raw);
    return { bookmarks: Array.isArray(p.bookmarks) ? p.bookmarks : [], learned: Array.isArray(p.learned) ? p.learned : [] };
  } catch {
    return { bookmarks: [], learned: [] };
  }
};

const writeProgress = (p: Progress) => {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // ব্রাউজার জায়গা না থাকলে নীরবে চলবে
  }
};

export const PrepPage: React.FC = () => {
  const { success, error } = useToast();
  const [doc, setDoc] = useState<PrepDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>(readProgress);
  const [onlyBookmarks, setOnlyBookmarks] = useState(false);
  const [revisionItem, setRevisionItem] = useState<{ topic: string; item: PrepItem } | null>(null);
  const [revealed, setRevealed] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // সার্ভিস ওয়ার্কার ক্যাশ থেকে দেয়; ইন্টারনেট থাকলে নতুন সংস্করণ নীরবে আনে
      const res = await fetch(`${R2_BASE}/prep-data.json`);
      if (!res.ok) throw new Error('ডেটা পাওয়া যায়নি');
      const data = await res.json();
      const next: PrepDoc = {
        version: data.version || 0,
        updatedAt: data.updatedAt,
        topics: Array.isArray(data.topics) ? data.topics : [],
      };
      setDoc(next);
      try {
        localStorage.setItem(VERSION_KEY, String(next.version));
      } catch {}
    } catch {
      // অফলাইন: ক্যাশ থেকে আগের কপি আসবে (সার্ভিস ওয়ার্কার)
      const cached = await fetch(`${R2_BASE}/prep-data.json`, { cache: 'force-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cached) {
        setDoc({ version: cached.version || 0, updatedAt: cached.updatedAt, topics: cached.topics || [] });
      } else {
        error('প্রস্তুতির ডেটা লোড করা যায়নি। ইন্টারনেট সংযোগ দেখুন।');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleBookmark = (id: string) => {
    const next = {
      ...progress,
      bookmarks: progress.bookmarks.includes(id)
        ? progress.bookmarks.filter((x) => x !== id)
        : [...progress.bookmarks, id],
    };
    setProgress(next);
    writeProgress(next);
  };

  const toggleLearned = (id: string) => {
    const next = {
      ...progress,
      learned: progress.learned.includes(id)
        ? progress.learned.filter((x) => x !== id)
        : [...progress.learned, id],
    };
    setProgress(next);
    writeProgress(next);
  };

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const totalItems = useMemo(() => (doc?.topics || []).reduce((s, t) => s + t.items.length, 0), [doc]);
  const learnedCount = progress.learned.length;

  // ফিল্টার: বিষয়, বুকমার্ক, খোঁজা
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (doc?.topics || [])
      .filter((t) => topicFilter === 'all' || t.id === topicFilter)
      .map((t) => ({
        ...t,
        items: t.items.filter((i) => {
          if (onlyBookmarks && !progress.bookmarks.includes(i.id)) return false;
          if (!term) return true;
          return (
            i.question.toLowerCase().includes(term) ||
            i.answer.toLowerCase().includes(term) ||
            (i.tags || []).some((tag) => tag.toLowerCase().includes(term))
          );
        }),
      }))
      .filter((t) => t.items.length > 0);
  }, [doc, search, topicFilter, onlyBookmarks, progress.bookmarks]);

  const pickRandom = () => {
    const all = (doc?.topics || []).flatMap((t) => t.items.map((i) => ({ topic: t.name, item: i })));
    if (all.length === 0) return;
    const pick = all[Math.floor(Math.random() * all.length)];
    setRevisionItem(pick);
    setRevealed(false);
  };

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" text="প্রস্তুতির ডেটা লোড হচ্ছে..." />
      </div>
    );
  }

  if (!doc || doc.topics.length === 0) {
    return (
      <EmptyState
        title="এখনো কোনো প্রস্তুতি যুক্ত হয়নি"
        description="শীঘ্রই এখানে বিষয়ভিত্তিক প্রশ্ন ও উত্তর পাওয়া যাবে।"
      />
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">চাকরির প্রস্তুতি</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {doc.topics.length}টি বিষয় • {totalItems}টি প্রশ্ন • জানা হয়েছে {learnedCount}টি
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={pickRandom}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
          >
            <Shuffle className="w-3.5 h-3.5" /> রিভিশন (র‍্যান্ডম)
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold"
            title="নতুন প্রশ্ন থাকলে আনুন"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* রিভিশন কার্ড */}
      {revisionItem && (
        <div className="bg-white rounded-2xl border border-emerald-200 p-5 space-y-3 shadow-xs">
          <p className="text-[11px] font-bold text-emerald-700">{revisionItem.topic}</p>
          <p className="text-sm font-semibold text-gray-900">{revisionItem.item.question}</p>
          {revealed ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{revisionItem.item.answer}</p>
              {revisionItem.item.note && <p className="text-[11px] text-gray-500 italic">নোট: {revisionItem.item.note}</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              উত্তর দেখুন
            </button>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={pickRandom} className="text-xs font-semibold text-gray-600 hover:text-gray-900">
              পরের প্রশ্ন →
            </button>
          </div>
        </div>
      )}

      {/* খোঁজা ও ফিল্টার */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="প্রশ্ন, উত্তর বা ট্যাগ দিয়ে খুঁজুন"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
        >
          <option value="all">সকল বিষয়</option>
          {doc.topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={onlyBookmarks}
          onChange={(e) => setOnlyBookmarks(e.target.checked)}
          className="w-4 h-4 accent-emerald-600"
        />
        শুধু বুকমার্ক করা প্রশ্ন দেখুন
      </label>

      {/* বিষয় ও প্রশ্ন */}
      {filtered.length === 0 ? (
        <EmptyState title="কোনো প্রশ্ন পাওয়া যায়নি" description="খোঁজার শব্দ বা ফিল্টার বদলে দেখুন।" />
      ) : (
        <div className="space-y-4">
          {filtered.map((topic) => (
            <section key={topic.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <h2 className="px-4 py-3 text-sm font-bold text-gray-900 bg-gray-50 border-b border-gray-100">
                {topic.name} <span className="text-xs font-normal text-gray-500">({topic.items.length}টি)</span>
              </h2>
              <ul className="divide-y divide-gray-100">
                {topic.items.map((item, idx) => {
                  const open = openIds.has(item.id) || Boolean(search.trim());
                  const bookmarked = progress.bookmarks.includes(item.id);
                  const learned = progress.learned.includes(item.id);
                  return (
                    <li key={item.id} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleOpen(item.id)}
                          className="flex items-start gap-2 flex-1 min-w-0 text-left"
                        >
                          {open ? (
                            <ChevronDown className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" />
                          )}
                          <span className="text-sm font-semibold text-gray-900">
                            {idx + 1}. {item.question}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleLearned(item.id)}
                          className={`p-1.5 rounded-lg shrink-0 ${learned ? 'text-emerald-600' : 'text-gray-300 hover:text-gray-500'}`}
                          title={learned ? 'জানা হয়েছে' : 'জানা হয়েছে বলে চিহ্ন দিন'}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleBookmark(item.id)}
                          className={`p-1.5 rounded-lg shrink-0 ${bookmarked ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500'}`}
                          title={bookmarked ? 'বুকমার্ক সরান' : 'বুকমার্ক করুন'}
                        >
                          {bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                        </button>
                      </div>

                      {open && (
                        <div className="mt-2 ml-6 space-y-2">
                          <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{item.answer}</p>
                          {item.note && <p className="text-[11px] text-gray-500 italic">নোট: {item.note}</p>}
                          {item.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {item.tags.map((tag) => (
                                <span key={tag} className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {doc.updatedAt && (
        <p className="text-[11px] text-gray-400 text-center">
          সর্বশেষ আপডেট: {new Date(doc.updatedAt).toLocaleDateString('bn-BD')} • সংস্করণ {doc.version}
        </p>
      )}
    </div>
  );
};
