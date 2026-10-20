import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchMyProfileWithMigration } from '../../services/profileStore';
import { db } from '../../services/firebase';
import { fetchJobsList } from '../../services/jobsStore';
import { JobCircular, CandidateProfile } from '../../types';
import { calculateCVCompleteness } from '../../utils/cvValidation';
import { isValidMobile } from '../../utils/auth';
import { generateApplicationId } from '../../utils/idGenerator';
import { IncompleteCVAlert } from '../../components/apply/IncompleteCVAlert';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Spinner } from '../../components/common/Spinner';
import { AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';

export const ApplyJobPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const { user, mobile } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobCircular | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedPostName, setSelectedPostName] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [smsNumber, setSmsNumber] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!jobId || !user) return;

    const fetchData = async () => {
      try {
        // জব এখন R2 থেকে (Firestore 'jobs' নয়)। আইডি বা স্লাগ দিয়ে খোঁজা হয়।
        const list = await fetchJobsList();
        const found = list.find((j: any) => j.id === jobId || j.slug === jobId);
        if (found) {
          setJob(found as JobCircular);
        }

        // প্রোফাইল এখনো Firestore-এ (সিভি পেজ স্থানান্তরের পরে এটিও বদলাবে)
        const profData = (await fetchMyProfileWithMigration(user.uid)) as CandidateProfile | null;
        if (profData) {
          setProfile(profData);
          setSmsNumber(profData.data?.mobile || mobile || '');

          if (profData.data?.masExam) setEducationLevel('স্নাতকোত্তর / সমমান');
          else if (profData.data?.graExam) setEducationLevel('স্নাতক / সমমান');
          else if (profData.data?.hscExam) setEducationLevel('HSC / সমমান');
          else if (profData.data?.sscExam) setEducationLevel('SSC / সমমান');
        }
      } catch (err) {
        // Handled silently
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [jobId, user, mobile]);

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" text="আবেদন ফরম প্রস্তুত হচ্ছে..." />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-xl border border-gray-200 text-center space-y-4">
        <p className="text-sm font-semibold text-gray-800">চাকরির বিজ্ঞপ্তিটি পাওয়া যায়নি।</p>
        <Link to="/jobs">
          <Button variant="outline" size="sm">সকল চাকরি দেখুন</Button>
        </Link>
      </div>
    );
  }

  const completeness = profile?.data
    ? calculateCVCompleteness(
        profile.data,
        Boolean(profile.hasPhoto || profile.photoUrl || profile.photoPath),
        Boolean(profile.hasSignature || profile.signatureUrl || profile.signaturePath)
      )
    : { percentage: 0, missingFields: ['সম্পূর্ণ সিভি'] };

  if (completeness.percentage < 100) {
    return <IncompleteCVAlert completeness={completeness} jobSlugOrId={job.slug || job.id} />;
  }

  const candidateDistrict = profile?.data?.permanentDistrict || '';

  const availableEducation: string[] = [];
  if (profile?.data?.sscExam) availableEducation.push('SSC / সমমান');
  if (profile?.data?.hscExam) availableEducation.push('HSC / সমমান');
  if (profile?.data?.graExam) availableEducation.push('স্নাতক / সমমান');
  if (profile?.data?.masExam) availableEducation.push('স্নাতকোত্তর / সমমান');

  const selectedPostObj = job.posts?.find((p) => p.name === selectedPostName);

  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!selectedPostName) {
      setLocalError('অনুগ্রহ করে একটি পদ নির্বাচন করুন');
      return;
    }
    if (!educationLevel) {
      setLocalError('সর্বশেষ শিক্ষাগত যোগ্যতা নির্বাচন করুন');
      return;
    }
    if (!isValidMobile(smsNumber)) {
      setLocalError('১১ ডিজিটের সঠিক মোবাইল নম্বর দিন');
      return;
    }
    if (!termsAccepted) {
      setLocalError('শর্তাবলীতে সম্মতি প্রদান করুন');
      return;
    }

    setSubmitting(true);
    try {
      // ডুপ্লিকেট চেক। ব্যর্থ হলে (যেমন Firestore সীমা শেষ) আবেদন আটকাবে না।
      let existing: any = { empty: true };
      try {
        const q = query(
          collection(db, 'applications'),
          where('uid', '==', user?.uid),
          where('jobId', '==', job.id),
          where('postName', '==', selectedPostName)
        );
        existing = await getDocs(q);
      } catch (dupErr) {
        console.warn('Duplicate check skipped:', dupErr);
      }
      if (!existing.empty) {
        setLocalError('আপনি ইতিপূর্বেই এই সার্কুলারের নির্বাচিত পদে আবেদন করেছেন!');
        setSubmitting(false);
        return;
      }

      const appId = await generateApplicationId();
      const appFee =
        selectedPostObj?.applicationFee != null && !isNaN(selectedPostObj.applicationFee) && selectedPostObj.applicationFee >= 0
          ? selectedPostObj.applicationFee
          : (job.applicationFee || 0);

      const sCharge =
        selectedPostObj?.serviceCharge != null && !isNaN(selectedPostObj.serviceCharge) && selectedPostObj.serviceCharge >= 0
          ? selectedPostObj.serviceCharge
          : (job.serviceCharge != null && !isNaN(job.serviceCharge) ? job.serviceCharge : 10);

      const totalFee = appFee + sCharge;

      navigate(`/apply/${job.id}/payment`, {
        state: {
          appId,
          jobId: job.id,
          jobTitle: job.title,
          applyLink: job.applyLink || '',
          postName: selectedPostName,
          postCount: selectedPostObj?.count || 1,
          district: candidateDistrict,
          educationLevel,
          smsNumber,
          fullName: profile?.data?.fullName || '',
          fee: {
            applicationFee: appFee,
            serviceCharge: sCharge,
            total: totalFee,
          },
        },
      });
    } catch (err: any) {
      setLocalError('আবেদন প্রস্তুত করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <Link to={`/jobs/${job.slug || job.id}`} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-700">
        <ArrowLeft className="w-4 h-4" />
        <span>বিজ্ঞপ্তিতে ফিরুন</span>
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-xs space-y-6">
        <div>
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
            ধাপ ১: পদ ও তথ্য নির্বাচন
          </span>
          <h1 className="text-lg md:text-xl font-bold text-gray-900">{job.title}</h1>
          <p className="text-xs text-gray-500 mt-1">
            আপনার সংরক্ষিত জীবনবৃত্তান্ত থেকে তথ্য স্বয়ংক্রিয়ভাবে যুক্ত করা হবে।
          </p>
        </div>

        {localError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{localError}</span>
          </div>
        )}

        <form onSubmit={handleProceedToPayment} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-800 mb-1">
              আবেদনের পদ নির্বাচন করুন <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedPostName}
              onChange={(e) => setSelectedPostName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
              required
            >
              <option value="">-- পদ নির্বাচন করুন --</option>
              {job.posts?.map((p, idx) => {
                // Check eligibility for single or multiple allowed districts
                const isEligible = (() => {
                  if (!candidateDistrict) return true;
                  if (p.district === 'ALL' || (Array.isArray(p.districts) && p.districts.includes('ALL'))) return true;

                  const target = candidateDistrict.trim().toLowerCase();

                  // 1. Array check
                  if (Array.isArray(p.districts) && p.districts.length > 0) {
                    return p.districts.some((d: string) => {
                      const norm = d.trim().toLowerCase();
                      return norm === target || target.includes(norm) || norm.includes(target);
                    });
                  }

                  // 2. Comma or slash separated string check
                  if (p.district) {
                    const splitList = p.district.split(/[,/|]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean);
                    if (splitList.includes('all') || splitList.includes('সারাদেশ')) return true;
                    return splitList.some((d: string) => d === target || target.includes(d) || d.includes(target));
                  }

                  return true;
                })();

                const districtDisplay =
                  p.district === 'ALL' || (Array.isArray(p.districts) && p.districts.includes('ALL'))
                    ? 'সারাদেশ'
                    : Array.isArray(p.districts) && p.districts.length > 0
                    ? `জেলা: ${p.districts.join(', ')}`
                    : `জেলা: ${p.district}`;

                return (
                  <option key={idx} value={p.name} disabled={!isEligible}>
                    {p.name} ({p.count} জন) - {districtDisplay}
                    {!isEligible ? ' [আপনার স্থায়ী জেলার জন্য প্রযোজ্য নয়]' : ''}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              আপনার স্থায়ী জেলা: <strong>{candidateDistrict}</strong>। শুধুমাত্র অনুমোদিত পদেই আবেদন করতে পারবেন।
            </p>

            {selectedPostObj && (() => {
              const postAppFee = selectedPostObj.applicationFee != null && !isNaN(selectedPostObj.applicationFee) ? selectedPostObj.applicationFee : (job.applicationFee || 0);
              const postServiceCharge = selectedPostObj.serviceCharge != null && !isNaN(selectedPostObj.serviceCharge) ? selectedPostObj.serviceCharge : (job.serviceCharge != null && !isNaN(job.serviceCharge) ? job.serviceCharge : 10);
              const postTotal = postAppFee + postServiceCharge;

              return (
                <div className="mt-2.5 p-3 bg-emerald-50/90 border border-emerald-200 rounded-xl text-xs space-y-1">
                  <div className="font-bold text-emerald-900 flex items-center justify-between">
                    <span>নির্বাচিত পদের ফি বিবরণী:</span>
                    <span className="text-sm font-extrabold text-emerald-800">
                      মোট: ৳{postTotal}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-emerald-700 text-[11px] pt-0.5">
                    <span>টেলিটক/সরকারি ফি: <strong>৳{postAppFee}</strong></span>
                    <span>আমাদের সার্ভিস চার্জ: <strong>৳{postServiceCharge}</strong></span>
                  </div>
                </div>
              );
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchMyProfileWithMigration } from '../../services/profileStore';
import { fetchJobsList } from '../../services/jobsStore';
import { fetchUserApplications } from '../../services/applicationsService';
import { JobCircular, CandidateProfile } from '../../types';
import { calculateCVCompleteness } from '../../utils/cvValidation';
import { isValidMobile } from '../../utils/auth';
import { IncompleteCVAlert } from '../../components/apply/IncompleteCVAlert';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Spinner } from '../../components/common/Spinner';
import { AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';

export const ApplyJobPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const { user, mobile } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobCircular | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedPostName, setSelectedPostName] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [smsNumber, setSmsNumber] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!jobId || !user) return;

    const fetchData = async () => {
      try {
        // জব R2 থেকে (আইডি বা স্লাগ দিয়ে খোঁজা হয়)
        const list = await fetchJobsList();
        const found = list.find((j: any) => j.id === jobId || j.slug === jobId);
        if (found) {
          setJob(found as JobCircular);
        }

        // প্রোফাইল: R2 থেকে (না থাকলে পুরনো Firestore থেকে একবার স্থানান্তর)
        const profData = (await fetchMyProfileWithMigration(user.uid)) as CandidateProfile | null;
        if (profData) {
          setProfile(profData);
          setSmsNumber(profData.data?.mobile || mobile || '');

          if (profData.data?.masExam) setEducationLevel('স্নাতকোত্তর / সমমান');
          else if (profData.data?.graExam) setEducationLevel('স্নাতক / সমমান');
          else if (profData.data?.hscExam) setEducationLevel('HSC / সমমান');
          else if (profData.data?.sscExam) setEducationLevel('SSC / সমমান');
        }
      } catch (err) {
        console.warn('Apply page load failed:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [jobId, user, mobile]);

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" text="আবেদন ফরম প্রস্তুত হচ্ছে..." />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-xl border border-gray-200 text-center space-y-4">
        <p className="text-sm font-semibold text-gray-800">চাকরির বিজ্ঞপ্তিটি পাওয়া যায়নি।</p>
        <Link to="/jobs">
          <Button variant="outline" size="sm">সকল চাকরি দেখুন</Button>
        </Link>
      </div>
    );
  }

  const completeness = profile?.data
    ? calculateCVCompleteness(
        profile.data,
        Boolean(profile.hasPhoto || profile.photoUrl || profile.photoPath),
        Boolean(profile.hasSignature || profile.signatureUrl || profile.signaturePath)
      )
    : { percentage: 0, missingFields: ['সম্পূর্ণ সিভি'] };

  if (completeness.percentage < 100) {
    return <IncompleteCVAlert completeness={completeness} jobSlugOrId={job.slug || job.id} />;
  }

  const candidateDistrict = profile?.data?.permanentDistrict || '';

  const availableEducation: string[] = [];
  if (profile?.data?.sscExam) availableEducation.push('SSC / সমমান');
  if (profile?.data?.hscExam) availableEducation.push('HSC / সমমান');
  if (profile?.data?.graExam) availableEducation.push('স্নাতক / সমমান');
  if (profile?.data?.masExam) availableEducation.push('স্নাতকোত্তর / সমমান');

  const selectedPostObj = job.posts?.find((p) => p.name === selectedPostName);

  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!selectedPostName) {
      setLocalError('অনুগ্রহ করে একটি পদ নির্বাচন করুন');
      return;
    }
    if (!educationLevel) {
      setLocalError('সর্বশেষ শিক্ষাগত যোগ্যতা নির্বাচন করুন');
      return;
    }
    if (!isValidMobile(smsNumber)) {
      setLocalError('১১ ডিজিটের সঠিক মোবাইল নম্বর দিন');
      return;
    }
    if (!termsAccepted) {
      setLocalError('শর্তাবলীতে সম্মতি প্রদান করুন');
      return;
    }

    setSubmitting(true);
    try {
      // ডুপ্লিকেট চেক: D1 থেকে নিজের আবেদন দেখে (Firestore নয়)।
      // সার্ভারও একই নিয়ম জোর করে, তাই এখানের ব্যর্থতা আবেদন আটকাবে না।
      try {
        const mine = await fetchUserApplications();
        const sameJob = mine.filter((a: any) => a.jobId === job.id);
        if (!(job as any).allowMultiplePosts && sameJob.length > 0) {
          setLocalError('এই সার্কুলারে ইতিপূর্বে আপনি আবেদন করেছেন।');
          setSubmitting(false);
          return;
        }
        if (sameJob.some((a: any) => a.postName === selectedPostName)) {
          setLocalError('আপনি ইতিপূর্বেই এই সার্কুলারের নির্বাচিত পদে আবেদন করেছেন!');
          setSubmitting(false);
          return;
        }
      } catch (dupErr) {
        console.warn('Duplicate check skipped:', dupErr);
      }

      // আবেদন নম্বর সার্ভার (D1) তৈরি করে; এখানে অস্থায়ী আইডি
      const appId = `TMP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

      const appFee =
        selectedPostObj?.applicationFee != null && !isNaN(selectedPostObj.applicationFee) && selectedPostObj.applicationFee >= 0
          ? selectedPostObj.applicationFee
          : (job.applicationFee || 0);

      const sCharge =
        selectedPostObj?.serviceCharge != null && !isNaN(selectedPostObj.serviceCharge) && selectedPostObj.serviceCharge >= 0
          ? selectedPostObj.serviceCharge
          : (job.serviceCharge != null && !isNaN(job.serviceCharge) ? job.serviceCharge : 10);

      const totalFee = appFee + sCharge;

      navigate(`/apply/${job.id}/payment`, {
        state: {
          appId,
          jobId: job.id,
          jobTitle: job.title,
          applyLink: job.applyLink || '',
          postName: selectedPostName,
          postCount: selectedPostObj?.count || 1,
          district: candidateDistrict,
          educationLevel,
          smsNumber,
          fullName: profile?.data?.fullName || '',
          fee: {
            applicationFee: appFee,
            serviceCharge: sCharge,
            total: totalFee,
          },
        },
      });
    } catch (err: any) {
      console.error('Apply prepare failed:', err);
      setLocalError('আবেদন প্রস্তুত করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <Link to={`/jobs/${job.slug || job.id}`} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-700">
        <ArrowLeft className="w-4 h-4" />
        <span>বিজ্ঞপ্তিতে ফিরুন</span>
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-xs space-y-6">
        <div>
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
            ধাপ ১: পদ ও তথ্য নির্বাচন
          </span>
          <h1 className="text-lg md:text-xl font-bold text-gray-900">{job.title}</h1>
          <p className="text-xs text-gray-500 mt-1">
            আপনার সংরক্ষিত জীবনবৃত্তান্ত থেকে তথ্য স্বয়ংক্রিয়ভাবে যুক্ত করা হবে।
          </p>
        </div>

        {localError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{localError}</span>
          </div>
        )}

        <form onSubmit={handleProceedToPayment} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-800 mb-1">
              আবেদনের পদ নির্বাচন করুন <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedPostName}
              onChange={(e) => setSelectedPostName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-600"
              required
            >
              <option value="">-- পদ নির্বাচন করুন --</option>
              {job.posts?.map((p, idx) => {
                // একাধিক জেলা/সারাদেশ সমর্থন সহ যোগ্যতা যাচাই
                const isEligible = (() => {
                  if (!candidateDistrict) return true;
                  if (p.district === 'ALL' || (Array.isArray(p.districts) && p.districts.includes('ALL'))) return true;

                  const target = candidateDistrict.trim().toLowerCase();

                  if (Array.isArray(p.districts) && p.districts.length > 0) {
                    return p.districts.some((d: string) => {
                      const norm = d.trim().toLowerCase();
                      return norm === target || target.includes(norm) || norm.includes(target);
                    });
                  }

                  if (p.district) {
                    const splitList = p.district.split(/[,/|]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean);
                    if (splitList.includes('all') || splitList.includes('সারাদেশ')) return true;
                    return splitList.some((d: string) => d === target || target.includes(d) || d.includes(target));
                  }

                  return true;
                })();

                const districtDisplay =
                  p.district === 'ALL' || (Array.isArray(p.districts) && p.districts.includes('ALL'))
                    ? 'সারাদেশ'
                    : Array.isArray(p.districts) && p.districts.length > 0
                    ? `জেলা: ${p.districts.join(', ')}`
                    : `জেলা: ${p.district}`;

                return (
                  <option key={idx} value={p.name} disabled={!isEligible}>
                    {p.name} ({p.count} জন) - {districtDisplay}
                    {!isEligible ? ' [আপনার স্থায়ী জেলার জন্য প্রযোজ্য নয়]' : ''}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              আপনার স্থায়ী জেলা: <strong>{candidateDistrict}</strong>। শুধুমাত্র অনুমোদিত পদেই আবেদন করতে পারবেন।
            </p>

            {selectedPostObj && (() => {
              const postAppFee = selectedPostObj.applicationFee != null && !isNaN(selectedPostObj.applicationFee) ? selectedPostObj.applicationFee : (job.applicationFee || 0);
              const postServiceCharge = selectedPostObj.serviceCharge != null && !isNaN(selectedPostObj.serviceCharge) ? selectedPostObj.serviceCharge : (job.serviceCharge != null && !isNaN(job.serviceCharge) ? job.serviceCharge : 10);
              const postTotal = postAppFee + postServiceCharge;

              return (
                <div className="mt-2.5 p-3 bg-emerald-50/90 border border-emerald-200 rounded-xl text-xs space-y-1">
                  <div className="font-bold text-emerald-900 flex items-center justify-between">
                    <span>নির্বাচিত পদের ফি বিবরণী:</span>
                    <span className="text-sm font-extrabold text-emerald-800">মোট: ৳{postTotal}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-emerald-700 text-[11px] pt-0.5">
                    <span>টেলিটক/সরকারি ফি: <strong>৳{postAppFee}</strong></span>
                    <span>আমাদের সার্ভিস চার্জ: <strong>৳{postServiceCharge}</strong></span>
                  </div>
                </div>
              );
            })()}
          </div>

          <Select
            label="সর্বশেষ শিক্ষাগত যোগ্যতা"
            value={educationLevel}
            onChange={(e) => setEducationLevel(e.target.value)}
            options={availableEducation.map((edu) => ({ value: edu, label: edu }))}
            requiredStar
          />

          <Input
            label="এসএমএস নোটিফিকেশন মোবাইল নম্বর"
            placeholder="017XXXXXXXX"
            value={smsNumber}
            onChange={(e) => setSmsNumber(e.target.value.replace(/\D/g, ''))}
            maxLength={11}
            requiredStar
            helperText="টেলিটক পেমেন্ট ও এডমিট কার্ডের এসএমএস এই নম্বরে পাঠানো হবে"
          />

          {/* নির্বাচিত পদ অনুযায়ী মোট ফি */}
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-emerald-900 block text-sm">মোট প্রদেয় ফি:</span>
              <span className="text-emerald-800 text-xs">
                {selectedPostObj ? (
                  <>
                    পদ: <strong>{selectedPostObj.name}</strong> (টেলিটক ফি: ৳
                    {selectedPostObj.applicationFee != null && !isNaN(selectedPostObj.applicationFee)
                      ? selectedPostObj.applicationFee
                      : (job.applicationFee || 0)}{' '}
                    + সার্ভিস চার্জ: ৳
                    {selectedPostObj.serviceCharge != null && !isNaN(selectedPostObj.serviceCharge)
                      ? selectedPostObj.serviceCharge
                      : (job.serviceCharge != null && !isNaN(job.serviceCharge) ? job.serviceCharge : 10)}
                    )
                  </>
                ) : (
                  <>পদ নির্বাচন করলে সঠিক ফি প্রদর্শিত হবে (সার্ভিস চার্জ: ৳{job.serviceCharge != null ? job.serviceCharge : 10})</>
                )}
              </span>
            </div>
            <div className="text-xl font-extrabold text-emerald-900">
              {(() => {
                const curAppFee =
                  selectedPostObj?.applicationFee != null && !isNaN(selectedPostObj.applicationFee)
                    ? selectedPostObj.applicationFee
                    : (job.applicationFee || 0);
                const curServiceCharge =
                  selectedPostObj?.serviceCharge != null && !isNaN(selectedPostObj.serviceCharge)
                    ? selectedPostObj.serviceCharge
                    : (job.serviceCharge != null && !isNaN(job.serviceCharge) ? job.serviceCharge : 10);
                return `৳${curAppFee + curServiceCharge}`;
              })()}
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-700 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded mt-0.5"
            />
            <span className="leading-snug">
              আমি চাকরির সার্কুলারের সকল শর্তাবলী পড়েছি এবং আমার দেওয়া সকল তথ্য সত্য ও নির্ভুল। আমি আবেদনটি প্রস্তুত করতে সম্মতি প্রদান করছি।
            </span>
          </label>

          <Button type="submit" className="w-full" loading={submitting} icon={<ArrowRight className="w-4 h-4" />}>
            পেমেন্ট ও ভেরিফিকেশনে এগিয়ে যান
          </Button>
        </form>
      </div>
    </div>
  );
};
