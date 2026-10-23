import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  saveFile,
  getFile,
  getFileId,
  compressImageToDataUrl,
  getBestSmartImageMimeType,
  FILE_LIMITS,
} from '../../services/files';
import { invalidateCache } from '../../services/cache';
import { auth } from '../../services/firebase';
import { WORKER_URL, fetchJobsList, saveJobToWorker, R2_BASE } from '../../services/jobsStore';
import { JobCircular, JobCategory, JobStatus, JobPostItem } from '../../types';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { RichTextEditor } from '../../components/common/RichTextEditor';
import { JobPostsTableSection } from '../../components/admin/JobPostsTableSection';
import { DrivePickerButton } from '../../components/drive/DrivePickerButton';
import { isDriveConnected, uploadJobImageToDrive } from '../../services/googleDrive';
import { generateSlug } from '../../utils/slugify';
import { extractJobLocally } from '../../utils/localJobExtractor';
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
  ChevronDown,
  ChevronUp,
  Wand2,
  FileText,
  Trash2,
  Layers,
  Plus,
  Check,
} from 'lucide-react';

export const AdminJobFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  // Firestore ছাড়া নতুন ID: প্রথমবার তৈরি হয়ে এই ফর্মে স্থির থাকে
  const [jobId] = useState<string>(
    () => id || 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
  );

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
  const [pdfUploading, setPdfUploading] = useState(false);
  const [circularImages, setCircularImages] = useState<string[]>([]);
  const [uploadingMultiImages, setUploadingMultiImages] = useState(false);
  const [multiUploadProgress, setMultiUploadProgress] = useState('');
  const [posts, setPosts] = useState<JobPostItem[]>([{ name: '', count: 1, district: 'ALL' }]);

  // SEO & Social Optimization States
  const [seoTitle, setSeoTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [focusKeyword, setFocusKeyword] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // AI Autofill States
  const [aiAutofillOpen, setAiAutofillOpen] = useState(true);
  const [aiInputMode, setAiInputMode] = useState<'url' | 'text'>('url');
  const [aiSourceUrl, setAiSourceUrl] = useState('');
  const [aiSourceText, setAiSourceText] = useState('');
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiError, setAiError] = useState('');

  const handleAiAutofill = async () => {
    setAiError('');

    // Auto-detect if user mistakenly pasted raw circular text into the URL box
    let currentMode = aiInputMode;
    let urlVal = aiSourceUrl.trim();
    let textVal = aiSourceText.trim();

    if (currentMode === 'url' && urlVal) {
      const isLikelyRawText = urlVal.length > 120 || /[\u0980-\u09FF]|\n|<[a-z]/i.test(urlVal);
      if (isLikelyRawText) {
        currentMode = 'text';
        textVal = urlVal;
        setAiInputMode('text');
        setAiSourceText(urlVal);
      }
    }

    if (currentMode === 'url' && !urlVal) {
      error('অনুগ্রহ করে ওয়েবসাইটের লিঙ্ক দিন');
      return;
    }
    if (currentMode === 'text' && !textVal) {
      error('অনুগ্রহ করে সার্কুলারের টেক্সট পেস্ট করুন');
      return;
    }

    setAiExtracting(true);

    const applyExtractedData = (data: any) => {
      if (data.title) setTitle(data.title);
      if (data.slug) setSlug(data.slug);
      if (data.category) setCategory(data.category);
      if (data.deadline) setDeadline(data.deadline);
      if (data.applyLink) setApplyLink(data.applyLink);
      if (data.circularLink) setCircularLink(data.circularLink);
      if (data.applicationFee !== undefined) setApplicationFee(Number(data.applicationFee) || 0);
      if (data.serviceCharge !== undefined) setServiceCharge(Number(data.serviceCharge) || 20);
      if (Array.isArray(data.posts) && data.posts.length > 0) setPosts(data.posts);
      if (data.content) setContent(data.content);
      if (data.seoTitle) setSeoTitle(data.seoTitle);
      if (data.metaDescription) setMetaDescription(data.metaDescription);
      if (data.focusKeyword) setFocusKeyword(data.focusKeyword);
      if (Array.isArray(data.tags) && data.tags.length > 0) setTags(data.tags);
    };

    // 1. First attempt: Full-stack AI extractor
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      const res = await fetch('/api/ai/extract-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: currentMode === 'url' ? urlVal : undefined,
          rawText: currentMode === 'text' ? textVal : undefined,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (res.ok) {
        const data = await res.json();
        applyExtractedData(data);
        success('✨ সফলভাবে সকল ফিল্ড পূরণ করা হয়েছে! টাইটেল, স্লাগ, মেটা ট্যাগ ও বিবরণ প্রস্তুত।');
        setAiAutofillOpen(false);
        setAiError('');
        setAiExtracting(false);
        return;
      } else {
        const errJson = await res.json().catch(() => null);
        console.warn('Backend extract-job non-200 response:', errJson);
      }
    } catch (apiErr: any) {
      console.warn('Backend AI extractor notice, activating resilient local smart extractor:', apiErr);
    }

    // 2. Resilient fallback: If raw text is available, immediately extract locally with 100% guarantee!
    if (textVal) {
      try {
        const localData = extractJobLocally(textVal);
        applyExtractedData(localData);
        success('✨ স্মার্ট ইঞ্জিনের মাধ্যমে সকল ফিল্ড সফলভাবে পূরণ করা হয়েছে!');
        setAiAutofillOpen(false);
        setAiError('');
        setAiExtracting(false);
        return;
      } catch (localErr: any) {
        console.error('Local extractor error:', localErr);
      }
    }

    // 3. If in URL mode and fetch failed (e.g. Cloudflare block on competitor website)
    const msg =
      'প্রতিযোগী সাইটটি সরাসরি লিংক স্ক্র্যাপ করা ব্লক করেছে (Cloudflare/Anti-bot)। অনুগ্রহ করে সেই পেজের টেক্সটগুলো কপি করে "📝 টেক্সট পেস্ট করুন" ট্যাবে পেস্ট করুন, এক ক্লিকে সম্পূর্ণ ফর্ম পূরণ হবে!';
    setAiError(msg);
    error(msg);
    setAiInputMode('text');
    setAiExtracting(false);
  };

  useEffect(() => {
    if (!id) return;
    const fetchJob = async () => {
      try {
        let data: any = null;

        // R2 jobs.json থেকে (অ্যাডমিনের জন্য ক্যাশ ছাড়া, ড্রাফটসহ সব জব)
        try {
          const list = await fetchJobsList(true);
          data = list.find((j: any) => j.id === id || j.slug === id) || null;
        } catch (err) {
          console.warn('Job load failed:', err);
        }

                // চলমান তালিকায় না থাকলে আর্কাইব থেকে (মেয়াদ শেষ সার্কুলার সম্পাদনার জন্য)
        if (!data) {
          try {
            const u = auth.currentUser;
            if (u) {
              const token = await u.getIdToken();
              const r = await fetch(`${WORKER_URL}/api/admin/archive/${encodeURIComponent(id)}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (r.ok) data = await r.json();
            }
          } catch (err) {
            console.warn('Archive load failed:', err);
          }
        }

                // বিবরণ আলাদা ফাইলে থাকে (হালকা তালিকায় নেই)
        if (data && !data.content) {
          try {
            const r = await fetch(
              `${R2_BASE}/jobs/detail/${encodeURIComponent(data.slug || data.id)}.json?t=${Date.now()}`,
              { cache: 'no-store' }
            );
            if (r.ok) {
              data = { ...data, ...(await r.json()) };
            }
          } catch (err) {
            console.warn('Detail load failed:', err);
          }
        }

        if (data) {
          setTitle(data.title || '');
          setSlug(data.slug || '');
          setCategory(data.category || 'govt');
          setStatus(data.status || 'published');
          setContent(data.content || '');
          setApplyLink(data.applyLink || '');
          setApplyServiceEnabled(data.applyServiceEnabled !== undefined ? Boolean(data.applyServiceEnabled) : true);
          setApplicationFee(data.applicationFee || 0);
          setServiceCharge(data.serviceCharge || 0);
          setCircularLink(data.circularLink || data.circularFile || '');
          if (Array.isArray(data.circularImages)) {
            setCircularImages(data.circularImages);
          }
          setPosts(Array.isArray(data.posts) && data.posts.length > 0 ? data.posts : [{ name: '', count: 1, district: 'ALL' }]);

          // Load SEO fields
          setSeoTitle(data.seoTitle || '');
          setMetaDescription(data.metaDescription || '');
          setFocusKeyword(data.focusKeyword || '');
          setTags(Array.isArray(data.tags) ? data.tags : []);

          const hasCov = Boolean(data.hasCover || data.featuredImage);
          setHasCover(hasCov);

          if (hasCov) {
            if (data.featuredImage) {
              setCoverPreview(data.featuredImage);
            } else {
              try {
                const fileDoc = await getFile(getFileId.cover(id));
                if (fileDoc?.data) setCoverPreview(fileDoc.data);
              } catch {}
            }
          }

          if (data.deadline) {
            try {
              const dateObj = data.deadline.toDate ? data.deadline.toDate() : new Date(data.deadline);
              if (!isNaN(dateObj.getTime())) setDeadline(dateObj.toISOString().slice(0, 16));
            } catch {}
          }
          if (data.publishedAt) {
            try {
              const pDate = data.publishedAt.toDate ? data.publishedAt.toDate() : new Date(data.publishedAt);
              if (!isNaN(pDate.getTime())) setPublishedAt(pDate.toISOString().slice(0, 16));
            } catch {}
          }
        } else {
          error('বিজ্ঞপ্তিটি খুঁজে পাওয়া যায়নি');
        }
      } catch (e) {
        error('তথ্য লোড করতে সমস্যা হয়েছে');
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
      // Auto compress to smart WebP (<=100KB)
      const smartMime = getBestSmartImageMimeType();
      const compressed = await compressImageToDataUrl(
        file,
        900,
        600,
        FILE_LIMITS.COVER,
        smartMime
      );

      if (compressed.sizeBytes > FILE_LIMITS.COVER) {
        throw new Error('কভার ইমেজের সাইজ সর্বোচ্চ ১০০ KB হতে পারবে');
      }

      let finalUrl = compressed.dataUrl;
      try {
        const upRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: compressed.dataUrl,
            fileName: `${slug || 'job'}_cover_${file.name}`,
            folder: 'covers',
            mimeType: smartMime,
          }),
        });
        const upData = await upRes.json();
        if (upRes.ok && upData.success && upData.url) {
          finalUrl = upData.url;
        }
      } catch {
        // Fallback to dataUrl
      }

      await saveFile({
        id: getFileId.cover(jobId),
        ownerUid: user?.uid || 'admin',
        kind: 'cover',
        mime: smartMime,
        sizeBytes: compressed.sizeBytes,
        data: finalUrl,
      });

      setHasCover(true);
      setCoverPreview(finalUrl);
      success('কভার ইমেজ সফলভাবে WebP ফরম্যাটে সেভ হয়েছে (১০০ KB-এর নিচে)');
    } catch (err: any) {
      error(err.message || 'কভার ইমেজ আপলোড ব্যর্থ হয়েছে');
    } finally {
      setCoverUploading(false);
    }
  };

  const handleDirectPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      error('ফাইলের সাইজ সর্বোচ্চ ২৫ MB হতে পারবে');
      return;
    }

    setPdfUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileData: base64,
              fileName: `${slug || 'job'}_circular_${file.name}`,
              folder: 'circulars',
              mimeType: file.type || 'application/pdf',
            }),
          });
          const data = await res.json();
          if (res.ok && data.success && data.url) {
            setCircularLink(data.url);
            success('সার্কুলার ফাইল সফলভাবে Cloudflare R2-তে আপলোড হয়েছে!');
          } else {
            error(data.error || 'ফাইল আপলোড ব্যর্থ হয়েছে');
          }
        } catch (err: any) {
          error(err?.message || 'আপলোড করতে সমস্যা হয়েছে');
        } finally {
          setPdfUploading(false);
          if (e.target) e.target.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setPdfUploading(false);
    }
  };

  const handleMultiImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingMultiImages(true);
    setMultiUploadProgress(`০/${files.length} ছবি আপলোড শুরু হচ্ছে...`);

    const driveActive = isDriveConnected();
    const newImageUrls: string[] = [];

    try {
      const smartMime = getBestSmartImageMimeType();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setMultiUploadProgress(`ছবি (${i + 1}/${files.length}) প্রসেস ও আপলোড হচ্ছে...`);

        if (driveActive) {
          const res = await uploadJobImageToDrive(
            file,
            `${slug || 'job'}_page_${circularImages.length + i + 1}_${file.name}`
          );
          newImageUrls.push(res.directImageUrl);
        } else {
          // Compress into ultra-crisp lightweight WebP (<180KB)
          const comp = await compressImageToDataUrl(file, 1400, 1900, 180 * 1024, smartMime);

          // Fast direct upload to Cloudflare R2
          try {
            const upRes = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileData: comp.dataUrl,
                fileName: `${slug || 'job'}_page_${circularImages.length + i + 1}_${file.name}`,
                folder: 'circulars',
                mimeType: smartMime,
              }),
            });
            const upData = await upRes.json();
            if (upRes.ok && upData.success && upData.url) {
              newImageUrls.push(upData.url);
            } else {
              newImageUrls.push(comp.dataUrl);
            }
          } catch {
            newImageUrls.push(comp.dataUrl);
          }
        }
      }

      setCircularImages((prev) => [...prev, ...newImageUrls]);
      success(`✨ এক সাথে ${files.length}টি ছবি ক্লাউডে সফলভাবে যুক্ত হয়েছে!`);
    } catch (err: any) {
      error(err.message || 'ছবি আপলোড করতে সমস্যা হয়েছে');
    } finally {
      setUploadingMultiImages(false);
      setMultiUploadProgress('');
      if (e.target) e.target.value = '';
    }
  };

  const handleInsertAllImagesToContent = () => {
    if (circularImages.length === 0) {
      error('প্রথমে এক বা একাধিক ছবি আপলোড করুন');
      return;
    }
    const htmlSnippets = circularImages
      .map((url, idx) => {
        return `<div style="text-align:center; margin:20px 0;">
  <img src="${url}" alt="${title || 'নিয়োগ বিজ্ঞপ্তি'} - পাতা ${idx + 1}" loading="lazy" decoding="async" style="max-width:100%; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.12); margin:0 auto; display:block;" />
  <p style="text-align:center; font-size:12px; color:#4b5563; margin-top:6px; font-weight:600;">[ পাতা ${idx + 1} ]</p>
</div>`;
      })
      .join('\n');

    setContent((prev) => (prev ? `${prev.trim()}\n\n${htmlSnippets}` : htmlSnippets));
    success(`সবগুলো (${circularImages.length}টি) ছবি মূল বিবরণীতে সাজিয়ে বসিয়ে দেওয়া হয়েছে!`);
  };

  const handleSetImageAsCover = (imgUrl: string) => {
    setCoverPreview(imgUrl);
    setHasCover(true);
    success('এই ছবিটি কভার ইমেজ হিসেবে সেট করা হয়েছে!');
  };

  const handleRemoveCircularImage = (idxToRemove: number) => {
    setCircularImages((prev) => prev.filter((_, idx) => idx !== idxToRemove));
    success('ছবি সরানো হয়েছে');
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
    success('স্বয়ংক্রিয় মেটা ডেসক্রিপশন তৈরি করা হয়েছে!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveTitle = (title || '').trim();
    if (!effectiveTitle) {
      error('বিজ্ঞপ্তির শিরোনাম পূরণ করুন');
      return;
    }
    const effectiveSlug = (slug || generateSlug(effectiveTitle) || `job-${Date.now()}`).trim();
    if (!slug) setSlug(effectiveSlug);

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
          if (Array.isArray(p.districts) && p.districts.length > 0) {
            item.districts = p.districts;
          }
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
      const nowIso = new Date().toISOString();

      const jobData: Record<string, any> = {
        id: jobId,
        title: effectiveTitle,
        slug: effectiveSlug,
        category: category || 'govt',
        status: status || 'published',
        content: content || '',
        deadline: deadlineDate ? deadlineDate.toISOString() : null,
        publishedAt: pubDate.toISOString(),
        applyLink: (applyLink || '').trim(),
        applyServiceEnabled: Boolean(applyServiceEnabled),
        applicationFee: Number(applicationFee) || 0,
        serviceCharge: Number(serviceCharge) || 0,
        hasCover: Boolean(hasCover),
        circularLink: (circularLink || '').trim() || null,
        circularImages: circularImages,
        posts: finalPosts,
        // SEO & Social Optimization
        seoTitle: (seoTitle || '').trim() || null,
        metaDescription: (metaDescription || '').trim() || null,
        focusKeyword: (focusKeyword || '').trim() || null,
        tags: tags.map((t) => t.trim()).filter(Boolean),
        photoSpec: { width: 300, height: 300, maxKB: 100 },
        signatureSpec: { width: 300, height: 80, maxKB: 60 },
        createdAt: nowIso, // সম্পাদনায় saveJobToWorker পুরনো createdAt বজায় রাখে
        updatedAt: nowIso,
      };

      // Worker-এ সেভ (R2 jobs.json ও feed.json আপডেট হবে)
      await saveJobToWorker(jobData);

      success(isEdit ? 'সার্কুলার আপডেট সম্পন্ন হয়েছে (R2 ক্লাউডে সংরক্ষিত)' : 'নতুন সার্কুলার প্রকাশ করা হয়েছে (R2 ক্লাউডে সংরক্ষিত)');

      invalidateCache('jobs_');
      invalidateCache('jobs_page');
      invalidateCache('feed_');
      invalidateCache('admin_jobs');

      navigate('/admin/jobs');
    } catch (err: any) {
      console.error('Job save error:', err);
      error(err?.message || 'সার্কুলার সেভ করতে ব্যর্থ হয়েছে');
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

      {/* AI Smart Autofill Card (Competitor Outranking & Full Generator) */}
      <div className="bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-900 text-white rounded-2xl p-5 shadow-xl border border-emerald-500/30 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-inner">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">✨ AI স্মার্ট সার্কুলার অটোফিল</h3>
                <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  SEO স্পেশালাইজড • প্রতিযোগী আউটর‍্যাঙ্ক
                </span>
              </div>
              <p className="text-xs text-emerald-200/80 mt-0.5">
                অন্য যেকোনো সাইটের লিংক দিন অথবা টেক্সট পেস্ট করুন—Gemini AI নিখুঁতভাবে টাইটেল, স্লাগ, মেটা ট্যাগ, পদসংখ্যা ও টেবিল সহ সকল ফিল্ড স্বয়ংক্রিয়ভাবে পূরণ করবে!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAiAutofillOpen(!aiAutofillOpen)}
            className="p-1.5 text-emerald-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title={aiAutofillOpen ? 'সংকোচন করুন' : 'প্রসারিত করুন'}
          >
            {aiAutofillOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {aiAutofillOpen && (
          <div className="space-y-3.5 pt-2 border-t border-white/10">
            {/* Error guidance banner */}
            {aiError && (
              <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <span className="font-semibold block text-white">{aiError}</span>
                  <p className="text-[11px] text-rose-300">
                    💡 <strong>সহজ সমাধান:</strong> সাইটটি হয়তো সরাসরি লিঙ্ক রিড করা ব্লক করেছে (Cloudflare/Anti-bot)। আপনি শুধু সেই পেজের টেক্সটগুলো কপি করে <strong>&quot;📝 টেক্সট পেস্ট করুন&quot;</strong> ট্যাবে পেস্ট করুন, AI মুহূর্তেই বাকি সব পূরণ করবে!
                  </p>
                </div>
              </div>
            )}

            {/* Mode switch */}
            <div className="inline-flex p-1 bg-black/40 rounded-xl border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setAiInputMode('url')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  aiInputMode === 'url'
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>🌐 ওয়েবসাইটের লিঙ্ক দিন</span>
              </button>
              <button
                type="button"
                onClick={() => setAiInputMode('text')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  aiInputMode === 'text'
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>📝 টেক্সট পেস্ট করুন</span>
              </button>
            </div>

            {/* Input fields */}
            {aiInputMode === 'url' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-emerald-200">
                  প্রতিযোগী বা অন্য কোনো জব সাইটের সার্কুলার লিঙ্ক (URL):
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute left-3.5 top-3 text-gray-400" />
                  <input
                    type="url"
                    value={aiSourceUrl}
                    onChange={(e) => setAiSourceUrl(e.target.value)}
                    placeholder="যেমন: https://example.com/job-circular-news-2026"
                    className="w-full pl-10 pr-4 py-2.5 bg-black/30 border border-emerald-500/40 rounded-xl text-white placeholder-gray-400 text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-emerald-200">
                  সার্কুলারের কাঁচা টেক্সট বা খসড়া বিবরণ:
                </label>
                <textarea
                  value={aiSourceText}
                  onChange={(e) => setAiSourceText(e.target.value)}
                  placeholder="বিজ্ঞপ্তির টেক্সট বা বিবরণ এখানে পেস্ট করুন..."
                  rows={3}
                  className="w-full p-3 bg-black/30 border border-emerald-500/40 rounded-xl text-white placeholder-gray-400 text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                />
              </div>
            )}

            {/* Submit action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-emerald-300/80 leading-relaxed">
                💡 <span className="font-semibold text-emerald-200">আউটর‍্যাঙ্ক গ্যারান্টি:</span> মূল তথ্যাদি হুবহু বজায় রেখে গুগলের চোখে ইউনিক ও প্রিমিয়াম করার জন্য স্বয়ংক্রিয়ভাবে টেবিল, হেডিং এবং হাই-সিপিআর মেটা ট্যাগ তৈরি হবে।
              </p>

              <button
                type="button"
                onClick={handleAiAutofill}
                disabled={aiExtracting}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-60 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                {aiExtracting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Gemini AI বিশ্লেষণ ও ফিল্ড পূরণ করছে...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 text-slate-950" />
                    <span>✨ সকল ফিল্ড অটোফিল করুন</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
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
              { value: 'draft', label: 'Draft (খসড়া)' },
              { value: 'scheduled', label: 'Scheduled (নির্ধারিত সময়ে)' },
            ]}
          />
        </div>

        {status === 'scheduled' && (
          <Input label="প্রকাশের সময়সূচী" type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} requiredStar />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="আবেদনের শেষ তারিখ ও সময়" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} requiredStar />
          <Input label="অফিসিয়াল Teletalk আবেদন লিংক" placeholder="http://br.teletalk.com.bd" value={applyLink} onChange={(e) => setApplyLink(e.target.value)} />
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
                  💡 প্রতিটি ভিন্ন ভিন্ন পদের সরকারি ফি&apos;র সাথে এই <strong>{serviceCharge || 10} টাকা</strong> যোগ হয়ে মোট ফি নির্ধারিত হবে।
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
                  নিচের &ldquo;পদের তালিকা&rdquo; সেকশনে প্রতিটি পদের নির্দিষ্ট সরকারি ফি দিলে স্বয়ংক্রিয়ভাবে সেটাই কার্যকর হবে।
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
          কভার ইমেজ ও সার্কুলার লিংক
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
                সার্কুলার ফাইল লিংক (Cloudflare R2, Google Drive বা অফিসিয়াল লিংক)
              </label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold cursor-pointer hover:bg-blue-100 border border-blue-200 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{pdfUploading ? 'R2 আপলোড হচ্ছে...' : 'R2 ক্লাউডে PDF আপলোড'}</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleDirectPdfUpload}
                    className="hidden"
                    disabled={pdfUploading}
                  />
                </label>
                <DrivePickerButton
                  acceptMime="pdf"
                  label="গুগল ড্রাইভ"
                  onSelectDriveUrl={(url) => setCircularLink(url)}
                />
              </div>
            </div>
            <Input
              label=""
              placeholder="https://pub-...r2.dev/... অথবা https://drive.google.com/... অথবা অফিসিয়াল লিংক"
              value={circularLink}
              onChange={(e) => setCircularLink(e.target.value)}
              helperText="সার্কুলার PDF সরাসরি Cloudflare R2 ক্লাউডে আপলোড করতে পারেন অথবা ড্রাইভ/অফিসিয়াল লিংক পেস্ট করতে পারেন"
            />
          </div>
        </div>
      </div>

      {/* Multi-Image Upload Section (বিজ্ঞপ্তিতে এক সাথে একাধিক ছবি আপলোড) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 shadow-xs">
        <div className="border-b border-gray-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                বিজ্ঞপ্তির মূল পাতা / একাধিক ছবি এক সাথে আপলোড (Multi-Image Upload)
              </h3>
              <p className="text-xs text-gray-500">
                পত্রিকা বা সরকারি বিজ্ঞপ্তির একাধিক পাতা থাকলে এক সাথে সব ছবি সিলেক্ট করে আপলোড করুন
              </p>
            </div>
          </div>

          {circularImages.length > 0 && (
            <span className="self-start sm:self-auto px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>মোট {circularImages.length}টি পাতা যুক্ত আছে</span>
            </span>
          )}
        </div>

        {/* Upload Action Box */}
        <div className="border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-2xl p-5 text-center transition-colors bg-gray-50/50 hover:bg-emerald-50/20">
          <label className="cursor-pointer block">
            <div className="mx-auto w-11 h-11 bg-white rounded-full border border-gray-200 flex items-center justify-center text-emerald-600 mb-2 shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-gray-800 block">
              {uploadingMultiImages ? multiUploadProgress : 'এক সাথে একাধিক ছবি / পাতা নির্বাচন করুন'}
            </span>
            <span className="text-xs text-gray-500 mt-1 block">
              কম্পিউটার বা মোবাইল থেকে এক সাথে ১, ২, ৫ বা ততোধিক ছবি সিলেক্ট করুন (JPG, PNG, WebP)
            </span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleMultiImagesUpload}
              className="hidden"
              disabled={uploadingMultiImages}
            />
          </label>
        </div>

        {/* Uploaded Images Gallery & Batch Controls */}
        {circularImages.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
              <span className="text-xs text-emerald-900 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                <span>বিজ্ঞপ্তির পাতাসমূহ ({circularImages.length}টি পাতা সংরক্ষিত):</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInsertAllImagesToContent}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
                  title="সবগুলো ছবি সিরিয়ালে মূল বিবরণী বক্সে যুক্ত করুন"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>মূল বিবরণীতে (Content) বসান</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCircularImages([])}
                  className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors"
                >
                  সব মুছুন
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {circularImages.map((imgUrl, idx) => (
                <div
                  key={idx}
                  className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs hover:border-emerald-500 transition-all flex flex-col"
                >
                  <div className="relative aspect-3/4 max-h-48 bg-gray-100 overflow-hidden flex items-center justify-center">
                    <img
                      src={imgUrl}
                      alt={`Circular Page ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                    />
                    <span className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded">
                      পাতা {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCircularImage(idx)}
                      className="absolute top-1.5 right-1.5 p-1 bg-rose-600/90 hover:bg-rose-600 text-white rounded-md transition-colors shadow-xs"
                      title="এই ছবিটি মুছে ফেলুন"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleSetImageAsCover(imgUrl)}
                      className="text-emerald-700 hover:underline font-semibold"
                    >
                      কভার করুন
                    </button>
                    <a
                      href={imgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-800"
                    >
                      বড় করুন ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
                গুগল সার্চ ও সোশ্যাল মিডিয়ায় পোস্ট ১ নম্বরে র‍্যাংক করানোর জন্য মেটা ট্যাগ, কিওয়ার্ড ও ডেসক্রিপশন সেট করুন
              </p>
            </div>
          </div>
        </div>

        {/* 1. Focus Keyword with Real-Time SEO Audit */}
        <div className="space-y-3 bg-emerald-50/40 p-4 rounded-xl border border-emerald-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-800">
                মূল ফোকাস কিওয়ার্ড (Focus Keyword)
              </label>
              <span className="text-[11px] text-gray-500">
                যে কথাটি দিয়ে মানুষ গুগলে খুঁজবে (যেমন: &ldquo;বাংলাদেশ রেলওয়ে নিয়োগ বিজ্ঞপ্তি&rdquo; বা &ldquo;পল্লী বিদ্যুৎ সার্কুলার&rdquo;)
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
              placeholder={title || 'গুগলে প্রদর্শিত আকর্ষণীয় শিরোনাম লিখুন...'}
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              helperText="খালি রাখলে স্বয়ংক্রিয়ভাবে মূল শিরোনাম ব্যবহৃত হবে।"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div>
                <label className="block text-xs font-bold text-gray-800">
                  মেটা ডেসক্রিপশন (Meta Description)
                </label>
                <span className="text-[11px] text-gray-500">
                  গুগল সার্চ ফলাফলে শিরোনামের নিচে এই ১-২ লাইনের বিবরণটি প্রদর্শিত হয়
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateMetaDescription}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                  title="টাইটেল ও সার্কুলারের ডাটা দিয়ে স্বয়ংক্রিয়ভাবে মেটা ডেসক্রিপশন তৈরি করুন"
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
            ট্যাগ ও কীওয়ার্ডসমূহ (Tags / Keywords)
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
            <span className="text-[11px] text-gray-500 font-medium">জনপ্রিয় সাজেশন:</span>
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
                'চাকরির নিয়োগ বিজ্ঞপ্তি প্রকাশ হয়েছে। পদের বিবরণ, শিক্ষাগত যোগ্যতা ও শর্তাবলী জেনে সহজে অনলাইনে আবেদন করুন।'}
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};
