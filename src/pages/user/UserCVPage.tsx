import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getFile, deleteFile, getFileId } from '../../services/files';
import { fetchMyProfileWithMigration, saveMyProfile, deleteMyProfile } from '../../services/profileStore';
import { CandidateProfile, ProfileData } from '../../types';
import { PersonalInfoSection } from '../../components/cv/PersonalInfoSection';
import { IdentitySection } from '../../components/cv/IdentitySection';
import { ContactAddressSection } from '../../components/cv/ContactAddressSection';
import { EducationSection } from '../../components/cv/EducationSection';
import { ExperienceSection } from '../../components/cv/ExperienceSection';
import { MediaUploadSection } from '../../components/cv/MediaUploadSection';
import { CVHeaderCard } from '../../components/cv/CVHeaderCard';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Spinner } from '../../components/common/Spinner';
import { useToast } from '../../components/common/Toast';
import { invalidateCache } from '../../services/cache';
import { calculateCVCompleteness, generateDegreeString } from '../../utils/cvValidation';
import { Save, AlertTriangle, ShieldCheck } from 'lucide-react';

export const UserCVPage: React.FC = () => {
  const { user, mobile } = useAuth();
  const [formData, setFormData] = useState<Partial<ProfileData>>({});
  const [hasPhoto, setHasPhoto] = useState<boolean>(false);
  const [hasSignature, setHasSignature] = useState<boolean>(false);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [signatureUrl, setSignatureUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      try {
        const profile = (await fetchMyProfileWithMigration(user.uid)) as CandidateProfile | null;

        if (profile) {
          setFormData(profile.data || {});
          const hasP = Boolean(profile.hasPhoto || profile.photoPath || profile.photoUrl);
          const hasS = Boolean(profile.hasSignature || profile.signaturePath || profile.signatureUrl);
          setHasPhoto(hasP);
          setHasSignature(hasS);

          if (profile.photoUrl) {
            setPhotoUrl(profile.photoUrl);
          } else if (hasP) {
            try {
              const fileDoc = await getFile(getFileId.photo(user.uid));
              if (fileDoc?.data) {
                setPhotoUrl(fileDoc.data);
              }
            } catch (e) {
              // Ignore fallback warning
            }
          }

          if (profile.signatureUrl) {
            setSignatureUrl(profile.signatureUrl);
          } else if (hasS) {
            try {
              const fileDoc = await getFile(getFileId.signature(user.uid));
              if (fileDoc?.data) {
                setSignatureUrl(fileDoc.data);
              }
            } catch (e) {
              // Ignore fallback warning
            }
          }
        } else {
          setFormData({
            mobile: mobile || '',
            mobileConfirm: mobile || '',
            nationality: 'Bangladeshi',
            nidType: 'Yes',
            quota: 'Non Quota',
          });
        }
      } catch (err) {
        // Handled silently
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user, mobile]);

  const handleFieldChange = (field: keyof ProfileData, val: any) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleMultipleChange = (updates: Partial<ProfileData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const completeness = calculateCVCompleteness(formData, Boolean(photoUrl), Boolean(signatureUrl));

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const bachelorString = generateDegreeString(
        formData.graExam,
        formData.graSubject,
        formData.graInstitute,
        formData.graYear,
        formData.graResult
      );

      const masterString = generateDegreeString(
        formData.masExam,
        formData.masSubject,
        formData.masInstitute,
        formData.masYear,
        formData.masResult
      );

      const finalData: ProfileData = {
        name: formData.fullName || '',
        fullName: formData.fullName || '',
        nameBn: formData.nameBn || '',
        fatherName: formData.fatherName || '',
        fatherBn: formData.fatherBn || '',
        motherName: formData.motherName || '',
        motherBn: formData.motherBn || '',
        dateOfBirth: formData.dateOfBirth || '',
        gender: formData.gender || '',
        nationality: formData.nationality || 'Bangladeshi',
        religion: formData.religion || '',
        maritalStatus: formData.maritalStatus || '',
        spouseName: formData.spouseName || '',
        bloodGroup: formData.bloodGroup || '',
        nidType: formData.nidType || 'Yes',
        nidNo: formData.nidNo || '',
        birthRegNo: formData.birthRegNo || '',
        passportNo: formData.passportNo || '',
        mobile: formData.mobile || '',
        mobileConfirm: formData.mobileConfirm || '',
        email: formData.email || '',
        quota: formData.quota || 'Non Quota',
        quotaDetails: formData.quotaDetails || '',
        depStatus: formData.depStatus || '',
        presentCareOf: formData.presentCareOf || '',
        presentAddress: formData.presentAddress || '',
        presentDistrict: formData.presentDistrict || '',
        presentUpazila: formData.presentUpazila || '',
        presentPost: formData.presentPost || '',
        presentPostcode: formData.presentPostcode || '',
        permanentCareOf: formData.permanentCareOf || '',
        permanentAddress: formData.permanentAddress || '',
        permanentDistrict: formData.permanentDistrict || '',
        permanentUpazila: formData.permanentUpazila || '',
        permanentPost: formData.permanentPost || '',
        permanentPostcode: formData.permanentPostcode || '',
        sameAsPresent: Boolean(formData.sameAsPresent),
        fatherOccupation: formData.fatherOccupation || '',
        sscExam: formData.sscExam || '',
        sscRoll: formData.sscRoll || '',
        sscGroup: formData.sscGroup || '',
        sscGroupOther: formData.sscGroupOther || '',
        sscBoard: formData.sscBoard || '',
        sscBoardOther: formData.sscBoardOther || '',
        sscResultType: formData.sscResultType || '',
        sscResult: formData.sscResult || '',
        sscYear: formData.sscYear || '',
        hscExam: formData.hscExam || '',
        hscRoll: formData.hscRoll || '',
        hscGroup: formData.hscGroup || '',
        hscGroupOther: formData.hscGroupOther || '',
        hscBoard: formData.hscBoard || '',
        hscBoardOther: formData.hscBoardOther || '',
        hscResultType: formData.hscResultType || '',
        hscResult: formData.hscResult || '',
        hscYear: formData.hscYear || '',
        graExam: formData.graExam || '',
        graInstitute: formData.graInstitute || '',
        graSubject: formData.graSubject || '',
        graResultType: formData.graResultType || '',
        graResult: formData.graResult || '',
        graYear: formData.graYear || '',
        graDuration: formData.graDuration || '',
        masExam: formData.masExam || '',
        masInstitute: formData.masInstitute || '',
        masSubject: formData.masSubject || '',
        masResultType: formData.masResultType || '',
        masResult: formData.masResult || '',
        masYear: formData.masYear || '',
        masDuration: formData.masDuration || '',
        bachelor: Boolean(formData.graExam || formData.graInstitute) ? 'Yes' : (formData.bachelor || ''),
        master: Boolean(formData.masExam || formData.masInstitute) ? 'Yes' : (formData.master || ''),
        experienceComputer: formData.experienceComputer || 'No',
        experienceSatlipi: formData.experienceSatlipi || 'No',
        customFields: formData.customFields || [],
      };

      // ছবি ও স্বাক্ষর প্রোফাইলে যায় না, আলাদা ফাইল হিসেবে সেভ থাকে
      const profilePayload = {
        schemaVersion: 1,
        data: finalData,
        presentDistrict: finalData.presentDistrict,
        permanentDistrict: finalData.permanentDistrict,
        mobile: finalData.mobile,
        hasPhoto: Boolean(hasPhoto || photoUrl),
        hasSignature: Boolean(hasSignature || signatureUrl),
        photoUrl: '',
        signatureUrl: '',
        updatedAt: new Date().toISOString(),
      };

      await saveMyProfile(profilePayload);
      invalidateCache('user_');
      success('সিভি সফলভাবে সংরক্ষিত হয়েছে!');
    } catch (err: any) {
      console.error('CV save error:', err);
      error(err?.message || 'সিভি সংরক্ষণ ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await deleteMyProfile();
      try {
        await deleteFile(getFileId.photo(user.uid));
        await deleteFile(getFileId.signature(user.uid));
      } catch (e) {
        // Non-fatal
      }
      setFormData({
        mobile: mobile || '',
        nationality: 'Bangladeshi',
        nidType: 'Yes',
        quota: 'Non Quota',
      });
      setPhotoUrl('');
      setSignatureUrl('');
      setHasPhoto(false);
      setHasSignature(false);
      setDeleteModalOpen(false);
      success('আপনার সিভি মুছে ফেলা হয়েছে।');
    } catch (err: any) {
      console.error('CV delete error:', err);
      error(err?.message || 'সিভি মুছে ফেলা সম্ভব হয়নি।');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" text="আপনার সিভি লোড হচ্ছে..." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <CVHeaderCard
        completeness={completeness}
        saving={saving}
        onSave={handleSave}
        onOpenDeleteModal={() => setDeleteModalOpen(true)}
      />

      <PersonalInfoSection formData={formData} onChange={handleFieldChange} />
      <IdentitySection formData={formData} onChange={handleFieldChange} />
      <ContactAddressSection
        formData={formData}
        onChange={handleFieldChange}
        onMultipleChange={handleMultipleChange}
      />
      <EducationSection formData={formData} onChange={handleFieldChange} />
      <ExperienceSection formData={formData} onChange={handleFieldChange} />
      <MediaUploadSection
        uid={user?.uid || ''}
        photoUrl={photoUrl}
        signatureUrl={signatureUrl}
        onPhotoUploaded={(dataUrl) => {
          setPhotoUrl(dataUrl);
          setHasPhoto(true);
          success('ছবি সফলভাবে আপলোড হয়েছে!');
        }}
        onSignatureUploaded={(dataUrl) => {
          setSignatureUrl(dataUrl);
          setHasSignature(true);
          success('স্বাক্ষর সফলভাবে আপলোড হয়েছে!');
        }}
      />

      <div className="sticky bottom-16 md:bottom-4 z-20 bg-white/95 backdrop-blur-xs p-4 rounded-xl border border-gray-200 shadow-lg flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>পরিবর্তন সংরক্ষণ করতে অবশ্যই "সিভি সেভ করুন" বাটনে ক্লিক করুন।</span>
        </div>
        <Button onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>
          সিভি সেভ করুন
        </Button>
      </div>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="সিভি মুছে ফেলা নিশ্চিত করুন"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>
              বাতিল
            </Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={handleDeleteProfile}>
              হ্যাঁ, সিভি মুছে ফেলুন
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-gray-700">
          <div className="flex items-start gap-2 text-rose-600 font-semibold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>সতর্কতা: এই কাজটি পূর্বাবস্থায় ফিরিয়ে আনা যাবে না!</span>
          </div>
          <p>
            আপনি নিশ্চিত যে আপনার সংরক্ষিত সকল সিভি তথ্য ও আপলোড করা ছবি/স্বাক্ষর মুছে ফেলতে চান? পরবর্তী সময়ে চাকরির আবেদনের জন্য আপনাকে নতুন করে সব তথ্য পূরণ করতে হবে।
          </p>
        </div>
      </Modal>
    </div>
  );
};
