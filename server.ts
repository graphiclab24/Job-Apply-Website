import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { formatJobContent, repairCorruptedJobHtml, purgeCompetitorBranding } from './src/utils/formatJobContent';
import { extractJobLocally } from './src/utils/localJobExtractor';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

// Initialize Google Gemini API using modern @google/genai SDK
const ai = new GoogleGenAI();

/**
 * Resilient Gemini generator with retry and automatic fallback for transient 503/429 spikes
 */
async function generateWithGemini(prompt: string, jsonMode: boolean = false): Promise<string> {
  const models = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: jsonMode ? { responseMimeType: 'application/json' } : undefined,
        });
        if (res.text) return res.text;
      } catch (err: any) {
        console.warn(`Model ${model} (attempt ${attempt}) notice: ${err?.message || err}.`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }
  }

  throw new Error('AI মডেলটি বর্তমানে ব্যস্ত রয়েছে।');
}

/**
 * AI-Powered Professional Job Circular Formatter
 * Takes raw/messy text from newspapers, PDFs, or circulars and transforms it
 * into an executive, super-premium, highly readable semantic HTML structure.
 */
app.post('/api/ai/format-job', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'কনটেন্ট প্রদান করা আবশ্যক' });
    }

    const cleanInputContent = purgeCompetitorBranding(content.trim());

    const systemPrompt = `You are a Senior Editor and HTML Specialist for Bangladesh Government & Private Job Portals.
Your job is to transform raw, messy, or semi-formatted job circular text into an EXECUTIVE, SUPER-PREMIUM, HIGH-CONVERSION HTML LAYOUT.

CRITICAL INSTRUCTIONS:
1. TOTAL PURGE OF COMPETITOR WEBSITES, APPS & WATERMARKS:
   - STRICT COMPETITOR BLACKLIST: You MUST COMPLETELY REMOVE and NEVER MENTION "Jobs Exam Alert", "Job Exam Alert", "জব এক্সাম এলার্ট", "জবস এক্সাম এলার্ট", "চাকরির পরীক্ষার এলার্ট", or ANY Android/iOS app marketing (e.g. "Android App: Jobs Exam Alert", "Download Jobs Exam Alert", "Android App", "Play Store").
   - You MUST COMPLETELY REMOVE any competitor website domain, competitor Android/iOS app name, Play Store download links, Facebook page, Telegram link, YouTube channel, or watermark (e.g. "Jobs Exam Alert", "Chakrir Khobor", "Bdjobs", "Alljobs", "Daily Jobs", "চাকরির খবর অ্যাপ", "আমাদের অ্যাপ", "প্লে স্টোর", etc.).
   - NEVER put "Jobs Exam Alert" or any competitor's website or app name at the top or anywhere in the circular!
   - The title and headings must strictly reflect the OFFICIAL BANGLADESH GOVERNMENT MINISTRY, DEPARTMENT, OR HIRING AUTHORITY.
   - The ONLY allowed external URLs are official government application portals (e.g., https://*.teletalk.com.bd, *.gov.bd) and user's own site bdjobapply.site.

2. EXECUTIVE, SUPER-PREMIUM HTML STRUCTURE:
   A. [HIGHLIGHTS SUMMARY TABLE]:
      At the very top, build a sleek two-column <table> with <thead> and <tbody>:
      <thead><tr><th colspan="2">📌 এক নজরে নিয়োগ বিজ্ঞপ্তির সারসংক্ষেপ</th></tr></thead>
      <tbody>
        <tr><td><b>প্রতিষ্ঠানের নাম:</b></td><td>[Official Ministry / Dept]</td></tr>
        <tr><td><b>মোট পদসংখ্যা:</b></td><td>[Total vacancies e.g. ৪৩টি পদ]</td></tr>
        <tr><td><b>চাকরির ধরন:</b></td><td>[সরকারি চাকরি / স্বায়ত্তশাসিত / বেসরকারি]</td></tr>
        <tr><td><b>শিক্ষাগত যোগ্যতা:</b></td><td>[SSC / HSC / Degree / Honors]</td></tr>
        <tr><td><b>বয়সসীমা:</b></td><td>[১৮ থেকে ৩২ বছর (কোটা অনুসারে)]</td></tr>
        <tr><td><b>আবেদনের মাধ্যম:</b></td><td>অনলাইন (টেলিটক)</td></tr>
        <tr><td><b>আবেদনের লিংক:</b></td><td><a href="[official teletalk link]" target="_blank">[domain]</a></td></tr>
        <tr><td><b>আবেদনের শেষ তারিখ ও সময়:</b></td><td><span style="color:#b91c1c; font-weight:bold;">[End date & time]</span></td></tr>
      </tbody>
   B. [POSTS & VACANCIES TABLE]:
      <h3>📋 পদের বিবরণ, শূন্যপদ ও শিক্ষাগত যোগ্যতা</h3>
      If multiple positions exist, format into a clean HTML <table>:
      <thead><tr><th>ক্রমিক</th><th>পদের নাম ও গ্রেড</th><th>পদসংখ্যা</th><th>শিক্ষাগত যোগ্যতা ও অভিজ্ঞতা</th><th>বেতন স্কেল</th></tr></thead>
      <tbody>...</tbody>
   C. [APPLICATION GUIDELINES]:
      <h3>📝 অনলাইনে আবেদন করার নিয়মাবলী ও শর্তাবলি</h3>
      Structured with <ul><li> points highlighting official requirements, age limits, photo/signature sizes (300x300, 300x80), and quotas.
   D. [TELETALK SMS INSTRUCTIONS]:
      <h3>📲 টেলিটক SMS ও আবেদন ফি জমা দেওয়ার নিয়ম</h3>
      Use <ol><li> for Step 1 (আবেদন ফরম পূরণ) and Step 2 (১ম ও ২য় SMS ফরম্যাট).
   E. [IMPORTANT DATES]:
      <h3>⏳ জরুরি তারিখ ও সময়সীমা</h3>
      <ul>
        <li><b>আবেদন শুরুর তারিখ ও সময়:</b> [Start date]</li>
        <li><b>আবেদনের শেষ তারিখ ও সময়:</b> [End date]</li>
      </ul>
   F. [IMAGE PRESERVATION]:
      PRESERVE ANY <img ...> TAGS EXACTLY AS THEY ARE! Center inside <p style="text-align:center; margin:20px 0;"><img ... /></p>.
   G. [OFFICIAL ALERT]:
      Use <blockquote> for special official warnings or quota notices.

3. OUTPUT FORMAT:
   - Return ONLY the clean, ready-to-render HTML body snippet.
   - Do NOT wrap in markdown code fences (no \`\`\`html or \`\`\`).
   - Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags.

Raw Circular Text:
${cleanInputContent}`;

    let formattedHtml = '';
    try {
      formattedHtml = await generateWithGemini(systemPrompt, false);
      formattedHtml = formattedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();
      formattedHtml = repairCorruptedJobHtml(formattedHtml);
    } catch (aiErr: any) {
      console.warn('Gemini format-job transient notice, fallback to smart formatter:', aiErr?.message);
      formattedHtml = repairCorruptedJobHtml(formatJobContent(cleanInputContent));
    }

    res.json({ formattedHtml });
  } catch (err: any) {
    console.error('Job formatting error:', err);
    res.status(500).json({ error: err.message || 'Formatting failed' });
  }
});

/**
 * Scrape competitor job page and convert HTML into readable text
 */
async function scrapeJobPageText(pageUrl: string): Promise<string> {
  let url = pageUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('অবৈধ লিঙ্ক ফরম্যাট। অনুগ্রহ করে একটি সঠিক ওয়েবসাইট লিংক দিন।');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('অবৈধ লিঙ্ক প্রোটোকল। শুধুমাত্র http:// বা https:// সাপোর্ট করে।');
  }

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  ];

  let lastStatus = 0;
  let html = '';

  for (const ua of userAgents) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'bn,en-US;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });

      lastStatus = response.status;
      if (response.ok) {
        html = await response.text();
        if (html && html.length > 100) break;
      }
    } catch (err: any) {
      console.warn(`Fetch attempt with UA failed: ${err.message}`);
    }
  }

  if (!html) {
    if (lastStatus === 403 || lastStatus === 401) {
      throw new Error(
        `প্রতিযোগী সাইটটি সরাসরি লিংক স্ক্র্যাপ করা ব্লক করেছে (Cloudflare/HTTP ${lastStatus})। অনুগ্রহ করে সেই পেজের টেক্সটগুলো কপি করে "📝 টেক্সট পেস্ট করুন" ট্যাবে পেস্ট করুন, AI মুহূর্তেই সম্পূর্ণ ফর্ম পূরণ করবে!`
      );
    }
    throw new Error(
      `ওয়েবসাইট থেকে তথ্য লোড করা যায়নি (HTTP ${lastStatus || 'টাইমআউট'})। অনুগ্রহ করে সেই পেজের টেক্সটগুলো কপি করে "📝 টেক্সট পেস্ট করুন" ট্যাবে পেস্ট করুন।`
    );
  }

  // Strip non-content tags
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  const text = cleanHtml
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  return text.slice(0, 18000);
}

/**
 * AI Competitor Outranking & Full Job Circular Extractor
 * Accepts a competitor URL or raw circular text, extracts all structured fields,
 * and generates superior, non-duplicate, high-SEO metadata for bdjobapply.site.
 */
app.post('/api/ai/extract-job', async (req: Request, res: Response) => {
  try {
    const { url, rawText } = req.body;

    if (!url && (!rawText || !rawText.trim())) {
      return res.status(400).json({ error: 'ওয়েবসাইট লিংক অথবা সার্কুলার টেক্সট প্রদান করুন' });
    }

    let sourceText = '';
    if (url && typeof url === 'string') {
      try {
        sourceText = await scrapeJobPageText(url.trim());
      } catch (scrapeErr: any) {
        return res.status(400).json({
          error: `লিংক থেকে ডাটা সংগ্রহ করা যায়নি: ${scrapeErr.message || 'নেটওয়ার্ক এরর'}`,
        });
      }
    } else {
      sourceText = String(rawText).trim();
    }

    // Purge competitor app names, sites and watermarks from the source text immediately
    sourceText = purgeCompetitorBranding(sourceText);

    if (!sourceText || sourceText.length < 30) {
      return res.status(400).json({ error: 'পর্যাপ্ত সার্কুলার তথ্য পাওয়া যায়নি' });
    }

    const extractionPrompt = `You are an elite SEO Strategist and Senior Job Editor for Bangladesh Employment Portals (bdjobapply.site).
A raw job circular text is provided:

--- SOURCE TEXT ---
${sourceText}
--- END SOURCE TEXT ---

Your goal:
Analyze this notice and generate a COMPLETE, FACTUAL, HIGH-CONVERTING, SUPER-PREMIUM EXECUTIVE JOB CIRCULAR that WILL OUTRANK ALL COMPETITORS ON GOOGLE SEARCH.

CRITICAL DIRECTIVES:
1. STRICT ZERO-COMPETITOR POLICY:
   - ABSOLUTE COMPETITOR BLACKLIST: You MUST COMPLETELY PURGE and NEVER MENTION "Jobs Exam Alert", "Job Exam Alert", "জব এক্সাম এলার্ট", "জবস এক্সাম এলার্ট", "চাকরির পরীক্ষার এলার্ট", "Bdjobs", "Chakrir Khobor", "Alljobs", "Daily Jobs", or ANY Android/iOS app promotion (e.g. "Android App: Jobs Exam Alert", "Download App", "Play Store").
   - The "title" MUST NEVER contain competitor app or website names! The title MUST start with the official Government Ministry / Department / Organization name (e.g. "যুব ও ক্রীড়া মন্ত্রণালয়ে ক্রীড়া পরিদপ্তরে ৪৩ পদে বিশাল নিয়োগ বিজ্ঞপ্তি ২০২৬").
   - Replace any brand references with "BD Job Apply" or the official government hiring authority.

2. EXECUTIVE, SUPER-PREMIUM HTML CONTENT ("content" field):
   - "content" MUST NOT be plain or basic! It must be an executive, modern HTML presentation:
     A. At the top of "content": A sleek summary <table> with <thead> (<tr><th colspan="2">📌 এক নজরে নিয়োগ বিজ্ঞপ্তির সারসংক্ষেপ</th></tr>) and <tbody> key-value rows (প্রতিষ্ঠানের নাম, মোট পদসংখ্যা, চাকরির ধরন, শিক্ষাগত যোগ্যতা, বয়সসীমা, আবেদনের মাধ্যম, আবেদনের লিংক, আবেদনের শেষ তারিখ ও সময়).
     B. <h3>📋 পদের বিবরণ ও শিক্ষাগত যোগ্যতা</h3> with an HTML <table> (columns: ক্রমিক, পদের নাম, পদসংখ্যা, শিক্ষাগত যোগ্যতা, বেতন স্কেল).
     C. <h3>📝 অনলাইনে আবেদন করার নিয়মাবলী ও শর্তাবলি</h3> with clean <ul><li> guidelines.
     D. <h3>📲 টেলিটক SMS ও আবেদন ফি জমা দেওয়ার নিয়ম</h3> with step-by-step <ol><li>.
     E. <h3>⏳ জরুরি তারিখ ও সময়সীমা</h3> with start & deadline dates.
     F. If source text contains an <img ...> tag, PRESERVE IT and center it in <p style="text-align:center; margin:20px 0;"><img ... /></p>.

3. HIGH-CTR SEO METADATA:
   - "title": Highly clickable, official title starting with Ministry / Dept name (e.g. "যুব ও ক্রীড়া মন্ত্রণালয়ে ক্রীড়া পরিদপ্তরে ৪৩ পদে বিশাল নিয়োগ বিজ্ঞপ্তি ২০২৬").
   - "seoTitle": High-CTR SEO title ending with "| BDJobApply.site" (max 65 chars).
   - "slug": Clean, hyphenated Bengali or English SEO slug (e.g. "krira-poridoptor-job-circular-2026").
   - "metaDescription": 145-160 characters. Begins with primary keyword, includes vacancy count, qualifications, deadline, and Teletalk online application details.
   - "focusKeyword": The single highest-volume Google search query for this job (e.g. "ক্রীড়া পরিদপ্তর নিয়োগ বিজ্ঞপ্তি ২০২৬").
   - "tags": Array of 8 to 12 relevant search tags (organization name in Bengali and English, Teletalk subdomain e.g. "ds.teletalk.com.bd", "সরকারি চাকরি", "টেলিটক সার্কুলার"). NEVER include competitor names.

4. DATES, FEES & LINKS:
   - "category": One of "govt", "bank", "private", "railway", "defense", "education", "other".
   - "deadline": ISO format "YYYY-MM-DDTHH:mm" (e.g. "2026-10-30T16:00"). If time not given, use "23:59".
   - "applyLink": Official application URL (e.g. "https://ds.teletalk.com.bd").
   - "circularLink": Official PDF link if found, else empty string.
   - "applicationFee": Number (e.g. 100, 200, 223, 334, 500). If not found, 0.
   - "serviceCharge": 20 (standard).

RESPOND IN PURE JSON (no markdown fences, no \`\`\`json):
{
  "title": "string",
  "slug": "string",
  "category": "govt",
  "deadline": "2026-10-30T16:00",
  "applyLink": "https://ds.teletalk.com.bd",
  "applicationFee": 200,
  "serviceCharge": 20,
  "circularLink": "",
  "posts": [{"name": "পদের নাম", "count": 5, "district": "ALL"}],
  "content": "HTML string",
  "seoTitle": "string",
  "metaDescription": "string",
  "focusKeyword": "string",
  "tags": ["tag1", "tag2"]
}`;

    try {
      let rawJson = await generateWithGemini(extractionPrompt, true);
      rawJson = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

      const parsedData = JSON.parse(rawJson);

      // Sanitize fields against competitor watermarks and corruptions
      if (parsedData.title) {
        parsedData.title = purgeCompetitorBranding(parsedData.title);
      }
      if (parsedData.slug) {
        parsedData.slug = purgeCompetitorBranding(parsedData.slug)
          .replace(/(?:jobs?[-_]?exam[-_]?al[a-z]*t|bdjobs|chakrir[-_]?khobor)/gi, '')
          .replace(/--+/g, '-')
          .replace(/^-|-$/g, '');
      }
      if (parsedData.content) {
        parsedData.content = repairCorruptedJobHtml(purgeCompetitorBranding(parsedData.content));
      }
      if (parsedData.seoTitle) {
        parsedData.seoTitle = purgeCompetitorBranding(parsedData.seoTitle);
      }
      if (parsedData.metaDescription) {
        parsedData.metaDescription = purgeCompetitorBranding(parsedData.metaDescription);
      }
      if (parsedData.focusKeyword) {
        parsedData.focusKeyword = purgeCompetitorBranding(parsedData.focusKeyword);
      }
      if (Array.isArray(parsedData.tags)) {
        parsedData.tags = parsedData.tags
          .map((t: string) => purgeCompetitorBranding(t).trim())
          .filter((t: string) => t.length > 1 && !/(?:bdjobs|chakrir|alljobs|jobs?\s*exam|al[a-z]*t)/i.test(t));
      }

      return res.json(parsedData);
    } catch (aiErr: any) {
      console.warn('Gemini extraction notice, falling back to instant local smart extractor:', aiErr?.message);
      const fallbackData = extractJobLocally(sourceText);
      if (fallbackData.title) fallbackData.title = purgeCompetitorBranding(fallbackData.title);
      if (fallbackData.content) fallbackData.content = repairCorruptedJobHtml(purgeCompetitorBranding(fallbackData.content));
      if (Array.isArray(fallbackData.tags)) {
        fallbackData.tags = fallbackData.tags
          .map((t: string) => purgeCompetitorBranding(t).trim())
          .filter((t: string) => t.length > 1 && !/(?:bdjobs|chakrir|alljobs|jobs?\s*exam|al[a-z]*t)/i.test(t));
      }
      return res.json(fallbackData);
    }
  } catch (err: any) {
    console.error('Job extraction error:', err);
    res.status(500).json({ error: err.message || 'এক্সট্রাকশন সম্পন্ন করা যায়নি' });
  }
});

// Dev vs Production server mounting
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distDir = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Job portal full-stack server running on port ${port}`);
});
