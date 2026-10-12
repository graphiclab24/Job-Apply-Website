import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getFeedLatest, FeedJobSummary } from '../../services/feed';
import { getCached, setCached, precacheJob, prefetchJobDetail } from '../../services/cache';
import { DEFAULT_FEED_JOBS } from '../../data/defaultJobs';
import { ExamNotice } from '../../types';
import { Spinner } from '../../components/common/Spinner';
import { HomeUrgentDeadlines } from '../../components/home/HomeUrgentDeadlines';
import { ArrowRight, Calendar, Sparkles, Award } from 'lucide-react';

export const HomePage: React.FC = () => {
  const [jobs, setJobs] = useState<FeedJobSummary[]>(() => {
    const cached = getCached<FeedJobSummary[]>('feed_latest');
    if (cached && cached.length >= 8) return cached;
    return DEFAULT_FEED_JOBS;
  });
  const [examNotices, setExamNotices] = useState<ExamNotice[]>(() => {
    return getCached<ExamNotice[]>('exams_home') || [];
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // 1. Fetch Feed Jobs with ultra-fast SWR (Edge API / RAM Cache ~2ms)
    getFeedLatest(true)
      .then((feedPosts) => {
        if (isMounted && feedPosts && feedPosts.length > 0) {
          setJobs(feedPosts);
          feedPosts.forEach(precacheJob);

          // Speculatively prefetch full circular details of top jobs during idle time
          if (typeof window !== 'undefined') {
            const idle = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 1000));
            idle(() => {
              feedPosts.slice(0, 4).forEach((j) => prefetchJobDetail(j.slug || j.id));
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    // 2. Fetch Exams non-blockingly in the background (never freezes job rendering)
    const cachedExams = getCached<ExamNotice[]>('exams_home');
    if (!cachedExams || cachedExams.length === 0) {
      getDocs(query(collection(db, 'exams'), limit(4)))
        .then((examSnap) => {
          const exams = examSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamNotice));
          setCached('exams_home', exams);
          if (isMounted) setExamNotices(exams);
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * oneDayMs;

  const tomorrowDeadlineJobs = jobs.filter((j) => {
    if (!j.deadline) return false;
    const d = j.deadline.toDate ? j.deadline.toDate() : new Date(j.deadline);
    const diff = d.getTime() - now.getTime();
    return diff > 0 && diff <= oneDayMs * 1.5;
  });

  const thisWeekDeadlineJobs = jobs.filter((j) => {
    if (!j.deadline) return false;
    const d = j.deadline.toDate ? j.deadline.toDate() : new Date(j.deadline);
    const diff = d.getTime() - now.getTime();
    return diff > oneDayMs * 1.5 && diff <= sevenDaysMs;
  });

  const filteredJobs =
    selectedCategory === 'all'
      ? jobs.slice(0, 9)
      : jobs
          .filter((j) => {
            if (selectedCategory === 'ngo') {
              return j.category === 'ngo' || j.category === 'brac';
            }
            return j.category === selectedCategory;
          })
          .slice(0, 9);

  return (
    <div className="space-y-10 pb-12">
      <Helmet>
        <title>বিডি জব পোর্টাল - সরকারি ও টেলিটক চাকরি আবেদন সার্ভিস | BDJobApply.site</title>
        <meta
          name="description"
          content="বাংলাদেশের সকল সরকারি ও অন্যান্য চাকরির অনলাইন আবেদন সেবা। অভিজ্ঞ অপারেটর দ্বারা নির্ভুল Teletalk আবেদন ও সফট কপি যাচাই। বিডি জব এপ্লাই - bdjobapply.site"
        />
        <meta
          name="keywords"
          content="bdjobapply, bd job apply, চাকরির খবর, সরকারি চাকরি নিয়োগ বিজ্ঞপ্তি ২০২৬, টেলিটক আবেদন, teletalk application, সরকারি চাকরি, চাকরির সার্কুলার"
        />
        <link rel="canonical" href="https://bdjobapply.site/" />

        {/* OpenGraph */}
        <meta property="og:site_name" content="BD Job Apply" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="বিডি জব পোর্টাল - সরকারি ও টেলিটক চাকরি আবেদন সার্ভিস | BDJobApply.site" />
        <meta
          property="og:description"
          content="বাংলাদেশের সকল সরকারি ও টেলিটক চাকরির সর্বশেষ নিয়োগ বিজ্ঞপ্তি, ফলাফল ও ঘরে বসে সরাসরি অনলাইন আবেদন সার্ভিস।"
        />
        <meta property="og:url" content="https://bdjobapply.site/" />
        <meta property="og:image" content="https://bdjobapply.site/og-image.jpg" />
        <meta property="og:locale" content="bn_BD" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="বিডি জব পোর্টাল - সরকারি ও টেলিটক চাকরি আবেদন সার্ভিস | BDJobApply.site" />
        <meta
          name="twitter:description"
          content="বাংলাদেশের সকল সরকারি ও টেলিটক চাকরির সর্বশেষ নিয়োগ বিজ্ঞপ্তি ও ঘরে বসে সরাসরি অনলাইন আবেদন সার্ভিস।"
        />
        <meta name="twitter:image" content="https://bdjobapply.site/og-image.jpg" />

        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'BD Job Apply',
            url: 'https://bdjobapply.site/',
            potentialAction: {
              '@type': 'SearchAction',
              target: 'https://bdjobapply.site/jobs?search={search_term_string}',
              'query-input': 'required name=search_term_string',
            },
          })}
        </script>
      </Helmet>

      {/* Hero Banner */}
      <section className="bg-gradient-to-b from-emerald-800 to-teal-950 text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-medium text-emerald-200">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            <span>টেলিটক ও সরকারি চাকরির নির্ভুল অনলাইন আবেদন প্ল্যাটফর্ম</span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
            চাকরির আবেদন করুন সহজে ও নিশ্চিন্তে
          </h1>

          <p className="text-xs sm:text-sm text-emerald-100/90 max-w-2xl mx-auto leading-relaxed">
            একবার সিভি পূরণ করুন, যেকোনো সার্কুলারে দ্রুত আবেদন করুন। আপনার হয়ে নির্ভুলভাবে Teletalk পোর্টালে ফর্ম জমা দিয়ে সফট কপি ও পেইড কপি প্রদান করা হয়।
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              className="w-full sm:w-auto px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold rounded-xl text-xs sm:text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <span>সিভি সেভ ও আবেদন শুরু</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/jobs"
              className="w-full sm:w-auto px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2"
            >
              <span>সকল চাকরির খবর</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Urgent Deadlines Alert Banners */}
      <HomeUrgentDeadlines
        tomorrowDeadlineJobs={tomorrowDeadlineJobs as any}
        thisWeekDeadlineJobs={thisWeekDeadlineJobs as any}
      />

      {/* Latest Posts with Category Tabs */}
      <section className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">সাম্প্রতিক নিয়োগ বিজ্ঞপ্তি</h2>
            <p className="text-xs text-gray-500">অনলাইন আবেদন সুবিধাসহ সর্বশেষ প্রকাশিত পোস্ট (সর্বোচ্চ ৩০টি ফিড)</p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'সকল চাকরি' },
              { id: 'govt', label: 'সরকারি' },
              { id: 'private', label: 'বেসরকারি' },
              { id: 'ngo', label: 'এনজিও' },
              { id: 'pharma', label: 'ফার্মা' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Spinner text="বিজ্ঞপ্তি লোড হচ্ছে..." />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-gray-200 text-gray-500 text-xs">
            এই ক্যাটাগরিতে কোনো সক্রিয় বিজ্ঞপ্তি পাওয়া যায়নি।
          </div>
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
                  state={{ preloadedJob: job }}
                  onMouseEnter={() => {
                    precacheJob(job);
                    prefetchJobDetail(job.slug || job.id);
                  }}
                  onTouchStart={() => {
                    precacheJob(job);
                    prefetchJobDetail(job.slug || job.id);
                  }}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                        {job.category === 'govt' ? 'সরকারি' : 'বেসরকারি/অন্যান্য'}
                      </span>
                      {isExpired ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">
                          মেয়াদ শেষ
                        </span>
                      ) : (
                        job.applyServiceEnabled && (
                          <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                            আবেদন সেবা
                          </span>
                        )
                      )}
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm line-clamp-2 mb-2 hover:text-emerald-700">
                      {job.title}
                    </h3>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>
                        শেষ: {job.deadline ? new Date(job.deadline.toDate ? job.deadline.toDate() : job.deadline).toLocaleDateString('bn-BD') : 'বিজ্ঞপ্তি দেখুন'}
                      </span>
                    </div>
                    <span className="font-semibold text-emerald-700">বিস্তারিত →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="text-center pt-2">
          <Link to="/jobs">
            <button className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-xl text-xs font-semibold shadow-xs">
              সকল চাকরি দেখুন ({jobs.length}টি)
            </button>
          </Link>
        </div>
      </section>

      {/* Exam & Result Notices Section */}
      {examNotices.length > 0 && (
        <section className="max-w-6xl mx-auto px-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Award className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-gray-900 text-base">পরীক্ষার সময়সূচী ও রেজাল্ট নোটিশ</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {examNotices.map((ex) => (
                <div key={ex.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">{ex.category}</span>
                    <h4 className="font-bold text-gray-900 text-sm mt-1">{ex.title}</h4>
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{ex.content}</p>
                  </div>
                  <span className="text-[11px] text-gray-400 mt-3 block">তারিখ: {ex.date}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
