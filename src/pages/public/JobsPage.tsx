import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  collection,
  query,
  where,
  limit,
  startAfter,
  getDocs,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getCached, setCached } from '../../services/cache';
import { JobCircular } from '../../types';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';

const ITEMS_PER_PAGE = 20;

export const JobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<JobCircular[]>(() => {
    return getCached<JobCircular[]>('jobs_page_1') || [];
  });
  const [loading, setLoading] = useState(() => !getCached<JobCircular[]>('jobs_page_1'));
  const [searchTerm, setSearchTerm] = useState(() => {
    return new URLSearchParams(window.location.search).get('search') || '';
  });
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Store page cursor snapshots for limit(20) + startAfter pagination
  const pageCursorMap = useRef<Map<number, DocumentSnapshot>>(new Map());

  const fetchPage = async (page: number) => {
    setLoading(true);
    const cacheKey = `jobs_page_${page}`;
    const cached = getCached<JobCircular[]>(cacheKey);

    if (cached) {
      setJobs(cached);
      setLoading(false);
      return;
    }

    try {
      let q;
      if (page === 1) {
        q = query(
          collection(db, 'jobs'),
          where('status', '==', 'published'),
          limit(ITEMS_PER_PAGE)
        );
      } else {
        const prevCursor = pageCursorMap.current.get(page - 1);
        if (prevCursor) {
          q = query(
            collection(db, 'jobs'),
            where('status', '==', 'published'),
            startAfter(prevCursor),
            limit(ITEMS_PER_PAGE)
          );
        } else {
          q = query(
            collection(db, 'jobs'),
            where('status', '==', 'published'),
            limit(ITEMS_PER_PAGE)
          );
        }
      }

      let snap = await getDocs(q);

      // Fallback: if query with status=='published' returns 0, try fetching jobs collection
      if (snap.empty && page === 1) {
        try {
          const fallbackQ = query(collection(db, 'jobs'), limit(ITEMS_PER_PAGE));
          const fallbackSnap = await getDocs(fallbackQ);
          if (!fallbackSnap.empty) {
            snap = fallbackSnap;
          }
        } catch (fbErr) {
          console.warn('Fallback query notice:', fbErr);
        }
      }

      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as JobCircular))
        .filter((j) => j.status !== 'draft');

      if (snap.docs.length > 0) {
        pageCursorMap.current.set(page, snap.docs[snap.docs.length - 1]);
      }

      setHasMore(list.length === ITEMS_PER_PAGE);
      if (list.length > 0) {
        setCached(cacheKey, list);
      }
      setJobs(list);
    } catch (e) {
      console.error('Failed to load jobs page:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(currentPage);
  }, [currentPage]);

  const now = new Date();

  const filteredJobs = jobs.filter((job) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      job.title.toLowerCase().includes(term) ||
      job.posts?.some((p) => p.name.toLowerCase().includes(term)) ||
      job.tags?.some((t) => t.toLowerCase().includes(term)) ||
      (Boolean(job.focusKeyword) && job.focusKeyword!.toLowerCase().includes(term));
    const matchesCategory = categoryFilter === 'all' || job.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Helmet>
        <title>সকল সরকারি ও অন্যান্য চাকরির খবর | ২০টি করে পেজিনেশন</title>
        <meta
          name="description"
          content="চলমান সকল সরকারি ও বেসরকারি চাকরির নিয়োগ বিজ্ঞপ্তি খুঁজুন এবং সরাসরি অনলাইনে নির্ভুল আবেদন করুন।"
        />
      </Helmet>

      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">
          সকল চাকরির খবর ও নিয়োগ বিজ্ঞপ্তি
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          পৃষ্ঠা {currentPage} • প্রতি পেজে ২০টি করে বিজ্ঞপ্তি (কোটা সাশ্রয়ী পেজিনেশন)
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="চাকরি বা পদের নাম দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-emerald-600"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-emerald-600 sm:w-48"
        >
          <option value="all">সকল ক্যাটাগরি</option>
          <option value="govt">সরকারি চাকরি</option>
          <option value="private">বেসরকারি চাকরি</option>
          <option value="ngo">এনজিও চাকরি</option>
          <option value="pharma">ফার্মাসিউটিক্যাল</option>
          <option value="foreign">বিদেশি চাকরি</option>
          <option value="solution">সমাধান/অন্যান্য</option>
        </select>
      </div>

      {/* Jobs Grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" text="চাকরির বিজ্ঞপ্তি লোড হচ্ছে..." />
        </div>
      ) : filteredJobs.length === 0 ? (
        <EmptyState
          title="কোনো বিজ্ঞপ্তি পাওয়া যায়নি"
          description="আপনার সার্চের সাথে মিলে এমন কোনো চাকরি এই পৃষ্ঠায় বর্তমানে নেই।"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredJobs.map((job) => {
            const isExpired = job.deadline
              ? new Date(job.deadline.toDate ? job.deadline.toDate() : job.deadline).getTime() < now.getTime()
              : false;

            return (
              <Link
                key={job.id}
                to={`/jobs/${job.slug || job.id}`}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      {job.category === 'govt' ? 'সরকারি' : 'অন্যান্য'}
                    </span>
                    {isExpired ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">
                        মেয়াদ শেষ
                      </span>
                    ) : (
                      job.applyServiceEnabled && (
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                          আবেদন সেবা চালু
                        </span>
                      )
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm line-clamp-2 mb-2 hover:text-emerald-700">
                    {job.title}
                  </h3>
                  {job.posts && job.posts.length > 0 && (
                    <p className="text-[11px] text-gray-500 mb-2">
                      পদ: {job.posts.map((p) => p.name).slice(0, 2).join(', ')}
                      {job.posts.length > 2 ? ` (+${job.posts.length - 2}টি)` : ''}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <span>
                      শেষ:{' '}
                      {job.deadline
                        ? new Date(job.deadline.toDate ? job.deadline.toDate() : job.deadline).toLocaleDateString('bn-BD')
                        : 'বিজ্ঞপ্তি দেখুন'}
                    </span>
                  </div>
                  <span className="font-semibold text-emerald-700">আবেদন করুন →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex items-center justify-center gap-3 pt-6 border-t border-gray-200">
        <button
          disabled={currentPage === 1 || loading}
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          className="inline-flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>পূর্ববর্তী পৃষ্ঠা</span>
        </button>

        <span className="text-xs font-semibold text-gray-700 px-3 py-1 bg-gray-100 rounded-md">
          পৃষ্ঠা {currentPage}
        </span>

        <button
          disabled={!hasMore || loading}
          onClick={() => setCurrentPage((p) => p + 1)}
          className="inline-flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>পরবর্তী পৃষ্ঠা</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
