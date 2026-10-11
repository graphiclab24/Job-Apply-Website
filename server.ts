import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { repairCorruptedJobHtml } from './src/utils/formatJobContent';

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
  const models = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const model of models) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: jsonMode ? { responseMimeType: 'application/json' } : undefined,
        });
        if (res.text) return res.text;
      } catch (err: any) {
        console.warn(`Model ${model} attempt ${attempt + 1} notice: ${err?.message || err}.`);
        // If transient, wait briefly before next attempt
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  throw new Error('AI মডেলটি বর্তমানে ব্যস্ত রয়েছে। অনুগ্রহ করে কয়েক সেকেন্ড পর পুনরায় চেষ্টা করুন।');
}

/**
 * AI-Powered Professional Job Circular Formatter
 * Takes raw/messy text from newspapers, PDFs, or circulars and transforms it
 * into executive, structured, semantic HTML with tables, headings, and badges.
 */
app.post('/api/ai/format-job', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'কনটেন্ট প্রদান করা আবশ্যক' });
    }

    const systemPrompt = `You are a Senior Editor and HTML Specialist for Bangladesh Government & Private Job Portals.
Your job is to transform raw, messy, or semi-formatted job circular text into clean, high-conversion, executive semantic HTML.

STRICT INSTRUCTIONS:
1. PRESERVE ALL ORIGINAL DATA FAITHFULLY:
   - Do NOT invent, drop, or alter dates, job titles, vacancy numbers, salaries, grades, fees, districts, or educational requirements.
   - PRESERVE ANY IMAGE TAGS (<img ...>) OR IMAGE URLS EXACTLY AS THEY ARE. DO NOT alter, strip, or corrupt any <img ...> tags!

2. STRUCTURE & SECTIONS:
   - Use clean, semantic HTML: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <b>, <strong>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <blockquote>.
   - Divide the circular into clear logical sections with <h3> headings:
     - <h3>পদের বিবরণ ও শূন্যপদের সংখ্যা:</h3>
     - <h3>শিক্ষাগত যোগ্যতা ও অভিজ্ঞতা:</h3>
     - <h3>বেতন স্কেল ও গ্রেড:</h3>
     - <h3>বয়সসীমা:</h3>
     - <h3>আবেদনের শর্তাবলী ও নিয়মাবলী:</h3>
     - <h3>টেলিটক এসএমএস ও ফি পরিশোধের নিয়ম:</h3>
     - <h3>জরুরি তারিখ ও সময়সীমা:</h3>
   - If there are multiple positions and qualifications, format them into a clean, responsive HTML <table> with <thead> and <tbody> (columns: পদের নাম, পদসংখ্যা, শিক্ষাগত যোগ্যতা, বেতন স্কেল) OR crisp, well-structured bullet lists.
   - Bold key labels (e.g., <b>পদের নাম:</b>, <b>পদসংখ্যা:</b>, <b>শিক্ষাগত যোগ্যতা:</b>, <b>বেতন স্কেল:</b>, <b>আবেদনের শেষ তারিখ:</b>).
   - Use <ol><li> for numbered step-by-step instructions.
   - Use <ul><li> for general terms and requirements.
   - Use <blockquote> for critical alerts, quota notices, or special warnings.

3. MOBILE-RESPONSIVE & CLEAN BANGLA TYPOGRAPHY:
   - Ensure clean Bengali phrasing without broken linebreaks or repetitive whitespace.
   - All external website links should be clean: <a href="..." target="_blank" rel="noopener noreferrer">...</a> (DO NOT touch URLs already inside <img src="...">).

4. OUTPUT FORMAT:
   - Return ONLY the clean, ready-to-render HTML body snippet.
   - Do NOT wrap in markdown code fences (no \`\`\`html or \`\`\`).
   - Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags.

Raw Circular Text to Format:
${content.trim()}`;

    let formattedHtml = await generateWithGemini(systemPrompt, false);
    // Strip any markdown codeblock backticks if returned
    formattedHtml = formattedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();
    formattedHtml = repairCorruptedJobHtml(formattedHtml);

    res.json({ formattedHtml });
  } catch (err: any) {
    console.error('Gemini job formatting error:', err);
    res.status(500).json({ error: err.message || 'AI formatting failed' });
  }
});

/**
 * Scrape competitor job page and convert HTML into readable text
 */
async function scrapeJobPageText(pageUrl: string): Promise<string> {
  const parsed = new URL(pageUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('অবৈধ লিঙ্ক প্রোটোকল। শুধুমাত্র http/https সাপোর্ট করে।');
  }

  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'bn,en-US;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`ওয়েবসাইট থেকে তথ্য লোড করা যায়নি (HTTP ${response.status})`);
  }

  const html = await response.text();

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

    if (!sourceText || sourceText.length < 30) {
      return res.status(400).json({ error: 'পর্যাপ্ত সার্কুলার তথ্য পাওয়া যায়নি' });
    }

    const extractionPrompt = `You are an elite SEO Strategist and Senior Job Editor for Bangladesh Employment Portals (bdjobapply.site).
A competitor website or user provided the following raw job circular text:

--- SOURCE TEXT ---
${sourceText}
--- END SOURCE TEXT ---

Your goal:
Analyze this notice and generate a COMPLETE, FACTUAL, HIGH-CONVERTING, PREMIUM JOB CIRCULAR that WILL OUTRANK THE COMPETITOR ON GOOGLE SEARCH.

CRITICAL SEO & OUTRANKING DIRECTIVES:
1. NEVER COPY COMPETITOR SENTENCES VERBATIM:
   - Re-synthesize the circular in an authoritative, structured, and official Bengali tone.
   - Strictly preserve all factual numbers, dates, deadlines, qualifications, post counts, and official Teletalk URLs.

2. STRUCTURED POSTS & HTML CONTENT:
   - "content": Must be executive, mobile-friendly semantic HTML with clean <h3> headings, bullet lists, bold labels, and if multiple posts exist, format them into a clean <table> with <thead> and <tbody> (columns: পদের নাম, পদসংখ্যা, শিক্ষাগত যোগ্যতা, বেতন স্কেল).
   - "posts": Extract each post into array of objects: [{ name: "string", count: number, district: "ALL" }].

3. HIGH-CTR SEO METADATA:
   - "title": Highly clickable, comprehensive title (e.g. "যুব ও ক্রীড়া মন্ত্রণালয়ে ক্রীড়া পরিদপ্তরে ৪৩ পদে বিশাল নিয়োগ বিজ্ঞপ্তি ২০২৬").
   - "seoTitle": High-CTR SEO title ending with "| BDJobApply.site" (max 65 chars).
   - "slug": Clean, hyphenated Bengali or English SEO slug (e.g. "krira-poridoptor-job-circular-2026").
   - "metaDescription": 145-160 characters. Must begin with the primary keyword, include total post count, qualifications, deadline, and Teletalk online application details.
   - "focusKeyword": The single highest-volume Google search query for this job (e.g. "ক্রীড়া পরিদপ্তর নিয়োগ বিজ্ঞপ্তি ২০২৬").
   - "tags": Array of 8 to 12 relevant search tags (covering organization name in Bengali and English, Teletalk subdomain e.g. "ds.teletalk.com.bd", "সরকারি চাকরি", "টেলিটক সার্কুলার").

4. DATES, FEES & LINKS:
   - "category": One of "govt", "bank", "private", "railway", "defense", "education", "other".
   - "deadline": ISO format "YYYY-MM-DDTHH:mm" (e.g. "2026-10-30T16:00"). If time not given, use "23:59".
   - "applyLink": Official application URL (e.g. "http://ds.teletalk.com.bd").
   - "circularLink": Official PDF link if found, else empty string.
   - "applicationFee": Number (e.g. 100, 200, 223, 334, 500). If not found, 0.
   - "serviceCharge": 20 (standard).

RESPOND IN PURE JSON (no markdown fences, no \`\`\`json):
{
  "title": "string",
  "slug": "string",
  "category": "govt",
  "deadline": "2026-10-30T16:00",
  "applyLink": "http://ds.teletalk.com.bd",
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

    let rawJson = await generateWithGemini(extractionPrompt, true);
    rawJson = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    const parsedData = JSON.parse(rawJson);

    // Sanitize content HTML
    if (parsedData.content) {
      parsedData.content = repairCorruptedJobHtml(parsedData.content);
    }

    res.json(parsedData);
  } catch (err: any) {
    console.error('Gemini job extraction error:', err);
    res.status(500).json({ error: err.message || 'AI এক্সট্রাকশন ব্যর্থ হয়েছে' });
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
