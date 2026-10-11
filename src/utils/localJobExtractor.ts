import { formatJobContent, repairCorruptedJobHtml } from './formatJobContent';
import { generateSlug } from './slugify';
import { JobCategory, JobPostItem } from '../types';

export interface ExtractedJobResult {
  title: string;
  slug: string;
  category: JobCategory;
  deadline: string; // YYYY-MM-DDTHH:mm
  applyLink: string;
  applicationFee: number;
  serviceCharge: number;
  circularLink: string;
  posts: JobPostItem[];
  content: string;
  seoTitle: string;
  metaDescription: string;
  focusKeyword: string;
  tags: string[];
}

const BENGALI_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

const BENGALI_MONTHS: Record<string, string> = {
  'জানুয়ারি': '01', 'ফেব্রুয়ারি': '02', 'মার্চ': '03', 'এপ্রিল': '04',
  'মে': '05', 'জুন': '06', 'জুলাই': '07', 'আগস্ট': '08',
  'সেপ্টেম্বর': '09', 'অক্টোবর': '10', 'নভেম্বর': '11', 'ডিসেম্বর': '12',
  'জানুয়ারি': '01', 'ফেব্রুয়ারি': '02',
};

function toEnglishDigits(str: string): string {
  return str.replace(/[০-৯]/g, (d) => BENGALI_DIGITS[d] || d);
}

function stripAllHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<img[^>]*>/gi, ' ') // Strip img tags completely so attributes don't become text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Intelligent Resilient Job Extractor
 * Parses raw text or HTML snippet locally with zero network delay, ensuring 100% reliability
 * under any circumstances (Gemini rate-limits, network latency, or static deployments).
 */
export function extractJobLocally(rawText: string): ExtractedJobResult {
  const repairedInput = repairCorruptedJobHtml((rawText || '').trim());
  const textWithoutHtml = stripAllHtml(repairedInput);
  const lines = textWithoutHtml.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. EXTRACT ORGANIZATION & TOTAL POSTS
  let orgName = '';
  const orgMatch = textWithoutHtml.match(/প্রতিষ্ঠানের\s*নাম[:ঃ]?\s*([^\n,।<]+)/i);
  if (orgMatch) {
    orgName = orgMatch[1].trim();
  }

  let totalCount = 0;
  const totalMatch = textWithoutHtml.match(/(?:মোট\s*পদ\s*সংখ্যা|মোট\s*পদসংখ্যা|মোট\s*পদ|সর্বমোট\s*পদ|মোট\s*জনবল)[^\n০-৯0-9]*([০-৯0-9]+)\s*(?:টি|জন)?/i);
  if (totalMatch) {
    totalCount = parseInt(toEnglishDigits(totalMatch[1]), 10) || 0;
  }

  // 2. EXTRACT TITLE
  let title = '';
  // Check <h1> tag first if available
  const h1Match = repairedInput.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const rawH1 = stripAllHtml(h1Match[1]).replace(/\s+/g, ' ').trim();
    if (rawH1.length > 10) {
      title = rawH1;
    }
  }

  // If title not found or looks like generic heading, find primary line
  if (!title || /^(?:এক নজরে|মূল তথ্য|পদের বিবরণ)/i.test(title)) {
    for (const line of lines) {
      if (
        /(?:নিয়োগ|বিজ্ঞপ্তি|মন্ত্রণালয়|অধিদপ্তর|পরিদপ্তর|ব্যাংক|কমিশন|বোর্ড|বাহিনী|রেলওয়ে)/i.test(line) &&
        !/^(?:এক নজরে|প্রতিষ্ঠানের নাম|আবেদনের মাধ্যম|অফিসিয়াল|আবেদন শুরুর|আবেদনের শেষ|মূল তথ্য|পদের বিবরণ)/i.test(line) &&
        line.length > 15
      ) {
        title = line.replace(/^[#<>\s*]+/, '').replace(/[:ঃ\s]+$/, '');
        break;
      }
    }
  }

  // Fallback to synthesizing a clean authoritative title if still missing
  if (!title && orgName) {
    title = `${orgName} নিয়োগ বিজ্ঞপ্তি`;
  } else if (!title && lines.length > 0) {
    title = lines[0].slice(0, 100);
  } else if (!title) {
    title = 'নতুন সরকারি চাকরির নিয়োগ বিজ্ঞপ্তি';
  }

  // Clean trailing "প্রকাশ করা হয়েছে" or punctuation for high-converting title
  title = title.replace(/\s*প্রকাশ করা হয়েছে[।.]*$/i, '').trim();

  // Ensure year
  if (!title.includes('২০২৬') && !title.includes('2026')) {
    title = `${title} ২০২৬`;
  }

  // 3. EXTRACT APPLY LINK
  let applyLink = '';
  const urlMatch = repairedInput.match(/https?:\/\/[^\s"'<>]+(?:teletalk\.com\.bd|gov\.bd|[a-z0-9.-]+\.[a-z]{2,})/i);
  if (urlMatch) {
    applyLink = urlMatch[0];
  } else if (/teletalk\.com\.bd/i.test(repairedInput)) {
    const rawDomain = repairedInput.match(/([a-z0-9-]+)\.teletalk\.com\.bd/i);
    if (rawDomain) {
      applyLink = `https://${rawDomain[0]}`;
    }
  }

  // 4. EXTRACT DEADLINE
  let deadline = '';
  const deadlineMatch = textWithoutHtml.match(
    /(?:আবেদনের শেষ তারিখ|শেষ তারিখ|আবেদনের শেষ সময়|শেষ সময়|deadline)[^\n০-৯0-9]*([০-৯0-9]{1,2})[\s\/-]+([^\s\/-]+)[\s\/-]+([০-৯0-9]{4})/i
  );

  if (deadlineMatch) {
    const day = toEnglishDigits(deadlineMatch[1]).padStart(2, '0');
    const monthRaw = deadlineMatch[2].toLowerCase();
    const month = BENGALI_MONTHS[monthRaw] || toEnglishDigits(monthRaw).padStart(2, '0');
    const year = toEnglishDigits(deadlineMatch[3]);

    let hour = '17';
    let minute = '00';
    if (/(?:বিকাল|অপরাহ্ন|সন্ধ্যা)[^\n০-৯0-9]*([০-৯0-9]{1,2})/i.test(textWithoutHtml)) {
      const hMatch = textWithoutHtml.match(/(?:বিকাল|অপরাহ্ন|সন্ধ্যা)[^\n০-৯0-9]*([০-৯0-9]{1,2})(?:[:.]([০-৯0-9]{1,2}))?/i);
      if (hMatch) {
        const rawH = parseInt(toEnglishDigits(hMatch[1]), 10);
        hour = String(rawH < 12 ? rawH + 12 : rawH).padStart(2, '0');
        if (hMatch[2]) minute = toEnglishDigits(hMatch[2]).padStart(2, '0');
      }
    } else if (/রাত\s*১১:৫৯/i.test(textWithoutHtml)) {
      hour = '23';
      minute = '59';
    }

    deadline = `${year}-${month}-${day}T${hour}:${minute}`;
  } else {
    // Default deadline 25 days ahead
    const future = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
    deadline = `${future.toISOString().split('T')[0]}T17:00`;
  }

  // 5. EXTRACT CATEGORY
  let category: JobCategory = 'govt';
  if (/ngo|ব্র্যাক|brac|আশা|কারিতাস/i.test(textWithoutHtml)) category = 'ngo';
  else if (/ফার্মা|pharma|ঔষধ|স্কয়ার|বেক্সিমকো|ইনসেপ্টা/i.test(textWithoutHtml)) category = 'pharma';
  else if (/বিদেশ|foreign|প্রবাসী|কুয়েত|সৌদি|কাতার/i.test(textWithoutHtml)) category = 'foreign';
  else if (/সমাধান|solution|উত্তর|প্রশ্নোত্তর/i.test(textWithoutHtml)) category = 'solution';
  else if (/বেসরকারি|লিমিটেড|কোম্পানি|private/i.test(textWithoutHtml)) category = 'private';

  // 6. EXTRACT POSTS
  const posts: JobPostItem[] = [];

  // Remove URLs, CSS, and styling fragments to prevent matching style attributes
  const cleanPostText = textWithoutHtml
    .replace(/https?:\/\/[^\s]+/g, ' ')
    .replace(/(?:margin|padding|border|radius|shadow|style|display|block|max-width|box-shadow)[^;\n]*;?/gi, ' ');

  const postLines = cleanPostText.match(/(?:[০-৯0-9]+[.)]|[-*•▪])\s*([^:\n;]+)[:ঃ]?\s*([০-৯0-9]+)\s*(?:জন|টি|পদ)?/gi);
  if (postLines && postLines.length > 0) {
    for (const pl of postLines.slice(0, 10)) {
      const pMatch = pl.match(/^(?:[০-৯0-9]+[.)]|[-*•▪])\s*(.+?)(?:[:ঃ]|\s+পদসংখ্যা[:ঃ]?)?\s*([০-৯0-9]+)\s*(?:জন|টি|পদ)?/i);
      if (pMatch) {
        const pName = pMatch[1].replace(/^[0-9০-৯.)\s-]+/, '').trim();
        const pCount = parseInt(toEnglishDigits(pMatch[2]), 10) || 1;
        // Strictly filter out non-job words or styling properties
        if (
          pName.length > 2 &&
          pName.length < 50 &&
          !/^(?:radius|shadow|margin|padding|border|style|color|width|height|font|url|http|com|display|block|px|rgba)/i.test(pName) &&
          !/[;{}]/.test(pName)
        ) {
          posts.push({ name: pName, count: pCount, district: 'ALL' });
        }
      }
    }
  }

  // If no structured post lines found, use total vacancy count
  if (posts.length === 0) {
    const fallbackCount = totalCount > 0 ? totalCount : 1;
    let fallbackPostName = 'বিভিন্ন পদ';
    if (orgName) {
      fallbackPostName = `${orgName} (বিভিন্ন পদ)`;
    } else {
      const shortTitle = title.replace(/\s*২০২৬.*$/, '').slice(0, 40);
      fallbackPostName = shortTitle || 'বিভিন্ন পদ';
    }
    posts.push({ name: fallbackPostName, count: fallbackCount, district: 'ALL' });
  }

  // 7. EXTRACT APPLICATION FEE
  let applicationFee = 200;
  const feeMatch = textWithoutHtml.match(/(?:পরীক্ষার ফি|আবেদন ফি|ফি)[^\n০-৯0-9]*([০-৯0-9]{2,4})\s*টাকা/i);
  if (feeMatch) {
    applicationFee = parseInt(toEnglishDigits(feeMatch[1]), 10) || 200;
  }

  // 8. GENERATE SLUG
  const slug = generateSlug(title);

  // 9. SEO OPTIMIZATION
  const cleanTitleForSeo = (orgName || title.replace(/\s*২০২৬.*$/, '')).trim();
  const focusKeyword = `${cleanTitleForSeo} নিয়োগ বিজ্ঞপ্তি ২০২৬`;
  const seoTitle = `${title.slice(0, 46)} | BDJobApply.site`;
  const effectiveTotalCount = totalCount > 0 ? totalCount : posts.reduce((a, b) => a + (b.count || 1), 0);
  const metaDescription = `${focusKeyword} প্রকাশিত হয়েছে। মোট ${effectiveTotalCount}টি শূন্যপদে সরাসরি অনলাইনে আবেদন চলছে। আবেদনের শেষ তারিখ ও পূর্ণ নিয়ম জানতে ক্লিক করুন।`.slice(0, 160);

  const tags = [
    focusKeyword,
    'সরকারি চাকরি',
    'নিয়োগ বিজ্ঞপ্তি ২০২৬',
    'টেলিটক আবেদন ২০২৬',
    'bd govt job circular 2026',
    'online job apply',
  ];
  if (orgName) {
    tags.push(`${orgName} চাকরি`);
  }
  if (applyLink.includes('teletalk')) {
    tags.push('teletalk circular');
    tags.push(applyLink.replace(/https?:\/\//i, '').split('/')[0]);
  }

  // 10. CLEAN & REPAIR HTML CONTENT (preserve all circular images intact!)
  const repairedContent = repairCorruptedJobHtml(formatJobContent(repairedInput));

  return {
    title,
    slug,
    category,
    deadline,
    applyLink,
    applicationFee,
    serviceCharge: 20,
    circularLink: '',
    posts,
    content: repairedContent,
    seoTitle,
    metaDescription,
    focusKeyword,
    tags,
  };
}
