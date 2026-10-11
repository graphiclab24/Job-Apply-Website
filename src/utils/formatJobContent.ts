/**
 * Smart Job Content Formatter & HTML Repair Engine
 *
 * Repairs corrupted HTML (nested <a>, corrupted <img src="<a href="...">">, doubled <p>)
 * and cleanly renders:
 * - Images (HTML <img>, Google Drive lh3 URLs, broken/truncated img tags auto-repaired)
 * - Markdown (# H1, ## H2, ### H3, **bold**, *italic*, - bullets, 1. numbered)
 * - Raw Bengali circular text (auto-detects headings, key-value bolding, bullet points)
 * - HTML tags (<h1>, <h2>, <h3>, <b>, <strong>, <i>, <ul>, <ol>, <table>, <a>, <img>)
 */

export function repairCorruptedJobHtml(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Repair <img src="<a href="URL"...>...</a>" ...>
  // Caused by regex linkifiers injecting <a> tags inside <img src="...">
  cleaned = cleaned.replace(
    /<img\s+src=["\x27]<a\s+href=["\x27](https?:\/\/[^\s"\x27]+)["\x27][^>]*>[\s\S]*?<\/a>["\x27]/gi,
    '<img src="$1"'
  );

  // 2. Repair broken <img tag where opening "<img src=" was stripped or cut off
  cleaned = cleaned.replace(
    /(?:<p[^>]*>\s*)?(?<!<img[^>]*src=["\x27])\b(https?:\/\/[^\s"\x27\<\>]+)["\x27]\s+alt=["\x27]([^"\x27]*)["\x27]\s+style=["\x27]([^"\x27]*)["\x27]\s*\/?>(\s*<\/p>)?/gi,
    '<p style="text-align:center; margin:16px 0;"><img src="$1" alt="$2" style="$3" /></p>'
  );

  // 3. Repair multiple nested <a> tags: e.g. <a href="..."><a href="...">...</a></a>
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(
      /<a\s+href=["\x27]([^"\x27]+)["\x27][^>]*>\s*<a\s+href=["\x27][^"\x27]*["\x27][^>]*>([\s\S]*?)<\/a>\s*<\/a>/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>'
    );
  } while (cleaned !== prev);

  // 4. Repair doubled/nested <p><p ...>
  cleaned = cleaned.replace(/<p>\s*<p\b([^>]*)>/gi, '<p$1>').replace(/<\/p>\s*<\/p>/gi, '</p>');

  return cleaned;
}

export function formatJobContent(content: string): string {
  if (!content) return '';

  // Step 1: Run comprehensive HTML repair
  let text = repairCorruptedJobHtml(content.trim());

  // Step 2: If the content is ALREADY complete semantic HTML (has <h1>/<h3>/<p> tags)
  // return it directly without running plain-text line parser!
  const hasHtmlStructure =
    /<(h[1-6]|table|ul|ol)\b/i.test(text) ||
    (/<p\b/i.test(text) && /<\/p>/i.test(text) && text.split(/<\/(?:p|h[1-6]|ul|ol|table)>/i).length > 2);

  if (hasHtmlStructure) {
    // Only repair inline markdown (bold/italic) and preserve all existing HTML structure
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    text = text.replace(/__(.*?)__/g, '<b>$1</b>');
    return repairCorruptedJobHtml(text);
  }

  // Step 3: Raw plain-text / Markdown circular parsing
  // Process inline markdown:
  text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__(.*?)__/g, '<b>$1</b>');
  text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');

  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  let inBulletList = false;
  let inNumberedList = false;
  let inTableBlock = false;
  let tableBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();

    // Check for HTML table block pass-through
    if (/<table[\s>]/i.test(rawLine) || inTableBlock) {
      closeLists();
      tableBuffer.push(rawLine);
      if (/<\/table>/i.test(rawLine)) {
        result.push(tableBuffer.join('\n'));
        tableBuffer = [];
        inTableBlock = false;
      } else {
        inTableBlock = true;
      }
      continue;
    }

    // Blank line
    if (!rawLine) {
      closeLists();
      continue;
    }

    // Standalone image URL on its own line:
    // e.g. https://lh3.googleusercontent.com/d/1Uu-lpfn4PBFsxVh0FtQpngWRuRZkCXT-
    const isStandaloneImageUrl =
      /^https?:\/\/[^\s<"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s<"']*)?$/i.test(rawLine) ||
      /^https:\/\/lh3\.googleusercontent\.com\/d\/[a-zA-Z0-9_-]+$/i.test(rawLine);
    if (isStandaloneImageUrl) {
      closeLists();
      result.push(
        `<p style="text-align:center; margin:16px 0;"><img src="${rawLine}" alt="চাকরির সার্কুলার ইমেজ" style="max-width:100%; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin:12px auto; display:block;" /></p>`
      );
      continue;
    }

    // Lines containing existing <img> tags: preserve as-is without touching
    if (/<img[\s>]/i.test(rawLine)) {
      closeLists();
      if (!rawLine.startsWith('<p')) {
        result.push(`<p style="text-align:center; margin:16px 0;">${rawLine}</p>`);
      } else {
        result.push(rawLine);
      }
      continue;
    }

    // Explicit HTML Block Headings: <h1>, <h2>, <h3>, <h4>
    if (/^<h[1-4][\s>]/i.test(rawLine)) {
      closeLists();
      result.push(rawLine);
      continue;
    }

    // Markdown H1 (# Heading)
    const h1Match = rawLine.match(/^#\s+(.+)$/);
    if (h1Match) {
      closeLists();
      result.push(`<h1>${formatInlineStyles(h1Match[1])}</h1>`);
      continue;
    }

    // Markdown H2 (## Heading)
    const h2Match = rawLine.match(/^##\s+(.+)$/);
    if (h2Match) {
      closeLists();
      result.push(`<h2>${formatInlineStyles(h2Match[1])}</h2>`);
      continue;
    }

    // Markdown H3 (### Heading)
    const h3Match = rawLine.match(/^###\s+(.+)$/);
    if (h3Match) {
      closeLists();
      result.push(`<h3>${formatInlineStyles(h3Match[1])}</h3>`);
      continue;
    }

    // Blockquote
    const quoteMatch = rawLine.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      closeLists();
      result.push(`<blockquote>${formatInlineStyles(quoteMatch[1])}</blockquote>`);
      continue;
    }

    // Bullet list (-, *, •, ▪)
    const bulletMatch = rawLine.match(/^[-*•▪]\s*(.+)$/);
    if (bulletMatch) {
      if (!inBulletList) {
        if (inNumberedList) {
          result.push('</ol>');
          inNumberedList = false;
        }
        result.push('<ul>');
        inBulletList = true;
      }
      result.push(`<li>${formatInlineStyles(bulletMatch[1])}</li>`);
      continue;
    }

    // Numbered list (1., 2., ১., ২., etc.)
    const numberedMatch = rawLine.match(/^([0-9১-৯]+)[.)]\s*(.+)$/);
    if (numberedMatch) {
      if (!inNumberedList) {
        if (inBulletList) {
          result.push('</ul>');
          inBulletList = false;
        }
        result.push('<ol>');
        inNumberedList = true;
      }
      result.push(`<li>${formatInlineStyles(numberedMatch[2])}</li>`);
      continue;
    }

    // Close open lists for regular paragraphs
    closeLists();

    // Section headings detection in BD job circulars
    const isJobHeading =
      rawLine.endsWith(':') ||
      rawLine.endsWith('ঃ') ||
      /^(পদের নাম|শিক্ষাগত যোগ্যতা|বয়সসীমা|বয়স সীমা|আবেদনের নিয়ম|আবেদন প্রক্রিয়া|বেতন স্কেল|শর্তাবলী|আবেদনের শেষ তারিখ|প্রয়োজনীয় কাগজপত্র|ফি পরিশোধের নিয়ম|আবেদন সংক্রান্ত সাধারণ তথ্যাবলি)/i.test(
        rawLine
      );

    if (isJobHeading && rawLine.length < 90 && !rawLine.startsWith('<p')) {
      result.push(`<h3>${formatInlineStyles(rawLine)}</h3>`);
      continue;
    }

    // If already wrapped in <p>, keep it
    if (rawLine.startsWith('<p') && rawLine.endsWith('</p>')) {
      result.push(rawLine);
      continue;
    }

    // Normal paragraph line
    result.push(`<p>${formatInlineStyles(rawLine)}</p>`);
  }

  closeLists();

  if (tableBuffer.length > 0) {
    result.push(tableBuffer.join('\n'));
  }

  return repairCorruptedJobHtml(result.join('\n'));

  function closeLists() {
    if (inBulletList) {
      result.push('</ul>');
      inBulletList = false;
    }
    if (inNumberedList) {
      result.push('</ol>');
      inNumberedList = false;
    }
  }
}

/**
 * Format inline text (bolding key: value pairs, URLs, dates)
 */
function formatInlineStyles(text: string): string {
  // If line contains key: value (e.g. "শিক্ষাগত যোগ্যতা: এইচএসসি পাশ"), bold the key:
  let formatted = text.replace(
    /^([^:\n<]{2,30})[:ঃ]\s*(.+)$/,
    '<b>$1:</b> $2'
  );

  formatted = formatInlineLinks(formatted);
  return formatted;
}

/**
 * Turns plain text URLs into clickable links safely without breaking HTML tags or attributes
 */
function formatInlineLinks(text: string): string {
  // If the line already has <a or <img, do NOT alter it!
  if (/<a\s|<img\s/i.test(text)) {
    return text;
  }
  return text.replace(/(https?:\/\/[^\s<"']+)/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
