import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getFile, getFileId } from '../../services/files';
import { getCached, setCached, getCachedWithSWR, precacheJob, findJobInAnyCache } from '../../services/cache';
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
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  X,
  RotateCcw,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { useAuth } from '../../context/AuthContext';
import { formatJobContent } from '../../utils/formatJobContent';

export const JobDetailsPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Instant 0ms Preload Check: Read from Router navigation state or local cache
  const getPreloadedJob = (): JobCircular | null => {
    if (!slug) return null;
    const stateJob = (location.state as any)?.preloadedJob || (location.state as any)?.job;
    if (stateJob && (stateJob.slug === slug || stateJob.id === slug)) {
      return stateJob as JobCircular;
    }
    return findJobInAnyCache(slug);
  };

  const [job, setJob] = useState<JobCircular | null>(getPreloadedJob);
  const [loading, setLoading] = useState<boolean>(() => !getPreloadedJob());
  const [coverDataUrl, setCoverDataUrl] = useState<string>(() => {
    const pre = getPreloadedJob();
    return pre?.featuredImage || '';
  });

  // Multiple circular images state
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [viewAllPages, setViewAllPages] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState<number>(1);

  // Superfast data fetching with Parallel Lookups + Stale-While-Revalidate
  useEffect(() => {
    if (!slug) return;
    const cacheKey = `job_detail_${slug}`;

    // 1. Check multi-layer cache with SWR
    const swr = getCachedWithSWR<JobCircular>(cacheKey);
    if (swr.data) {
      setJob(swr.data);
      setLoading(false);
      if (swr.data.featuredImage) {
        setCoverDataUrl(swr.data.featuredImage);
      }
      // If data is fresh and has full content, no network fetch needed
      if (!swr.isStale && swr.data.content && swr.data.content.length > 50) {
        return;
      }
    }

    let isCancelled = false;

    const fetchJob = async () => {
      try {
        // Step A: Ultra-fast Server-Side Edge API (Zero client Firestore reads, ~15ms response)
        try {
          const apiRes = await fetch(`/api/jobs/${encodeURIComponent(slug)}`);
          if (apiRes.ok) {
            const apiJob = await apiRes.json();
            if (apiJob && apiJob.title) {
              if (isCancelled) return;
              setCached(cacheKey, apiJob);
              precacheJob(apiJob);
              setJob(apiJob);
              if (apiJob.featuredImage) setCoverDataUrl(apiJob.featuredImage);
              setLoading(false);
              return;
            }
          }
        } catch {
          // Fallback to client-side Firestore SDK
        }

        // Step B: Parallel Client SDK Queries (Fallback)
        const docRef = doc(db, 'jobs', slug);
        const qSlug = query(collection(db, 'jobs'), where('slug', '==', slug), limit(1));

        const [docSnap, querySnap] = await Promise.all([
          getDoc(docRef).catch(() => null),
          getDocs(qSlug).catch(() => null),
        ]);

        if (isCancelled) return;

        let resolvedJob: JobCircular | null = null;
        if (querySnap && !querySnap.empty) {
          const docItem = querySnap.docs[0];
          resolvedJob = { id: docItem.id, ...docItem.data() } as JobCircular;
        } else if (docSnap && docSnap.exists()) {
          resolvedJob = { id: docSnap.id, ...docSnap.data() } as JobCircular;
        }

        if (resolvedJob) {
          setCached(cacheKey, resolvedJob);
          precacheJob(resolvedJob);
          setJob(resolvedJob);
          if (resolvedJob.featuredImage) {
            setCoverDataUrl(resolvedJob.featuredImage);
          }
        }
      } catch (err) {
        // Silently handled
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchJob();
    return () => {
      isCancelled = true;
    };
  }, [slug]);

  // Lazy load cover image if stored in files collection
  useEffect(() => {
    if (!job) return;

    if (job.featuredImage) {
      setCoverDataUrl(job.featuredImage);
      return;
    }

    if (job.hasCover && !coverDataUrl) {
      getFile(getFileId.cover(job.id))
        .then((fileDoc) => {
          if (fileDoc?.data) {
            setCoverDataUrl(fileDoc.data);
          }
        })
        .catch(() => {});
    }
  }, [job?.id, job?.hasCover]);

  // Handle keyboard ESC for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxImage) {
        setLightboxImage(null);
        setLightboxZoom(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  if (loading && !job) {
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
  const circularImagesList = Array.isArray(job.circularImages) ? job.circularImages : [];

  // SEO & Social Meta Configuration
  const baseDomain = 'https://bdjobapply.site';
  const canonicalUrl = `${baseDomain}/jobs/${encodeURIComponent(job.slug || job.id)}`;
  const pageTitle = job.seoTitle
    ? `${job.seoTitle} | BDJobApply.site`
    : `${job.title} | BDJobApply.site`;

  const metaDescription =
    job.metaDescription ||
    `${job.title}। সরকারি ও টেলিটক অনলাইন আবেদন সেবা। আবেদনের শেষ তারিখ: ${
      deadlineDate ? deadlineDate.toLocaleDateString('bn-BD') : 'বিজ্ঞপ্তি দেখুন'
    }। পদে পদের যোগ্যতা ও নিয়মাবলি জানুন। bdjobapply.site`;

  const keywordsString =
    job.tags && job.tags.length > 0
      ? job.tags.join(', ')
      : `${job.title}, সরকারি চাকরি, টেলিটক জব সার্কুলার, নিয়োগ বিজ্ঞপ্তি, bdjobapply`;

  const shareImage =
    coverDataUrl ||
    job.featuredImage ||
    circularImagesList[0] ||
    `${baseDomain}/og-image.jpg`;

  // Google JobPosting & BreadcrumbList JSON-LD Schemas
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'JobPosting',
        '@id': `${canonicalUrl}#job`,
        title: job.title,
        description: metaDescription,
        url: canonicalUrl,
        datePosted: job.publishedAt?.toDate
          ? job.publishedAt.toDate().toISOString()
          : typeof job.publishedAt === 'string'
          ? job.publishedAt
          : new Date().toISOString(),
        validThrough: deadlineDate ? deadlineDate.toISOString() : undefined,
        employmentType: 'FULL_TIME',
        hiringOrganization: {
          '@type': 'Organization',
          name: job.category === 'govt' ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার' : 'নিয়োগকারী কর্তৃপক্ষ',
          sameAs: job.applyLink || 'https://teletalk.com.bd',
        },
        jobLocation: {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressCountry: 'BD',
          },
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'হোম',
            item: `${baseDomain}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'চাকরির খবর',
            item: `${baseDomain}/jobs`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: job.title,
            item: canonicalUrl,
          },
        ],
      },
    ],
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
        <link rel="canonical" href={canonicalUrl} />

        {/* OpenGraph / Facebook */}
        <meta property="og:site_name" content="BD Job Apply" />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={shareImage} />
        <meta property="og:locale" content="bn_BD" />

        {/* Twitter Cards */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={shareImage} />

        {/* Google Jobs & Breadcrumb Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
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

        {/* Cover Image */}
        {coverDataUrl && (
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <img
              src={coverDataUrl}
              alt={job.title}
              loading="lazy"
              className="w-full max-h-96 object-cover"
            />
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
                    const postAppFee =
                      p.applicationFee != null && !isNaN(p.applicationFee)
                        ? p.applicationFee
                        : job.applicationFee || 0;
                    const postServiceCharge =
                      p.serviceCharge != null && !isNaN(p.serviceCharge)
                        ? p.serviceCharge
                        : job.serviceCharge != null
                        ? job.serviceCharge
                        : 10;
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

        {/* MULTI-PAGE CIRCULAR IMAGES VIEWER */}
        {circularImagesList.length > 0 && (
          <div className="bg-emerald-50/40 rounded-2xl border border-emerald-200/80 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    নিয়োগ বিজ্ঞপ্তির মূল পাতাসমূহ ({circularImagesList.length}টি পাতা)
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    পত্রিকা/অফিসিয়াল সার্কুলারটি পরিষ্কার পড়তে জুম বাটনে চাপ দিন
                  </p>
                </div>
              </div>

              {circularImagesList.length > 1 && (
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setViewAllPages(false)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      !viewAllPages
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    পাতাওয়ারি দেখুন
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewAllPages(true)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      viewAllPages
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    সকল পাতা একসাথে
                  </button>
                </div>
              )}
            </div>

            {/* Page selection pills when multiple pages exist */}
            {circularImagesList.length > 1 && !viewAllPages && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {circularImagesList.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedImageIndex === idx
                        ? 'bg-emerald-600 text-white shadow-xs scale-102 ring-2 ring-emerald-500/30'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-emerald-50 hover:text-emerald-800'
                    }`}
                  >
                    পাতা {idx + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Display: Single Page or All Pages */}
            {!viewAllPages ? (
              <div className="space-y-3">
                <div className="relative group bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
                  <img
                    src={circularImagesList[selectedImageIndex] || circularImagesList[0]}
                    alt={`${job.title} - পাতা ${selectedImageIndex + 1}`}
                    loading="lazy"
                    className="w-full max-h-[85vh] object-contain mx-auto cursor-zoom-in"
                    onClick={() => {
                      setLightboxImage(circularImagesList[selectedImageIndex] || circularImagesList[0]);
                      setLightboxZoom(1);
                    }}
                  />
                  <div className="absolute top-3 right-3 flex items-center gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => {
                        setLightboxImage(circularImagesList[selectedImageIndex] || circularImagesList[0]);
                        setLightboxZoom(1);
                      }}
                      className="px-3 py-1.5 bg-black/75 hover:bg-black text-white rounded-lg text-xs font-semibold backdrop-blur-xs flex items-center gap-1.5 shadow-md"
                      title="ফুল স্ক্রিনে বড় করে জুম করে দেখুন"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>বড় করে দেখুন</span>
                    </button>
                    <a
                      href={circularImagesList[selectedImageIndex] || circularImagesList[0]}
                      download={`circular_page_${selectedImageIndex + 1}.jpg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-black/75 hover:bg-black text-white rounded-lg backdrop-blur-xs shadow-md"
                      title="ছবিটি ডাউনলোড করুন"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
                {circularImagesList.length > 1 && (
                  <p className="text-center text-xs text-gray-500">
                    [ পাতা {selectedImageIndex + 1} প্রদর্শিত হচ্ছে। অন্য পাতা দেখতে উপরের বোতামে চাপ দিন ]
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {circularImagesList.map((imgUrl, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-700 font-bold px-1">
                      <span>পাতা {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setLightboxImage(imgUrl);
                          setLightboxZoom(1);
                        }}
                        className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>জুম করুন</span>
                      </button>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
                      <img
                        src={imgUrl}
                        alt={`${job.title} - পাতা ${idx + 1}`}
                        loading="lazy"
                        className="w-full max-h-[85vh] object-contain mx-auto cursor-zoom-in"
                        onClick={() => {
                          setLightboxImage(imgUrl);
                          setLightboxZoom(1);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Circular Details Content (Sanitized) */}
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
            বিজ্ঞপ্তির বিস্তারিত বিবরণ:
          </h3>
          <div
            className="job-content text-gray-800 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(formatJobContent(job.content || '')),
            }}
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

      {/* FULL-SCREEN ZOOM LIGHTBOX MODAL */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-between p-4 animate-fadeIn"
          onClick={() => {
            setLightboxImage(null);
            setLightboxZoom(1);
          }}
        >
          {/* Top Control Bar */}
          <div
            className="w-full max-w-4xl flex items-center justify-between text-white py-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-md">
                জুম: {(lightboxZoom * 100).toFixed(0)}%
              </span>
              <button
                type="button"
                onClick={() => setLightboxZoom((z) => Math.min(z + 0.3, 3))}
                className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
                title="জুম ইন (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom((z) => Math.max(z - 0.3, 0.7))}
                className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
                title="জুম আউট (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom(1)}
                className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
                title="রিসেট"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <a
                href={lightboxImage}
                download="job_circular.jpg"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ডাউনলোড</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setLightboxImage(null);
                  setLightboxZoom(1);
                }}
                className="p-1.5 bg-white/20 hover:bg-rose-600 rounded-lg text-white transition-colors"
                title="বন্ধ করুন (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Centered Scrollable Image Container */}
          <div
            className="flex-1 w-full overflow-auto flex items-center justify-center p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage}
              alt="Circular Zoom View"
              style={{
                transform: `scale(${lightboxZoom})`,
                transition: 'transform 0.15s ease-out',
                transformOrigin: 'center center',
              }}
              className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Bottom Hint */}
          <p className="text-white/60 text-xs text-center py-1">
            স্ক্রিনের বাইরে ক্লিক করুন অথবা কীবোর্ডের <strong>ESC</strong> চাপলে বন্ধ হবে
          </p>
        </div>
      )}
    </div>
  );
};
