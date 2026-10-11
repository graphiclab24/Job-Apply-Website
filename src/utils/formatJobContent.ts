/**
 * Smart Job Content Formatter & Markdown-HTML Parser
 * Seamlessly handles:
 * - Images (HTML <img>, Google Drive lh3 URLs, broken/truncated img tags auto-repaired)
 * - Markdown (# H1, ## H2, ### H3, **bold**, *italic*, - bullets, 1. numbered)
 * - Raw Bengali circular text (auto-detects headings, key-value bolding, bullet points)
 * - HTML tags (<h1>, <h2>, <h3>, <b>, <strong>, <i>, <ul>, <ol>, <table>, <a>, <img>)
 */

export function formatJobContent(content: string): string {
  if (!content) return '';

  let text = content.trim();

  // 1. Process inline markdown:
  // **bold** or __bold__ -> <b>...</b>
  text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__(.*?)__/g, '<b>$1</b>');
  // *italic* or _italic_ -> <i>...</i>
  text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');

  // 2. Parse lines
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

    // AUTO-REPAIR 1: Truncated <img> tag missing the opening '<img src="'
    // e.g. https://lh3.googleusercontent.com/d/..." alt="..." style="..." />
    const brokenImgMatch = rawLine.match(/^(https?:\/\/[^\s"']+)"\s+alt="([^"]*)"\s+style="([^"]*)"\s*\/?>/i);
    if (brokenImgMatch) {
      closeLists();
      result.push(
        `<p style="text-align:center; margin:16px 0;"><img src="${brokenImgMatch[1]}" alt="${brokenImgMatch[2] || 'Circular Image'}" style="${brokenImgMatch[3]}" /></p>`
      );
      continue;
    }

    // AUTO-REPAIR 2: Standalone image URL on its own line
    // e.g. https://lh3.googleusercontent.com/d/1Uu-lpfn4PBFsxVh0FtQpngWRuRZkCXT-
    // or https://example.com/image.jpg
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

    // AUTO-PRESERVE 3: Lines containing valid <img> tags
    // e.g. <p style="..."><img src="..." ... /></p> or <img src="..." />
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
      result.push(formatInlineLinks(rawLine));
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
    // (e.g. "পদের বিবরণ:", "শিক্ষাগত যোগ্যতা:", "আবেদনের নিয়মাবলী:", "শর্তাবলী:", "প্রয়োজনীয় কাগজপত্র:")
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

    // If already wrapped in <p>, keep it but format inline styles safely
    if (rawLine.startsWith('<p') && rawLine.endsWith('</p>')) {
      result.push(formatInlineLinks(rawLine));
      continue;
    }

    // Normal paragraph line
    result.push(`<p>${formatInlineStyles(rawLine)}</p>`);
  }

  closeLists();

  if (tableBuffer.length > 0) {
    result.push(tableBuffer.join('\n'));
  }

  return result.join('\n');

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
  // Matches HTML tags (<...>) and preserves them untouched; only linkifies raw URLs outside tags
  return text.replace(/(<[^>]+>)|((https?:\/\/[^\s<"']+))/gi, (match, htmlTag, rawUrl) => {
    if (htmlTag) return htmlTag;
    return `<a href="${rawUrl}" target="_blank" rel="noopener noreferrer">${rawUrl}</a>`;
  });
}
