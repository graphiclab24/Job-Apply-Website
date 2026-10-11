import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

// Initialize Google Gemini API using modern @google/genai SDK
const ai = new GoogleGenAI();

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
   - Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt },
            { text: `Raw Circular Text to Format:\n\n${content.trim()}` },
          ],
        },
      ],
    });

    let formattedHtml = response.text || '';
    // Strip any markdown codeblock backticks if returned
    formattedHtml = formattedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();

    res.json({ formattedHtml });
  } catch (err: any) {
    console.error('Gemini job formatting error:', err);
    res.status(500).json({ error: err.message || 'AI formatting failed' });
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
