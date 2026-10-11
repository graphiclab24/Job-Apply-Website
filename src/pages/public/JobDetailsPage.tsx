import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getFile, getFileId } from '../../services/files';
import { getCached, setCached } from '../../services/cache';
import { JobCircular } from '../../types';
import { Spinner } from '../../components/common/Spinner';
import { Button } from '../../components/common/Button';
import {
  Calendar,
  Briefcase,
  MapPin,
  Send,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Users,
  CheckCircle2,
  Tag,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { useAuth } from '../../context/AuthContext';
import { formatJobContent } from '../../utils/formatJobContent';

export const JobDetailsPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [job, setJob] = useState<JobCircular | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  // 1 Single Read for Job Details (with 5-minute in-memory cache)
  useEffect(() => {
    const fetchJob = async () => {
      if (!slug) return;
      const cacheKey = `job_detail_${slug}`;
      const cached = getCached<JobCircular>(cacheKey);

      if (cached) {
        setJob(cached);
        setLoading(false);
        return;
      }

      try {
        // Query by slug with limit 1
        const q = query(collection(db, 'jobs'), where('slug', '==', slug), limit(1));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const docItem = snap.docs[0];
          const jobData = { id: docItem.id, ...docItem.data() } as JobCircular;
          setCached(cacheKey, jobData);
          setJob(jobData);
        } else {
          // Fallback doc ID lookup
          const docRef = doc(db, 'jobs', slug);
          const singleSnap = await getDoc(docRef);
          if (singleSnap.exists()) {
            const jobData = { id: singleSnap.id, ...singleSnap.data() } as JobCircular;
            setCached(cacheKey, jobData);
            setJob(jobData);
          }
        }
      } catch (err) {
        // Silently handled
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [slug]);

  // Lazy load cover image separately only on details page (files/job_{jobId}_cover)
  useEffect(() => {
    if (!job) return;

    if (job.featuredImage) {
      setCoverDataUrl(job.featuredImage);
      return;
    }

    if (job.hasCover) {
      getFile(getFileId.cover(job.id))
        .then((fileDoc) => {
          if (fileDoc?.data) {
            setCoverDataUrl(fileDoc.data);
          }
        })
        .catch(() => {
          // Ignore
        });
    }
  }, [job?.id]);

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" text="বিজ্ঞপ্তি বিবরণ লোড হচ্ছে..." />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h2 className="text-lg font-bold text-gray-800 mb-2">বিজ্ঞপ্তিটি পাওয়া যায়নি</h2>
        <p className="text-xs text-gray-500 mb-5">হয়তো লিংকটি ভুল অথবা বিজ্ঞপ্তিটি সরানো হয়েছে।</p>
        <Link to="/jobs">
          <Button variant="outline">সকল চাকরি দেখুন</Button>
        </Link>
      </div>
    );
  }

  const now = new Date();
  const deadlineDate = job.deadline
    ? job.deadline.toDate
      ? job.deadline.toDate()
      : new Date(job.deadline)
    : null;

  const isExpired = deadlineDate ? deadlineDate.getTime() < now.getTime() : false;
  const circularLink = job.circularLink || job.circularFile;

  // SEO & Social Meta Configuration
  const pageTitle = job.seoTitle || `${job.title} | চাকরি আবেদন সার্ভিস`;
  const metaDescription =
    job.metaDescription ||
    `${job.title}। সরকারি ও টেলিটক অনলাইন আবেদন সেবা। আবেদনের শেষ তারিখ: ${
      deadlineDate ? deadlineDate.toLocaleDateString('bn-BD') : 'বিজ্ঞপ্তি দেখুন'
    }। পদে পদের যোগ্যতা ও নিয়মাবলি জানুন।`;
  const keywordsString =
    job.tags && job.tags.length > 0
      ? job.tags.join(', ')
      : `${job.title}, সরকারি চাকরি, টেলিটক জব সার্কুলার, নিয়োগ বিজ্ঞপ্তি`;
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareImage = coverDataUrl || job.featuredImage || '';

  // Google JobPosting JSON-LD Schema
  const jobPostingSchema = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: metaDescription,
    datePosted: job.publishedAt?.toDate
      ? job.publishedAt.toDate().toISOString()
      : typeof job.publishedAt === 'string'
      ? job.publishedAt
      : new Date().toISOString(),
    validThrough: deadlineDate ? deadlineDate.toISOString() : undefined,
    employmentType: 'FULL_TIME',
    hiringOrganization: {
      '@type': 'Organization',
      name: job.category === 'govt' ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার' : 'নিয়োগকারী প্রতিষ্ঠান',
      sameAs: job.applyLink || 'https://teletalk.com.bd',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'BD',
      },
    },
  };

  const handleApplyClick = () => {
    if (!user) {
      navigate('/login', { state: { from: `/apply/${job.id}` } });
    } else {
      navigate(`/apply/${job.id}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="keywords" content={keywordsString} />
        <link rel="canonical" href={currentUrl} />

        {/* OpenGraph / Facebook */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={currentUrl} />
        {shareImage && <meta property="og:image" content={shareImage} />}
        <meta property="og:site_name" content="BD Job Portal" />

        {/* Twitter Cards */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={metaDescription} />
        {shareImage && <meta name="twitter:image" content={shareImage} />}

        {/* Google Jobs Structured Data (Schema.org) */}
        <script type="application/ld+json">
          {JSON.stringify(jobPostingSchema)}
        </script>
      </Helmet>

      <Link
        to="/jobs"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-emerald-700"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>সকল চাকরিতে ফিরে যান</span>
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 space-y-6 shadow-xs">
        {/* Top Header */}
        <div className="border-b border-gray-100 pb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full text-xs font-bold">
              {job.category === 'govt' ? 'সরকারি প্রতিষ্ঠান' : 'বেসরকারি/অন্যান্য'}
            </span>

            {isExpired ? (
              <span className="px-3 py-1 bg-rose-50 text-rose-800 rounded-full text-xs font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>মেয়াদ শেষ</span>
              </span>
            ) : (
              <span className="px-3 py-1 bg-teal-50 text-teal-800 rounded-full text-xs font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>আবেদন চলছে</span>
              </span>
            )}
          </div>

          <h1 className="text-xl md:text-2xl font-extrabold text-gray-900 leading-snug">
            {job.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 pt-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>
                আবেদনের শেষ সময়:{' '}
                <strong className={isExpired ? 'text-rose-600 font-bold' : 'text-gray-900'}>
                  {deadlineDate ? deadlineDate.toLocaleString('bn-BD') : 'বিজ্ঞপ্তি দেখুন'}
                </strong>
              </span>
            </div>

            {job.applyServiceEnabled && !isExpired && (
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <Send className="w-4 h-4" />
                <span>অনলাইন আবেদন ও সফট কপি সার্ভিস চালু</span>
              </div>
            )}
          </div>
        </div>

        {/* Lazy Loaded Cover Image (Only on details page) */}
        {coverDataUrl && (
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <img src={coverDataUrl} alt={job.title} className="w-full max-h-96 object-cover" />
          </div>
        )}

        {/* Posts Breakdown Table */}
        {job.posts && job.posts.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-600" />
              <span>পদের তালিকা ও জেলা ভিত্তিক শর্তাবলী</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left bg-white rounded-lg border border-gray-200">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="p-2.5">পদের নাম</th>
                    <th className="p-2.5">পদসংখ্যা</th>
                    <th className="p-2.5">আবেদনের অনুমোদিত জেলা</th>
                    <th className="p-2.5 text-right">আবেদন ফি (টাকা)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {job.posts.map((p, idx) => {
                    const postAppFee = p.applicationFee != null && !isNaN(p.applicationFee) ? p.applicationFee : (job.applicationFee || 0);
                    const postServiceCharge = p.serviceCharge != null && !isNaN(p.serviceCharge) ? p.serviceCharge : (job.serviceCharge != null ? job.serviceCharge : 10);
                    const postTotal = postAppFee + postServiceCharge;

                    return (
                      <tr key={idx}>
                        <td className="p-2.5 font-bold text-gray-800">{p.name}</td>
                        <td className="p-2.5 text-gray-600">{p.count} জন</td>
                        <td className="p-2.5 text-emerald-700 font-medium">
                          {p.district === 'ALL' ? 'সারাদেশ (সকল জেলা)' : p.district}
                        </td>
                        <td className="p-2.5 text-right font-bold text-gray-900">
                          ৳{postTotal}
                          <span className="text-[10px] text-gray-400 font-normal block">
                            (ফি: ৳{postAppFee} + চার্জ: ৳{postServiceCharge})
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Circular Details Content (Sanitized) */}
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
            বিজ্ঞপ্তির বিস্তারিত বিবরণ:
          </h3>
          <div
            className="job-content text-gray-800 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatJobContent(job.content || '')) }}
          />
        </div>

        {/* SEO Tags / Keywords Chips */}
        {job.tags && job.tags.length > 0 && (
          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-600 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-emerald-600" />
              <span>সম্পর্কিত কীওয়ার্ড:</span>
            </span>
            {job.tags.map((t, idx) => (
              <Link
                key={idx}
                to={`/jobs?search=${encodeURIComponent(t)}`}
                className="px-2.5 py-1 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-800 text-gray-700 text-xs rounded-lg transition-colors font-medium border border-gray-200"
              >
                #{t}
              </Link>
            ))}
          </div>
        )}

        {/* Circular Link Field */}
        {circularLink && (
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-emerald-900">
              <span className="font-bold block">অফিসিয়াল সার্কুলার ফাইল / নোটিশ লিংক</span>
              <span>মূল সার্কুলারটি পড়তে বা দেখতে পাশের লিংকে ক্লিক করুন।</span>
            </div>
            <a
              href={circularLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
            >
              <ExternalLink className="w-4 h-4" />
              <span>সার্কুলার লিংক দেখুন ↗</span>
            </a>
          </div>
        )}

        {/* Apply CTA Section */}
        <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50 p-5 rounded-xl">
          <div>
            <h4 className="font-bold text-gray-900 text-sm">
              {isExpired
                ? 'আবেদনের সময়সীমা শেষ'
                : job.applyServiceEnabled
                ? 'আমাদের মাধ্যমে অনলাইনে আবেদন করতে চান?'
                : 'অফিসিয়াল ওয়েবসাইটে আবেদন'}
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              {isExpired
                ? 'এই সার্কুলারের ডেডলাইন অতিক্রান্ত হয়েছে, ফলে আর আবেদন করা যাবে না।'
                : job.applyServiceEnabled
                ? job.posts && job.posts.length > 0
                  ? `পদভেদে সরকারি ফি + ১০ টাকা সার্ভিস চার্জ (বিস্তারিত উপরের টেবিলে দেখুন)`
                  : `টেলিটক ফি: ৳${job.applicationFee || 0} + সার্ভিস চার্জ: ৳${job.serviceCharge || 10} (মোট ৳${(job.applicationFee || 0) + (job.serviceCharge || 10)})`
                : 'বিজ্ঞপ্তিতে দেওয়া অফিশিয়াল লিংক ব্যবহার করে আবেদন করুন।'}
            </p>
          </div>

          {!isExpired && job.applyServiceEnabled ? (
            <Button onClick={handleApplyClick} icon={<Send className="w-4 h-4" />}>
              আবেদন করুন
            </Button>
          ) : !isExpired && job.applyLink ? (
            <a href={job.applyLink} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">অফিসিয়াল লিংকে যান ↗</Button>
            </a>
          ) : (
            <span className="px-3 py-1.5 bg-rose-100 text-rose-800 text-xs font-bold rounded-lg">
              মেয়াদোত্তীর্ণ (আবেদন বন্ধ)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
