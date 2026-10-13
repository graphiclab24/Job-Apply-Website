import React, { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getFile, getFileId } from '../../services/files';
import { JobApplication } from '../../types';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { useToast } from '../../components/common/Toast';
import { Download, FolderCheck, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

export const AdminExportPage: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const { success, error } = useToast();

  const isFSAccessSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const handleExport = async () => {
    setExporting(true);
    setStatusLog(['ডাটাবেজ থেকে সকল আবেদন সংগ্রহ করা হচ্ছে...']);

    try {
      let apps: JobApplication[] = [];
      try {
        const res = await fetch('/api/applications');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.applications) && data.applications.length > 0) {
            apps = data.applications;
          }
        }
      } catch {}

      if (apps.length === 0) {
        const snap = await getDocs(collection(db, 'applications'));
        apps = snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobApplication));
      }

      setStatusLog((prev) => [...prev, `মোট ${apps.length}টি আবেদন পাওয়া গেছে।`]);
      setStatusLog((prev) => [...prev, 'প্রার্থীদের ছবি ও স্বাক্ষর সংগ্রহ করা হচ্ছে (getFile)...']);

      // Enrich with photos & signatures using getFile
      const enrichedApps = await Promise.all(
        apps.map(async (app) => {
          let photoData: string | undefined = undefined;
          let signatureData: string | undefined = undefined;
          try {
            const [pDoc, sDoc] = await Promise.all([
              getFile(getFileId.photo(app.uid)),
              getFile(getFileId.signature(app.uid)),
            ]);
            photoData = pDoc?.data;
            signatureData = sDoc?.data;
          } catch (e) {
            // Ignore individual file error
          }
          return {
            ...app,
            photoDataUrl: photoData,
            signatureDataUrl: signatureData,
          };
        })
      );

      // 1. Prepare JSON Content
      const jsonContent = JSON.stringify(enrichedApps, null, 2);

      // 2. Prepare CSV Content
      const headers = [
        'ID',
        'Job Title',
        'Post Name',
        'Candidate Name',
        'Mobile',
        'District',
        'Education Level',
        'Status',
        'TrxID',
        'Amount',
        'Created At',
      ];

      const csvRows = [headers.join(',')];
      apps.forEach((app) => {
        const row = [
          `"${app.id}"`,
          `"${(app.jobTitle || '').replace(/"/g, '""')}"`,
          `"${(app.postName || '').replace(/"/g, '""')}"`,
          `"${(app.fullName || '').replace(/"/g, '""')}"`,
          `"${app.smsNumber || app.mobile || ''}"`,
          `"${app.district || ''}"`,
          `"${app.educationLevel || ''}"`,
          `"${app.status || ''}"`,
          `"${app.payment?.trxId || ''}"`,
          `"${app.fee?.total || 0}"`,
          `"${app.createdAt?.toDate ? app.createdAt.toDate().toISOString() : ''}"`,
        ];
        csvRows.push(row.join(','));
      });
      const csvContent = '\uFEFF' + csvRows.join('\n'); // UTF-8 BOM for Bangla Excel compatibility

      if (isFSAccessSupported) {
        setStatusLog((prev) => [
          ...prev,
          'আপনার কম্পিউটার থেকে ফোল্ডার নির্বাচন করুন (showDirectoryPicker)...',
        ]);

        const dirHandle = await (window as any).showDirectoryPicker({
          mode: 'readwrite',
        });

        // Write applications.json
        const jsonFileHandle = await dirHandle.getFileHandle('applications.json', { create: true });
        const jsonWritable = await jsonFileHandle.createWritable();
        await jsonWritable.write(jsonContent);
        await jsonWritable.close();

        // Write applications.csv
        const csvFileHandle = await dirHandle.getFileHandle('applications.csv', { create: true });
        const csvWritable = await csvFileHandle.createWritable();
        await csvWritable.write(csvContent);
        await csvWritable.close();

        setStatusLog((prev) => [
          ...prev,
          '✓ applications.json ফাইলে সেভ হয়েছে',
          '✓ applications.csv ফাইলে সেভ হয়েছে',
          'সম্পূর্ণ সফলভাবে ফোল্ডারে এক্সপোর্ট সম্পন্ন হয়েছে!',
        ]);
        success('নির্বাচিত ফোল্ডারে সকল ফাইল সফলভাবে এক্সপোর্ট হয়েছে!');
      } else {
        // Fallback for browsers without File System Access API (Firefox, Safari)
        setStatusLog((prev) => [
          ...prev,
          'ব্রাউজার showDirectoryPicker সাপোর্ট করে না, ফলব্যাক সরাসরি ডাউনলোড শুরু হচ্ছে...',
        ]);

        // Download CSV
        const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const csvUrl = URL.createObjectURL(csvBlob);
        const aCsv = document.createElement('a');
        aCsv.href = csvUrl;
        aCsv.download = `applications_${Date.now()}.csv`;
        aCsv.click();
        URL.revokeObjectURL(csvUrl);

        // Download JSON
        const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
        const jsonUrl = URL.createObjectURL(jsonBlob);
        const aJson = document.createElement('a');
        aJson.href = jsonUrl;
        aJson.download = `applications_${Date.now()}.json`;
        aJson.click();
        URL.revokeObjectURL(jsonUrl);

        setStatusLog((prev) => [
          ...prev,
          '✓ CSV ও JSON ফাইল ডাউনলোড ফোল্ডারে সেভ হয়েছে।',
        ]);
        success('ফাইল ডাউনলোড সম্পন্ন হয়েছে!');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatusLog((prev) => [...prev, 'ইউজার ফোল্ডার নির্বাচন বাতিল করেছেন।']);
      } else {
        error('এক্সপোর্টে ত্রুটি হয়েছে');
        setStatusLog((prev) => [...prev, `ত্রুটি: ${err.message}`]);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-xl font-bold text-gray-900">লোকাল ফোল্ডারে এক্সপোর্ট (Export All)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          মাস্টার স্পেক ১৬ অনুযায়ী আপনার কম্পিউটারের যেকোনো ফোল্ডারে সকল আবেদনের CSV ও JSON ব্যাকআপ সেভ করুন
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Download className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">এক ক্লিকে লোকাল ব্যাকআপ এক্সপোর্ট</h3>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              এই বাটনে ক্লিক করলে ব্রাউজারের File System Access API (window.showDirectoryPicker) সচল হবে। আপনি আপনার কম্পিউটারের যে ফোল্ডার সিলেক্ট করবেন, সেখানে সরাসরি <strong>applications.csv</strong> (এক্সেল ও বাংলা ফন্ট সাপোর্টেড) এবং <strong>applications.json</strong> তৈরি হয়ে যাবে।
            </p>
          </div>
        </div>

        {/* Browser compatibility hint */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderCheck className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-gray-700">ব্রাউজার সামঞ্জস্য:</span>
            {isFSAccessSupported ? (
              <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                সরাসরি ফোল্ডার নির্বাচন সমর্থিত (Chrome / Edge)
              </span>
            ) : (
              <span className="text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded">
                ফলব্যাক ফাইল ডাউনলোড সমর্থিত (Firefox / Safari)
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <Button
            size="lg"
            loading={exporting}
            onClick={handleExport}
            icon={<Download className="w-5 h-5" />}
          >
            Export All - ফোল্ডারে সেভ করুন
          </Button>
        </div>

        {/* Progress / Status Logs */}
        {statusLog.length > 0 && (
          <div className="p-4 bg-gray-900 text-emerald-400 rounded-xl font-mono text-xs space-y-1">
            <span className="text-gray-400 block border-b border-gray-800 pb-1 mb-2 font-sans font-bold">
              এক্সপোর্ট প্রসেস লগ:
            </span>
            {statusLog.map((log, idx) => (
              <div key={idx}>{log}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
