import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import {
  saveFile,
  getFile,
  getFileId,
  compressImageToDataUrl,
  FILE_LIMITS,
} from '../../services/files';
import { syncJobToFeed } from '../../services/feed';
import { invalidateCache } from '../../services/cache';
import { JobCircular, JobCategory, JobStatus, JobPostItem } from '../../types';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { RichTextEditor } from '../../components/common/RichTextEditor';
import { JobPostsTableSection } from '../../components/admin/JobPostsTableSection';
import { DrivePickerButton } from '../../components/drive/DrivePickerButton';
import { generateSlug } from '../../utils/slugify';
import { useToast } from '../../components/common/Toast';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft,
  Save,
  Upload,
  Link as LinkIcon,
  Image as ImageIcon,
  Search,
  Tag,
  Globe,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  X,
  ExternalLink,
} from 'lucide-react';

export const AdminJobFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [jobId] = useState<string>(() => id || doc(collection(db, 'jobs')).id);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [category, setCategory] = useState<JobCategory>('govt');
  const [status, setStatus] = useState<JobStatus>('published');
  const [publishedAt, setPublishedAt] = useState('');
  const [content, setContent] = useState('');
  const [deadline, setDeadline] = useState('');
  const [applyLink, setApplyLink] = useState('');
  const [applyServiceEnabled, setApplyServiceEnabled] = useState(true);
  const [applicationFee, setApplicationFee] = useState<number>(0);
  const [serviceCharge, setServiceCharge] = useState<number>(10);
  const [hasCover, setHasCover] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [circularLink, setCircularLink] = useState('');
  const [posts, setPosts] = useState<JobPostItem[]>([{ name: '', count: 1, district: 'ALL' }]);

  // SEO & Social Optimization States
  const [seoTitle, setSeoTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [focusKeyword, setFocusKeyword] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (!id) return;
    const fetchJob = async () => {
      try {
        const snap = await getDoc(doc(db, 'jobs', id));
        if (snap.exists()) {
          const data = snap.data() as JobCircular;
          setTitle(data.title || '');
          setSlug(data.slug || '');
          setCategory(data.category || 'govt');
          setStatus(data.status || 'published');
          setContent(data.content || '');
          setApplyLink(data.applyLink || '');
          setApplyServiceEnabled(Boolean(data.applyServiceEnabled));
          setApplicationFee(data.applicationFee || 0);
          setServiceCharge(data.serviceCharge || 0);
          setCircularLink(data.circularLink || data.circularFile || '');
          setPosts(data.posts || [{ name: '', count: 1, district: 'ALL' }]);

          // Load SEO fields
          setSeoTitle(data.seoTitle || '');
          setMetaDescription(data.metaDescription || '');
          setFocusKeyword(data.focusKeyword || '');
          setTags(Array.isArray(data.tags) ? data.tags : []);

          const hasCov = Boolean(data.hasCover || data.featuredImage);
          setHasCover(hasCov);

          if (hasCov) {
            try {
              const fileDoc = await getFile(getFileId.cover(id));
              if (fileDoc?.data) {
                setCoverPreview(fileDoc.data);
              } else if (data.featuredImage) {
                setCoverPreview(data.featuredImage);
              }
            } catch (e) {
              // Ignore
            }
          }

          if (data.deadline) {
            const dateObj = data.deadline.toDate ? data.deadline.toDate() : new Date(data.deadline);
            setDeadline(dateObj.toISOString().slice(0, 16));
          }
          if (data.publishedAt) {
            const pDate = data.publishedAt.toDate ? data.publishedAt.toDate() : new Date(data.publishedAt);
            setPublishedAt(pDate.toISOString().slice(0, 16));
          }
        }
      } catch (e) {
        error('তথ্য লোড করতে সমস্যা হয়েছে');
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [id]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isEdit || !slug) setSlug(generateSlug(val));
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCoverUploading(true);
    try {
      // Auto compress to <=100KB JPEG
      const compressed = await compressImageToDataUrl(
        file,
        800,
        500,
        FILE_LIMITS.COVER,
        'image/jpeg'
      );

      if (compressed.sizeBytes > FILE_LIMITS.COVER) {
        throw new Error('কভার ইমেজের সাইজ সর্বোচ্চ ১০০ KB হতে পারবে');
      }

      await saveFile({
        id: getFileId.cover(jobId),
        ownerUid: user?.uid || 'admin',
        kind: 'cover',
        mime: 'image/jpeg',
        sizeBytes: compressed.sizeBytes,
        data: compressed.dataUrl,
      });

      setHasCover(true);
      setCoverPreview(compressed.dataUrl);
      success('কভার ইমেজ সফলভাবে সেভ হয়েছে (১০০ KB-এর নিচে)');
    } catch (err: any) {
      error(err.message || 'কভার ইমেজ আপলোড ব্যর্থ হয়েছে');
    } finally {
      setCoverUploading(false);
    }
  };

  const handleAddTag = (newTag: string) => {
    const clean = newTag.trim().replace(/^,+|,+$/g, '');
    if (!clean) return;
    if (!tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (indexToRemove: number) => {
    setTags(tags.filter((_, idx) => idx !== indexToRemove));
  };

  const handleGenerateMetaDescription = () => {
    const totalCount = posts.reduce((acc, p) => acc + (Number(p.count) || 0), 0);
    const countText = totalCount > 0 ? `মোট ${totalCount} টি পদে ` : '';
    const deadlineText = deadline
      ? `আবেদনের শেষ তারিখ: ${new Date(deadline).toLocaleDateString('bn-BD')}।`
      : '';
    const gen = `${title.trim()} নিয়োগ বিজ্ঞপ্তি প্রকাশ। ${countText}পদের বিবরণ, যোগ্যতা ও শর্তাবলী জেনে টেলিটকে সহজে আবেদন করুন। ${deadlineText} bdjobapply.site`.trim();
    setMetaDescription(gen.slice(0, 160));
    success('স্বয়ংক্রিয় মেটা ডেসক্রিপশন তৈরি করা হয়েছে!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !slug) {
      error('বিজ্ঞপ্তির শিরোনাম ও স্লাগ পূরণ করুন');
      return;
    }

    setSaving(true);
    try {
      const cleanPosts = posts
        .filter((p) => p && p.name && p.name.trim())
        .map((p) => {
          const item: any = {
            name: p.name.trim(),
            count: Number(p.count) || 1,
            district: p.district || 'ALL',
          };
          if (p.applicationFee !== undefined && p.applicationFee !== null && !isNaN(p.applicationFee)) {
            item.applicationFee = Number(p.applicationFee);
          }
          if (p.serviceCharge !== undefined && p.serviceCharge !== null && !isNaN(p.serviceCharge)) {
            item.serviceCharge = Number(p.serviceCharge);
          }
          return item;
        });

      const finalPosts = cleanPosts.length > 0 ? cleanPosts : [{ name: title.trim(), count: 1, district: 'ALL' }];

      const deadlineDate = deadline ? new Date(deadline) : null;
      const pubDate = status === 'scheduled' && publishedAt ? new Date(publishedAt) : new Date();

      const jobData: any = {
        title: title.trim(),
        slug: slug.trim(),
        category: category || 'govt',
        status: status || 'published',
        content: content || '',
        deadline: deadlineDate,
        publishedAt: pubDate,
        applyLink: (applyLink || '').trim(),
        applyServiceEnabled: Boolean(applyServiceEnabled),
        applicationFee: Number(applicationFee) || 0,
        serviceCharge: Number(serviceCharge) || 0,
        hasCover: Boolean(hasCover),
        circularLink: (circularLink || '').trim() || null,
        posts: finalPosts,
        // SEO & Social Optimization
        seoTitle: (seoTitle || '').trim() || null,
        metaDescription: (metaDescription || '').trim() || null,
        focusKeyword: (focusKeyword || '').trim() || null,
        tags: tags.map((t) => t.trim()).filter(Boolean),
        photoSpec: { width: 300, height: 300, maxKB: 100 },
        signatureSpec: { width: 300, height: 80, maxKB: 60 },
        updatedAt: serverTimestamp(),
      };

      if (!isEdit) {
        jobData.createdAt = serverTimestamp();
      }

      // Fast save with 12s safety timeout so button NEVER freezes
      await Promise.race([
        setDoc(doc(db, 'jobs', jobId), jobData, { merge: true }),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  'সার্ভারে সেভ হতে অতিরিক্ত সময় নিচ্ছে। আপনার ইন্টারনেট কানেকশন বা ফায়ারবেস অথেনটিকেশন চেক করুন।'
                )
              ),
            12000
          )
        ),
      ]);

      success(isEdit ? 'সার্কুলার আপডেট সম্পন্ন হয়েছে' : 'নতুন সার্কুলার প্রকাশ করা হয়েছে');

      // Sync feed and invalidate cache asynchronously in the background (NON-BLOCKING)
      syncJobToFeed(jobId, jobData, 'upsert').catch((feedErr) => {
        console.warn('Feed sync background notice:', feedErr);
      });
      invalidateCache('jobs_');
      invalidateCache('feed_');

      navigate('/admin/jobs');
    } catch (err: any) {
      console.error('Job save error:', err);
      error(err?.message || 'সার্কুলার সেভ করতে ব্যর্থ হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Spinner size="lg" text="বিজ্ঞপ্তি লোড হচ্ছে..." />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div className="flex items-center gap-3">
          <Link to="/admin/jobs" className="p-2 text-gray-500 hover:text-gray-900 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? 'চাকরির বিজ্ঞপ্তি সম্পাদনা' : 'নতুন চাকরির বিজ্ঞপ্তি প্রকাশ'}
          </h2>
        </div>
        <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>
          {isEdit ? 'আপডেট করুন' : 'প্রকাশ করুন'}
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <Input
          label="বিজ্ঞপ্তির শিরোনাম (Job Title)"
          placeholder="যেমন: বাংলাদেশ রেলওয়ে নতুন নিয়োগ বিজ্ঞপ্তি ২০২৬"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          requiredStar
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="URL স্লাগ (Slug)" value={slug} onChange={(e) => setSlug(e.target.value)} requiredStar />
          <Select
            label="ক্যাটাগরি"
            value={category}
            onChange={(e) => setCategory(e.target.value as JobCategory)}
            options={[
              { value: 'govt', label: 'সরকারি চাকরি' },
              { value: 'private', label: 'বেসরকারি চাকরি' },
              { value: 'ngo', label: 'এনজিও চাকরি' },
              { value: 'pharma', label: 'ফার্মাসিউটিক্যাল' },
              { value: 'foreign', label: 'বিদেশি চাকরি' },
              { value: 'solution', label: 'সমাধান/অন্যান্য' },
            ]}
          />
          <Select
            label="পাবলিশিং স্ট্যাটাস"
            value={status}
            onChange={(e) => setStatus(e.target.value as JobStatus)}
            options={[
              { value: 'published', label: 'Published (সরাসরি প্রকাশ)' },
              { value: 'draft', label: 'Draft (খসড়া)' },
              { value: 'scheduled', label: 'Scheduled (নির্ধারিত সময়ে)' },
            ]}
          />
        </div>

        {status === 'scheduled' && (
          <Input label="প্রকাশের সময়সূচী" type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} requiredStar />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="আবেদনের শেষ তারিখ ও সময়" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} requiredStar />
          <Input label="অফিসিয়াল Teletalk আবেদন লিংক" placeholder="http://br.teletalk.com.bd" value={applyLink} onChange={(e) => setApplyLink(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-gray-900">
          <input
            type="checkbox"
            checked={applyServiceEnabled}
            onChange={(e) => setApplyServiceEnabled(e.target.checked)}
            className="w-4 h-4 text-emerald-600 rounded"
          />
          <span>আমাদের অনলাইন আবেদন সেবা চালু রাখুন</span>
        </label>
        {applyServiceEnabled && (
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="আমাদের অনলাইন আবেদন ফি / সার্ভিস চার্জ (৳)"
                  type="number"
                  value={serviceCharge}
                  onChange={(e) => setServiceCharge(Number(e.target.value))}
                  requiredStar
                  placeholder="১০"
                />
                <p className="text-[11px] text-emerald-800 mt-1">
                  💡 প্রতিটি ভিন্ন ভিন্ন পদের সরকারি ফি&apos;র সাথে এই <strong>{serviceCharge || 10} টাকা</strong> যোগ হয়ে মোট ফি নির্ধারিত হবে।
                </p>
              </div>
              <div>
                <Input
                  label="সাধারণ সরকারি আবেদন ফি (৳) (ঐচ্ছিক)"
                  type="number"
                  value={applicationFee || ''}
                  onChange={(e) => setApplicationFee(Number(e.target.value) || 0)}
                  placeholder="যেমন: ৫০ বা ১০০ বা ২২৩"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  নিচের &ldquo;পদের তালিকা&rdquo; সেকশনে প্রতিটি পদের নির্দিষ্ট সরকারি ফি দিলে স্বয়ংক্রিয়ভাবে সেটাই কার্যকর হবে।
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <JobPostsTableSection
        posts={posts}
        onAddPost={() => setPosts([...posts, { name: '', count: 1, district: 'ALL' }])}
        onUpdatePost={(idx, field, val) => {
          const u = [...posts];
          u[idx] = { ...u[idx], [field]: val };
          setPosts(u);
        }}
        onRemovePost={(idx) => setPosts(posts.filter((_, i) => i !== idx))}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <RichTextEditor label="সার্কুলারের সম্পূর্ণ বিবরণ (HTML Content)" value={content} onChange={setContent} />
      </div>

      {/* Cover Image & Circular Link Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
          কভার ইমেজ ও সার্কুলার লিংক (০ খরচে ফায়ারস্টোর স্টোরেজ)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Cover image (≤100KB, lazy loaded on details page only) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700">
              ছোট কভার ইমেজ (সর্বোচ্চ ১০০ KB, বিস্তারিত পেজে প্রদর্শিত)
            </label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold cursor-pointer hover:bg-emerald-100 border border-emerald-200">
                <Upload className="w-3.5 h-3.5" />
                <span>{coverUploading ? 'সংকোচন হচ্ছে...' : 'কভার নির্বাচন করুন'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverUpload}
                  className="hidden"
                  disabled={coverUploading}
                />
              </label>
              {hasCover && <span className="text-[11px] text-emerald-700 font-bold">✓ কভার যুক্ত আছে</span>}
            </div>
            {coverPreview && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 max-w-xs max-h-36">
                <img src={coverPreview} alt="Cover Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* Official circular link field */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-gray-700">
                সার্কুলার ফাইল লিংক (Google Drive বা অফিসিয়াল সাইট লিংক)
              </label>
              <DrivePickerButton
                acceptMime="pdf"
                label="Google Drive থেকে বাছুন / আপলোড করুন"
                onSelectDriveUrl={(url) => setCircularLink(url)}
              />
            </div>
            <Input
              label=""
              placeholder="https://drive.google.com/... অথবা অফিসিয়াল লিংক"
              value={circularLink}
              onChange={(e) => setCircularLink(e.target.value)}
              helperText="সার্কুলার PDF সরাসরি গুগল ড্রাইভে আপলোড করে অথবা ড্রাইভ থেকে বেছে লিংক দিতে পারেন"
            />
          </div>
        </div>
      </div>

      {/* SEO & Search Engine Ranking Optimization Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6 space-y-6 shadow-xs">
        <div className="border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                সার্চ ইঞ্জিন অপ্টিমাইজেশন (SEO & Google Rank Optimization)
              </h3>
              <p className="text-xs text-gray-500">
                গুগল সার্চ ও সোশ্যাল মিডিয়ায় পোস্ট ১ নম্বরে র‍্যাংক করানোর জন্য মেটা ট্যাগ, কিওয়ার্ড ও ডেসক্রিপশন সেট করুন
              </p>
            </div>
          </div>
        </div>

        {/* 1. Focus Keyword with Real-Time SEO Audit */}
        <div className="space-y-3 bg-emerald-50/40 p-4 rounded-xl border border-emerald-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-800">
                মূল ফোকাস কিওয়ার্ড (Focus Keyword)
              </label>
              <span className="text-[11px] text-gray-500">
                যে কথাটি দিয়ে মানুষ গুগলে খুঁজবে (যেমন: &ldquo;বাংলাদেশ রেলওয়ে নিয়োগ বিজ্ঞপ্তি&rdquo; বা &ldquo;পল্লী বিদ্যুৎ সার্কুলার&rdquo;)
              </span>
            </div>
          </div>

          <Input
            placeholder="যেমন: বাংলাদেশ রেলওয়ে নিয়োগ বিজ্ঞপ্তি ২০২৬"
            value={focusKeyword}
            onChange={(e) => setFocusKeyword(e.target.value)}
          />

          {focusKeyword && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="font-semibold text-gray-600">SEO অডিট:</span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium ${
                  title.toLowerCase().includes(focusKeyword.toLowerCase().trim())
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {title.toLowerCase().includes(focusKeyword.toLowerCase().trim()) ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>টাইটেলে আছে</span>
              </span>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium ${
                  metaDescription.toLowerCase().includes(focusKeyword.toLowerCase().trim())
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {metaDescription.toLowerCase().includes(focusKeyword.toLowerCase().trim()) ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>মেটা ডেসক্রিপশনে আছে</span>
              </span>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium ${
                  content.toLowerCase().includes(focusKeyword.toLowerCase().trim())
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {content.toLowerCase().includes(focusKeyword.toLowerCase().trim()) ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>কন্টেন্টে আছে</span>
              </span>
            </div>
          )}
        </div>

        {/* 2. SEO Title & Meta Description */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-800">
                SEO পেজ টাইটেল (Title Tag)
              </label>
              <span className="text-[11px] text-gray-500">
                {(seoTitle || title).length}/৬০ অক্ষর (সেরা: ৪৫-৬০)
              </span>
            </div>
            <Input
              placeholder={title || 'গুগলে প্রদর্শিত আকর্ষণীয় শিরোনাম লিখুন...'}
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              helperText="খালি রাখলে স্বয়ংক্রিয়ভাবে মূল শিরোনাম ব্যবহৃত হবে।"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div>
                <label className="block text-xs font-bold text-gray-800">
                  মেটা ডেসক্রিপশন (Meta Description)
                </label>
                <span className="text-[11px] text-gray-500">
                  গুগল সার্চ ফলাফলে শিরোনামের নিচে এই ১-২ লাইনের বিবরণটি প্রদর্শিত হয়
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateMetaDescription}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                  title="টাইটেল ও সার্কুলারের ডাটা দিয়ে স্বয়ংক্রিয়ভাবে মেটা ডেসক্রিপশন তৈরি করুন"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>✨ অটো তৈরি করুন</span>
                </button>

                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    metaDescription.length >= 120 && metaDescription.length <= 160
                      ? 'bg-emerald-100 text-emerald-800'
                      : metaDescription.length > 160
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {metaDescription.length}/১৬০ অক্ষর
                </span>
              </div>
            </div>

            <textarea
              rows={3}
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="যেমন: বাংলাদেশ রেলওয়ে নিয়োগ বিজ্ঞপ্তি ২০২৬ প্রকাশ। মোট ৩৪০ টি পদে আবেদনের বিস্তারিত যোগ্যতা, বয়স ও টেলিটক অনলাইন আবেদন পদ্ধতি জানুন। শেষ তারিখ: ৩০ অক্টোবর..."
              className="w-full p-3 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 leading-relaxed text-gray-800"
            />

            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  metaDescription.length >= 120 && metaDescription.length <= 160
                    ? 'bg-emerald-500'
                    : metaDescription.length > 160
                    ? 'bg-rose-500'
                    : 'bg-amber-400'
                }`}
                style={{ width: `${Math.min(100, (metaDescription.length / 160) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 3. Tags / Keywords */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold text-gray-800">
            ট্যাগ ও কীওয়ার্ডসমূহ (Tags / Keywords)
          </label>
          <div className="flex flex-wrap items-center gap-1.5 p-2.5 bg-gray-50 rounded-xl border border-gray-200 min-h-[44px]">
            {tags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 text-gray-800 rounded-lg text-xs font-medium shadow-xs"
              >
                <Tag className="w-3 h-3 text-emerald-600" />
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(idx)}
                  className="text-gray-400 hover:text-rose-600 transition-colors ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  handleAddTag(tagInput);
                }
              }}
              onBlur={() => {
                if (tagInput.trim()) handleAddTag(tagInput);
              }}
              placeholder={tags.length === 0 ? 'ট্যাগ লিখে Enter বা কমা দিন...' : 'আরও ট্যাগ যোগ করুন...'}
              className="bg-transparent text-xs focus:outline-none flex-1 min-w-[140px] px-1 py-1"
            />
          </div>

          {/* Quick Suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-gray-500 font-medium">জনপ্রিয় সাজেশন:</span>
            {[
              'সরকারি চাকরি',
              'টেলিটক সার্কুলার',
              'নিয়োগ বিজ্ঞপ্তি ২০২৬',
              'রাজস্ব খাত',
              '৯ম গ্রেড',
              '১০ম গ্রেড',
              'অনলাইন আবেদন',
            ].map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => handleAddTag(sug)}
                disabled={tags.includes(sug)}
                className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                  tags.includes(sug)
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-white hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 border-gray-200'
                }`}
              >
                + {sug}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Live Google Search Preview (SERP Card) */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
            <Globe className="w-3.5 h-3.5 text-blue-600" />
            <span>গুগল সার্চ ফলাফল প্রিভিউ (Google Search Preview)</span>
          </div>

          <div className="p-4 bg-white rounded-lg border border-gray-200 font-sans shadow-xs space-y-1">
            <div className="text-[11px] text-gray-500 flex items-center gap-1">
              <span className="font-semibold text-emerald-800">https://bdjobapply.site</span>
              <span>›</span>
              <span>jobs</span>
              <span>›</span>
              <span className="text-gray-700 font-medium">{slug || 'circular-slug'}</span>
            </div>

            <h4 className="text-blue-700 hover:underline font-medium text-base leading-snug cursor-pointer">
              {seoTitle || title || 'চাকরির নিয়োগ বিজ্ঞপ্তি | অনলাইনে আবেদন'} | BDJobApply.site
            </h4>

            <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
              {metaDescription ||
                'চাকরির নিয়োগ বিজ্ঞপ্তি প্রকাশ হয়েছে। পদের বিবরণ, শিক্ষাগত যোগ্যতা ও শর্তাবলী জেনে সহজে অনলাইনে আবেদন করুন।'}
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};
