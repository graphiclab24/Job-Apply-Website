/**
 * Smart Job Content Formatter & Markdown-HTML Parser
 * Seamlessly handles:
 * - Markdown (# H1, ## H2, ### H3, **bold**, *italic*, - bullets, 1. numbered)
 * - Raw Bengali circular text (auto-detects headings, key-value bolding, bullet points)
 * - HTML tags (<h1>, <h2>, <h3>, <b>, <strong>, <i>, <ul>, <ol>, <table>, <a>, <img>)
 */

export function formatJobContent(content: string): string {
  if (!content) return '';

  let text = content.trim();

  // 1. Process inline markdown everywhere:
  // **bold** or __bold__ -> <b>...</b>
  text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__(.*?)__/g, '<b>$1</b>');
  // *italic* or _italic_ -> <i>...</i>
  text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');

  // If text already has full semantic HTML paragraphs/divs enclosing everything,
  // we do a light pass to ensure links and inline styles are clean and return:
  const isFullHtmlDocument = /^<(p|div|section|article)[\s>]/i.test(text) && /<\/(p|div|section|article)>$/i.test(text);
  if (isFullHtmlDocument) {
    return formatInlineLinks(text);
  }

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
      if (inBulletList) {
        result.push('</ul>');
        inBulletList = false;
      }
      if (inNumberedList) {
        result.push('</ol>');
        inNumberedList = false;
      }

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
      if (inBulletList) {
        result.push('</ul>');
        inBulletList = false;
      }
      if (inNumberedList) {
        result.push('</ol>');
        inNumberedList = false;
      }
      continue;
    }

    // Explicit HTML Block Headings: <h1>, <h2>, <h3>, <h4>
    if (/^<h[1-4][\s>]/i.test(rawLine)) {
      if (inBulletList) {
        result.push('</ul>');
        inBulletList = false;
      }
      if (inNumberedList) {
        result.push('</ol>');
        inNumberedList = false;
      }
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

    if (isJobHeading && rawLine.length < 90 && !rawLine.startsWith('<p>')) {
      result.push(`<h3>${formatInlineStyles(rawLine)}</h3>`);
      continue;
    }

    // If already wrapped in <p>, keep it but format inline styles
    if (rawLine.startsWith('<p>') && rawLine.endsWith('</p>')) {
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
 * Turns plain text URLs into clickable links safely
 */
function formatInlineLinks(text: string): string {
  // Turn raw URLs into clickable anchor tags (if not already inside an href)
  return text.replace(
    /(?<!href=["'])(https?:\/\/[^\s<"']+)/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}
