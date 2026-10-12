import React, { useState } from 'react';
import { JobPostItem } from '../../types';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { BD_DISTRICTS } from '../../data/districts';
import { Plus, Trash2, Globe, MapPin, X, Edit3, Check } from 'lucide-react';

interface Props {
  posts: JobPostItem[];
  onAddPost: () => void;
  onUpdatePost: (idx: number, field: keyof JobPostItem, val: any) => void;
  onRemovePost: (idx: number) => void;
}

export const JobPostsTableSection: React.FC<Props> = ({
  posts,
  onAddPost,
  onUpdatePost,
  onRemovePost,
}) => {
  // Track text edit mode per post index
  const [textModeMap, setTextModeMap] = useState<Record<number, boolean>>({});

  // Helper to get active district list for a post
  const getPostDistricts = (post: JobPostItem): string[] => {
    if (Array.isArray(post.districts) && post.districts.length > 0) {
      return post.districts;
    }
    if (post.district && post.district !== 'ALL') {
      return post.district.split(/[,/|]+/).map((s) => s.trim()).filter(Boolean);
    }
    return ['ALL'];
  };

  const handleAddDistrict = (idx: number, distName: string) => {
    if (!distName) return;

    if (distName === 'ALL') {
      onUpdatePost(idx, 'district', 'ALL');
      onUpdatePost(idx, 'districts', ['ALL']);
      return;
    }

    const currentList = getPostDistricts(posts[idx]).filter((d) => d !== 'ALL');
    if (!currentList.includes(distName)) {
      const updated = [...currentList, distName];
      onUpdatePost(idx, 'districts', updated);
      onUpdatePost(idx, 'district', updated.join(', '));
    }
  };

  const handleRemoveDistrict = (idx: number, distName: string) => {
    const currentList = getPostDistricts(posts[idx]);
    const updated = currentList.filter((d) => d !== distName);

    if (updated.length === 0) {
      onUpdatePost(idx, 'district', 'ALL');
      onUpdatePost(idx, 'districts', ['ALL']);
    } else {
      onUpdatePost(idx, 'districts', updated);
      onUpdatePost(idx, 'district', updated.join(', '));
    }
  };

  const handleSetAll = (idx: number) => {
    onUpdatePost(idx, 'district', 'ALL');
    onUpdatePost(idx, 'districts', ['ALL']);
  };

  const handleCustomTextChange = (idx: number, text: string) => {
    const clean = text.trim();
    if (!clean || clean.toUpperCase() === 'ALL' || clean === 'সারাদেশ') {
      onUpdatePost(idx, 'district', 'ALL');
      onUpdatePost(idx, 'districts', ['ALL']);
    } else {
      const splitted = clean.split(/[,/|]+/).map((s) => s.trim()).filter(Boolean);
      onUpdatePost(idx, 'district', text);
      onUpdatePost(idx, 'districts', splitted);
    }
  };

  const toggleTextMode = (idx: number) => {
    setTextModeMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900">পদের তালিকা ও অনুমোদিত জেলাসমূহ</h3>
          <p className="text-[11px] text-gray-500">
            প্রতিটি পদের জন্য সারাদেশ অথবা একাধিক নির্দিষ্ট জেলা নির্বাচন করতে পারেন
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddPost}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          পদ যোগ করুন
        </Button>
      </div>

      <div className="space-y-4">
        {posts.map((post, idx) => {
          const postDistricts = getPostDistricts(post);
          const isAll = postDistricts.includes('ALL') || post.district === 'ALL';
          const isTextMode = textModeMap[idx] || false;

          return (
            <div
              key={idx}
              className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3"
            >
              {/* Row 1: Name and Post Count */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 sm:flex-2">
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    পদের নাম <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    placeholder="যেমন: সহকারী স্টেশন মাস্টার"
                    value={post.name}
                    onChange={(e) => onUpdatePost(idx, 'name', e.target.value)}
                    className="w-full"
                    requiredStar
                  />
                </div>

                <div className="w-full sm:w-28">
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    পদসংখ্যা
                  </label>
                  <Input
                    placeholder="সংখ্যা"
                    type="number"
                    value={post.count}
                    onChange={(e) => onUpdatePost(idx, 'count', Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                {posts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemovePost(idx)}
                    className="self-end sm:self-center mt-auto sm:mt-5 p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                    title="এই পদটি মুছে ফেলুন"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Row 2: Multi-District Selector Section */}
              <div className="bg-white p-3 rounded-lg border border-gray-200/80 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span>আবেদনের অনুমোদিত জেলা (একাধিক জেলা নির্বাচন করা যাবে):</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetAll(idx)}
                      className={`px-2 py-0.5 text-[11px] rounded-md font-semibold transition-colors flex items-center gap-1 ${
                        isAll
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-gray-100 text-gray-700 hover:bg-emerald-50 hover:text-emerald-800'
                      }`}
                    >
                      <Globe className="w-3 h-3" />
                      <span>সারাদেশ (সকল জেলা)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleTextMode(idx)}
                      className="px-2 py-0.5 text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-semibold transition-colors flex items-center gap-1"
                      title="কমা দিয়ে একাধিক জেলা পেস্ট বা টাইপ করুন"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>{isTextMode ? 'ড্রপডাউন মোড' : 'টেক্সট এডিট'}</span>
                    </button>
                  </div>
                </div>

                {/* Display Current Selected District Badges */}
                <div className="flex flex-wrap items-center gap-1.5 min-h-[30px] p-2 bg-gray-50/70 rounded-lg border border-gray-200">
                  {isAll ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-md">
                      <Globe className="w-3.5 h-3.5" />
                      <span>সারাদেশ (সকল জেলার প্রার্থীরা আবেদন করতে পারবেন)</span>
                    </span>
                  ) : (
                    postDistricts.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 text-emerald-900 text-xs font-semibold rounded-md shadow-2xs"
                      >
                        <span>{d}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDistrict(idx, d)}
                          className="text-gray-400 hover:text-rose-600 p-0.5 rounded transition-colors"
                          title={`${d} বাতিল করুন`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}

                  {!isAll && postDistricts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSetAll(idx)}
                      className="text-[10px] text-gray-400 hover:text-rose-600 hover:underline px-1 ml-auto"
                    >
                      রিসেট (সারাদেশ)
                    </button>
                  )}
                </div>

                {/* Dropdown to add district OR Custom text input */}
                {isTextMode ? (
                  <div className="space-y-1">
                    <Input
                      placeholder="কমা দিয়ে একাধিক জেলা লিখুন, যেমন: Dhaka, Gazipur, Comilla (অথবা ALL)"
                      value={post.district || ''}
                      onChange={(e) => handleCustomTextChange(idx, e.target.value)}
                      className="w-full text-xs"
                    />
                    <p className="text-[10px] text-gray-500">
                      কমা (,) দিয়ে জেলাগুলোর নাম লিখুন। প্রার্থীরা এই জেলাগুলোর যেকোনো একটির হলে আবেদন করতে পারবে।
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value=""
                      onChange={(e) => {
                        handleAddDistrict(idx, e.target.value);
                        e.target.value = '';
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">+ তালিকা থেকে জেলা যোগ করুন (একাধিক জেলা বেছে নিতে পারেন)...</option>
                      <option value="ALL">🌍 সারাদেশ (ALL Districts)</option>
                      {BD_DISTRICTS.map((d) => (
                        <option
                          key={d.name}
                          value={d.name}
                          disabled={postDistricts.includes(d.name)}
                        >
                          {d.name} {postDistricts.includes(d.name) ? '✓ (যুক্ত আছে)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Row 3: Per-post fee configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-gray-200/60">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                    এই পদের টেলিটক/সরকারি ফি (৳) <span className="text-gray-400 font-normal">(যেমন: ৫০, ১০০, ১১২, ২২৩, ৬৬৭)</span>
                  </label>
                  <Input
                    type="number"
                    placeholder="যেমন: ৫০ বা ২২৩"
                    value={post.applicationFee !== undefined ? post.applicationFee : ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : Number(e.target.value);
                      onUpdatePost(idx, 'applicationFee', val);
                    }}
                    className="w-full text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                    আমাদের সার্ভিস চার্জ (৳) <span className="text-emerald-700 font-medium">(খালি রাখলে সার্কুলারের ডিফল্ট প্রযোজ্য)</span>
                  </label>
                  <Input
                    type="number"
                    placeholder="১০"
                    value={post.serviceCharge !== undefined ? post.serviceCharge : ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : Number(e.target.value);
                      onUpdatePost(idx, 'serviceCharge', val);
                    }}
                    className="w-full text-xs"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
