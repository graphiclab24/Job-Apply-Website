import React from 'react';
import { Download, ExternalLink, BookOpen, WifiOff } from 'lucide-react';
import { R2_BASE } from '../../services/jobsStore';

const STUDY_URL = `${R2_BASE}/study-material.html`;

export const PrepPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-bold text-gray-900">চাকরির প্রস্তুতি</h1>
        <p className="text-xs text-gray-500 mt-1">স্টাডি মেটেরিয়াল ডাউনলোড করুন বা সরাসরি খুলুন</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Study Material</h2>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              প্রশ্ন, রিভিশন, টেস্ট, মক টেস্ট ও বুকমার্ক সহ পূর্ণ স্টাডি প্যানেল।
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>ফাইলটি ডাউনলোড করলে ইন্টারনেট ছাড়াও ব্যবহার করা যাবে।</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={STUDY_URL}
            download="study-material.html"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold"
          >
            <Download className="w-4 h-4" />
            <span>ডাউনলোড করুন</span>
          </a>
          <a
            href={STUDY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-lg text-sm font-semibold"
          >
            <ExternalLink className="w-4 h-4" />
            <span>নতুন ট্যাবে খুলুন</span>
          </a>
        </div>

        <p className="text-[11px] text-gray-500 leading-relaxed">
          ডাউনলোড করা ফাইলটি ব্রাউজারে খুলে ব্যবহার করুন। অগ্রগতি ও বুকমার্ক ওই ব্রাউজারেই সংরক্ষিত থাকবে। নতুন আপডেট পেতে নতুন ফাইল ডাউনলোড করুন।
        </p>
      </div>
    </div>
  );
};
