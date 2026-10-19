import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCached, setCached, precacheJob, getCachedWithSWR, prefetchJobDetail } from '../../services/cache';
import { JobCircular } from '../../types';
import { DEFAULT_JOBS } from '../../data/defaultJobs';
import { isDummyJob } from '../../utils/recoverLocalJobs';
import { safeFormatBnDate, isJobExpired } from '../../utils/dateUtils';
import { sortJobsByDeadline } from '../../utils/jobSort';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { fetchJobsList } from '../../services/jobsStore';

const ITEMS_PER_PAGE = 20;

export const JobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<JobCircular[]>(() => {
    const page1 = getCached<JobCircular[]>('jobs_page_1');
    if (page1 && page1.length > 0) {
      const clean = page1.filter((j) => !isDummyJob(j));
      if (clean.length > 0) return clean;
    }
    return DEFAULT_JOBS.filter((j) => !isDummyJob(j));
  });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => {
    return new URLSearchParams(window.location.search).get('search') || '';
  });
  const [categoryFilter, setCategoryFilter] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get('category') || 'all';
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const ALL_JOBS_KEY = 'jobs_all';

  // সব জব একবার লোড করে ক্যাশ করা হয়; ফিল্টার, সাজানো ও পেজিং ব্রাউজারে হয়
  const loadAllJobs = async (bypassCache: boolean): Promise<JobCircular[]> => {
    if (!bypassCache) {
      const cached = getCached<JobCircular[]>(ALL_JOBS_KEY);
      if (cached && cached.length > 0) return cached;
    }
    const list = (await fetchJobsList()) as JobCircular[];
    if (list.length > 0) {
      setCached(ALL_JOBS_KEY, list);
      list.forEach(precacheJob);
    }
    return list;
  };

  const fetchPage = async (page: number, bypassCache = false) => {
    setLoading(true);
    try {
      const all = (await loadAllJobs(bypassCache)).filter((j) => !isDummyJob(j));

      if (all.length === 0) {
        setJobs(DEFAULT_JOBS.filter((j) => !isDummyJob(j)));
        setHasMore(false);
        return;
      }

      const term = searchTerm.toLowerCase().trim();
      let list = all.filter((job) => {
        const titleMatch = Boolean(job.title && String(job.title).toLowerCase().includes(term));
        const postsMatch = Boolean(
          job.posts &&
            Array.isArray(job.posts) &&
            job.posts.some((p) => p?.name && String(p.name).toLowerCase().includes(term))
        );
        const tagsMatch = Boolean(
          Array.isArray(job.tags) && job.tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(term))
        );
        const keywordMatch = Boolean(job.focusKeyword && String(job.focusKeyword).toLowerCase().includes(term));
        const matchesSearch = !term || titleMatch || postsMatch || tagsMatch || keywordMatch;

        const cat = job.category || 'govt';
        const matchesCategory =
          categoryFilter === 'all' ||
          (categoryFilter === 'ngo' ? cat === 'ngo' || cat === 'brac' : cat === categoryFilter);

        return matchesSearch && matchesCategory;
      });

      // চলমান আগে, মেয়াদ শেষ সবার নিচে
      list = sortJobsByDeadline(list);

      const start = (page - 1) * ITEMS_PER_PAGE;
      setJobs(list.slice(start, start + ITEMS_PER_PAGE));
      setHasMore(start + ITEMS_PER_PAGE < list.length);
    } catch (err) {
      console.warn('Jobs load failed:', err);
      setJobs(DEFAULT_JOBS.filter((j) => !isDummyJob(j)));
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(currentPage);
  }, [currentPage, categoryFilter, searchTerm]);

  const now = new Date();

  const filteredJobs = (jobs || [])
    .filter((j) => !isDummyJob(j))
    .filter((job) => {
      if (!job) return false;
      const term = searchTerm.toLowerCase().trim();
      const titleMatch = Boolean(job.title && String(job.title).toLowerCase().includes(term));
      const postsMatch = Boolean(
        job.posts && Array.isArray(job.posts) && job.posts.some((p) => p?.name && String(p.name).toLowerCase().includes(term))
      );
      const tagsMatch = Boolean(
        Array.isArray(job.tags) && job.tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(term))
      );
      const keywordMatch = Boolean(job.focusKeyword && String(job.focusKeyword).toLowerCase().includes(term));
      const matchesSearch = !term || titleMatch || postsMatch || tagsMatch || keywordMatch;

      const cat = job.category || 'govt';
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'ngo' ? cat === 'ngo' || cat === 'brac' : cat === categoryFilter);
      return matchesSearch && matchesCategory;
    });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Helmet>
        <title>সকল চাকরির খবর ও সরকারি নিয়োগ বিজ্ঞপ্তি ২০২৬ | BDJobApply.site</title>
        <meta
          name="description"
          content="চলমান সকল সরকারি ও বেসরকারি চাকরির নিয়োগ বিজ্ঞপ্তি ২০২৬ খুঁজুন এবং bdjobapply.site এ সরাসরি অনলাইনে নির্ভুল টেলিটক আবেদন করুন।"
        />
        <meta
          name="keywords"
          content="সরকারি চাকরির খবর, চাকরির খবর ২০২৬, bd job circular, teletalk job apply, সরকারি নিয়োগ বিজ্ঞপ্তি, bdjobapply"
        />
        <link rel="canonical" href="https://bdjobapply.site/jobs" />

        {/* OpenGraph */}
        <meta property="og:site_name" content="BD Job Apply" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="সকল চাকরির খবর ও সরকারি নিয়োগ বিজ্ঞপ্তি ২০২৬ | BDJobApply.site" />
        <meta
          property="og:description"
          content="চলমান সকল সরকারি ও বেসরকারি চাকরির নিয়োগ বিজ্ঞপ্তি ২০২৬ খুঁজুন এবং bdjobapply.site এ সরাসরি অনলাইনে আবেদন করুন।"
        />
        <meta property="og:url" content="https://bdjobapply.site/jobs" />
        <meta property="og:image" content="https://bdjobapply.site/og-image.jpg" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="সকল চাকরির খবর ও সরকারি নিয়োগ বিজ্ঞপ্তি ২০২৬ | BDJobApply.site" />
        <meta
          name="twitter:description"
          content="চলমান সকল সরকারি ও বেসরকারি চাকরির নিয়োগ বিজ্ঞপ্তি ২০২৬ খুঁজুন এবং bdjobapply.site এ সরাসরি অনলাইনে আবেদন করুন।"
        />
        <meta name="twitter:image" content="https://bdjobapply.site/og-image.jpg" />

        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'সকল চাকরির খবর ও নিয়োগ বিজ্ঞপ্তি',
            url: 'https://bdjobapply.site/jobs',
            description: 'চলমান সকল সরকারি ও বেসরকারি চাকরির নিয়োগ বিজ্ঞপ্তি ২০২৬',
          })}
        </script>
      </Helmet>

      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">সকল চাকরির খবর ও নিয়োগ বিজ্ঞপ্তি</h1>
        <p className="text-xs text-gray-500 mt-1">
          পাতা {currentPage} • প্রতি পেজে ২০টি বিজ্ঞপ্তি • চলমান বিজ্ঞপ্তি আগে, মেয়াদ শেষ সবার নিচে
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="চাকরি বা পদের নাম দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-emerald-600"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setCurrentPage(1);
          }}
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
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
          <EmptyState
            title="কোনো বিজ্ঞপ্তি পাওয়া যায়নি"
            description={
              categoryFilter !== 'all'
                ? `নির্বাচিত ক্যাটাগরিতে বর্তমানে কোনো সার্কুলার নেই। সব চলমান সার্কুলার দেখতে "সকল ক্যাটাগরি" নির্বাচন করুন।`
                : searchTerm
                ? `"${searchTerm}" এর সাথে মিলে এমন কোনো চাকরি পাওয়া যায়নি।`
                : 'বর্তমানে কোনো চাকরির বিজ্ঞপ্তি পাওয়া যায়নি।'
            }
          />
          <div className="flex items-center justify-center gap-3 pt-2">
            {(categoryFilter !== 'all' || searchTerm) && (
              <button
                onClick={() => {
                  setCategoryFilter('all');
                  setSearchTerm('');
                  setCurrentPage(1);
                  fetchPage(1, true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                সকল চাকরি দেখুন
              </button>
            )}
            <button
              onClick={() => fetchPage(currentPage, true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              রিফ্রেশ করুন
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredJobs.map((job) => {
            const isExpired = isJobExpired(job.deadline, now);

            return (
              <Link
                key={job.id}
                to={`/jobs/${job.slug || job.id}`}
                state={{ preloadedJob: job }}
                onMouseEnter={() => {
                  precacheJob(job);
                  prefetchJobDetail(job.slug || job.id);
                }}
                onTouchStart={() => {
                  precacheJob(job);
                  prefetchJobDetail(job.slug || job.id);
                }}
                className={`bg-white rounded-xl border p-5 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between ${
                  isExpired ? 'border-gray-200 opacity-70' : 'border-gray-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      {job.category === 'govt' ? 'সরকারি' : 'অন্যান্য'}
                    </span>
                    {isExpired ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-700">
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
                    <span>শেষ: {safeFormatBnDate(job.deadline)}</span>
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
