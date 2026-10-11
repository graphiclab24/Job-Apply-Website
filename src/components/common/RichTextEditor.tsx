import React, { useState, useRef } from 'react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Table,
  Link as LinkIcon,
  Image as ImageIcon,
  Quote,
  Eye,
  Edit3,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { formatJobContent } from '../../utils/formatJobContent';
import { InsertImageModal } from './InsertImageModal';

interface Props {
  value: string;
  onChange: (val: string) => void;
  label?: string;
}

export const RichTextEditor: React.FC<Props> = ({ value, onChange, label }) => {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [showTips, setShowTips] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Wraps selected text in the textarea with before/after tags.
   * If no text is selected, inserts default text enclosed in tags.
   */
  const wrapSelection = (before: string, after: string, defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange((value || '') + before + defaultText + after);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = value || '';
    const selectedText = currentVal.substring(start, end);
    const textToInsert = selectedText || defaultText;
    const replacement = `${before}${textToInsert}${after}`;
    const nextVal = currentVal.substring(0, start) + replacement + currentVal.substring(end);

    onChange(nextVal);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + textToInsert.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  /**
   * Turns selected lines into an HTML list (<ul> or <ol>)
   */
  const handleListWrap = (type: 'ul' | 'ol') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const snippet = type === 'ul'
        ? '<ul>\n  <li>পয়েন্ট ১</li>\n  <li>পয়েন্ট ২</li>\n</ul>\n'
        : '<ol>\n  <li>ক্রমিক ১</li>\n  <li>ক্রমিক ২</li>\n</ol>\n';
      onChange((value || '') + snippet);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = value || '';
    const selectedText = currentVal.substring(start, end);

    if (!selectedText.trim()) {
      const snippet = type === 'ul'
        ? '<ul>\n  <li>পয়েন্ট ১</li>\n  <li>পয়েন্ট ২</li>\n</ul>\n'
        : '<ol>\n  <li>ক্রমিক ১</li>\n  <li>ক্রমিক ২</li>\n</ol>\n';
      const nextVal = currentVal.substring(0, start) + snippet + currentVal.substring(end);
      onChange(nextVal);
      return;
    }

    const lines = selectedText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const listItems = lines
      .map((l) => `  <li>${l.replace(/^[-*•▪0-9.)\s]+/, '').trim()}</li>`)
      .join('\n');
    const replacement = `<${type}>\n${listItems}\n</${type}>\n`;
    const nextVal = currentVal.substring(0, start) + replacement + currentVal.substring(end);
    onChange(nextVal);
  };

  const handleAutoFormat = () => {
    if (!value) return;
    const formatted = formatJobContent(value);
    onChange(formatted);
    setTab('preview');
  };

  const handleInsertTable = () => {
    const tableTemplate = `
<table border="1">
  <thead>
    <tr>
      <th>পদের নাম</th>
      <th>পদসংখ্যা</th>
      <th>শিক্ষাগত যোগ্যতা</th>
      <th>বেতন স্কেল</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>কম্পিউটার অপারেটর</td>
      <td>০৫ জন</td>
      <td>স্নাতক (বিজ্ঞান বিভাগ অগ্রাধিকার)</td>
      <td>১১,০০০ - ২৬,৫৯০/-</td>
    </tr>
    <tr>
      <td>অফিস সহকারী</td>
      <td>০৩ জন</td>
      <td>এইচএসসি/সমমান পাশ</td>
      <td>৯,৩০০ - ২২,৪৯০/-</td>
    </tr>
  </tbody>
</table>
`;
    wrapSelection('', tableTemplate, '');
  };

  const handleInsertLink = () => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart || 0;
    const end = textarea?.selectionEnd || 0;
    const selectedText = (value || '').substring(start, end);

    const url = prompt('লিংক (URL) লিখুন:', 'https://');
    if (!url) return;
    const labelText = selectedText || prompt('লিংকের প্রদর্শিত টেক্সট লিখুন:', 'এখানে ক্লিক করুন') || url;
    wrapSelection(`<a href="${url}" target="_blank" rel="noopener noreferrer">`, `</a>`, labelText);
  };

  const handleInsertImage = () => {
    setImageModalOpen(true);
  };

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {label && <label className="block text-sm font-semibold text-gray-800">{label}</label>}
          <button
            type="button"
            onClick={() => setShowTips(!showTips)}
            className="text-gray-400 hover:text-emerald-600 transition-colors"
            title="ফরম্যাটিং নিয়মাবলী দেখুন"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setTab('write')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
              tab === 'write' ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>লিখুন ও এডিট করুন</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
              tab === 'preview' ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>লাইভ প্রিভিউ</span>
          </button>
        </div>
      </div>

      {showTips && (
        <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1 animate-fadeIn">
          <p className="font-bold flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
            <span>সহজ ফরম্যাটিং টিপস:</span>
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-gray-700">
            <li>যেকোনো লেখা সিলেক্ট করে <strong>B</strong> চাপলে বোল্ড বা <strong>H1/H2</strong> চাপলে হেডিং হবে।</li>
            <li>পত্রিকা বা সার্কুলার থেকে যেকোনো লেখা পেস্ট করে <strong>✨ অটো ফরম্যাট</strong> বাটনে চাপ দিন, সিস্টেম স্বয়ংক্রিয়ভাবে পয়েন্ট ও হেডিং সাজিয়ে দেবে।</li>
            <li>Markdown ও কাজ করে: যেমন <code># প্রধান শিরোনাম</code>, <code>## উপ-শিরোনাম</code>, <code>**বোল্ড**</code> বা <code>- পয়েন্ট</code>।</li>
          </ul>
        </div>
      )}

      <div className="border border-gray-300 rounded-xl overflow-hidden focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 bg-white shadow-xs">
        {tab === 'write' ? (
          <div>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 border-b border-gray-200 text-xs">
              {/* Bold / Italic */}
              <button
                type="button"
                onClick={() => wrapSelection('<b>', '</b>', 'বোল্ড টেক্সট')}
                className="p-1.5 hover:bg-gray-200 rounded text-gray-700 font-bold transition-colors"
                title="Bold (লেখা সিলেক্ট করে চাপুন)"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => wrapSelection('<i>', '</i>', 'ইটালিক টেক্সট')}
                className="p-1.5 hover:bg-gray-200 rounded text-gray-700 italic transition-colors"
                title="Italic (ইটালিক)"
              >
                <Italic className="w-4 h-4" />
              </button>

              <div className="h-4 w-px bg-gray-300 mx-1" />

              {/* Headings */}
              <button
                type="button"
                onClick={() => wrapSelection('<h1>', '</h1>', 'প্রধান শিরোনাম ১')}
                className="px-2 py-1 hover:bg-gray-200 rounded text-gray-800 font-extrabold flex items-center gap-0.5 transition-colors"
                title="Heading 1 (বড় প্রধান শিরোনাম)"
              >
                <Heading1 className="w-4 h-4" />
                <span className="text-[11px]">H1</span>
              </button>
              <button
                type="button"
                onClick={() => wrapSelection('<h2>', '</h2>', 'উপ-শিরোনাম ২')}
                className="px-2 py-1 hover:bg-gray-200 rounded text-gray-800 font-bold flex items-center gap-0.5 transition-colors"
                title="Heading 2 (উপ-শিরোনাম)"
              >
                <Heading2 className="w-4 h-4" />
                <span className="text-[11px]">H2</span>
              </button>
              <button
                type="button"
                onClick={() => wrapSelection('<h3>', '</h3>', 'শিরোনাম ৩')}
                className="px-2 py-1 hover:bg-gray-200 rounded text-gray-800 font-semibold flex items-center gap-0.5 transition-colors"
                title="Heading 3 (সেকশন শিরোনাম)"
              >
                <Heading3 className="w-4 h-4" />
                <span className="text-[11px]">H3</span>
              </button>

              <div className="h-4 w-px bg-gray-300 mx-1" />

              {/* Lists */}
              <button
                type="button"
                onClick={() => handleListWrap('ul')}
                className="p-1.5 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                title="Bullet List (বুলেট পয়েন্ট তালিকা)"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleListWrap('ol')}
                className="p-1.5 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                title="Numbered List (ক্রমিক সংখ্যা তালিকা)"
              >
                <ListOrdered className="w-4 h-4" />
              </button>

              <div className="h-4 w-px bg-gray-300 mx-1" />

              {/* Elements: Table, Quote, Link, Image */}
              <button
                type="button"
                onClick={handleInsertTable}
                className="p-1.5 hover:bg-gray-200 rounded text-gray-700 transition-colors flex items-center gap-1"
                title="পদ ও যোগ্যতার টেবিল যুক্ত করুন"
              >
                <Table className="w-4 h-4" />
                <span className="text-[10px] hidden sm:inline">টেবিল</span>
              </button>
              <button
                type="button"
                onClick={() => wrapSelection('<blockquote>', '</blockquote>', 'জরুরি বিশেষ দ্রষ্টব্য বা শর্তাবলী')}
                className="p-1.5 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                title="উদ্ধৃতি / বিশেষ দ্রষ্টব্য বক্স"
              >
                <Quote className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleInsertLink}
                className="p-1.5 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                title="লিংক যুক্ত করুন"
              >
                <LinkIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleInsertImage}
                className="p-1.5 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                title="ছবি যুক্ত করুন"
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              {/* Auto Format Button */}
              <button
                type="button"
                onClick={handleAutoFormat}
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs ml-auto transition-all cursor-pointer active:scale-95"
                title="স্বয়ংক্রিয়ভাবে প্যারাগ্রাফ, বুলেট পয়েন্ট ও হেডিং ফরম্যাট করুন"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
                <span>✨ অটো ফরম্যাট</span>
              </button>
            </div>

            <textarea
              ref={textareaRef}
              rows={14}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="এখানে সার্কুলার এর বিবরণ লিখুন বা পেস্ট করুন। লেখা সিলেক্ট করে উপরের B, H1, H2, টেবিল ইত্যাদিতে চাপুন অথবা '✨ অটো ফরম্যাট' বাটনে চাপ দিন..."
              className="w-full p-4 text-sm font-sans focus:outline-none resize-y leading-relaxed text-gray-800"
            />
          </div>
        ) : (
          <div className="p-6 min-h-[350px] overflow-y-auto bg-gray-50/50">
            <div className="max-w-none bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
              <div
                className="job-content"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(
                    formatJobContent(value || '<p class="text-gray-400 italic">কোনো কনটেন্ট লেখা হয়নি। লিখুন ট্যাবে গিয়ে টাইপ করুন।</p>')
                  ),
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Direct Image Upload & Google Drive Modal */}
      <InsertImageModal
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        onInsertImage={(imgHtml) => {
          const textarea = textareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentVal = value || '';
            const padded = `\n${imgHtml.trim()}\n`;
            const nextVal = currentVal.substring(0, start) + padded + currentVal.substring(end);
            onChange(nextVal);
            setTimeout(() => {
              textarea.focus();
              const newPos = start + padded.length;
              textarea.setSelectionRange(newPos, newPos);
            }, 0);
          } else {
            onChange((value ? `${value}\n\n` : '') + imgHtml.trim() + '\n');
          }
        }}
      />
    </div>
  );
};
