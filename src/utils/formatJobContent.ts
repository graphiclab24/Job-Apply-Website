/**
 * Smart Job Content Formatter, HTML Repair & Competitor Purge Engine
 *
 * Transforms raw Bengali circular text or semi-structured HTML into
 * an executive, visually attractive, super-premium layout while completely
 * purging competitor apps, websites, watermarks, and slogans.
 */

/**
 * Purges competitor app names, competitor websites, watermarks, channels & promos
 */
export function purgeCompetitorBranding(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // 1. Remove non-official external competitor website URLs:
  // Preserves: .gov.bd, teletalk.com.bd, bdjobapply.site, googleusercontent.com, googleapis.com
  cleaned = cleaned.replace(
    /https?:\/\/(?!(?:[a-zA-Z0-9-]+\.)*(?:gov\.bd|teletalk\.com\.bd|bdjobapply\.site|googleusercontent\.com|googleapis\.com))[a-zA-Z0-9.-]+\.[a-z]{2,}(?:\/[^\s<"']*)?/gi,
    ''
  );

  // 2. Line by line purge of competitor promotional text, app notices, watermarks
  const lines = cleaned.split(/\r?\n/);
  const filteredLines = lines.filter((line) => {
    const raw = line.trim();
    if (!raw) return true;

    // Check for competitor app / promo triggers
    if (
      /(?:jobs?\s*exam\s*al[a-z]*t|job\s*alert|exam\s*alert|জব(?:স)?\s*(?:এক্সাম|পরীক্ষা|পরিক্ষা)\s*(?:অ্যালার্ট|এলার্ট|এল্যার্ট)|চাকরি(?:র)?\s*(?:পরীক্ষা|পরিক্ষা|এক্সাম)\s*(?:এলার্ট|অ্যালার্ট)|android\s*app|প্লে\s*স্টোর|play\.google\.com|আমাদের\s*অ্যাপ|অ্যাপটি\s*(?:ডাউনলোড|নামিয়ে|ইন্সটল)|অ্যাপে\s*স্বাগতম|অ্যাপ\s*থেকে|অ্যাপের\s*মাধ্যমে|bdjobs|alljobs|chakrir\s*khobor|daily\s*job|career\s*bangladesh|priyo\s*job|bdjobstoday|chakri\.com|আমাদের\s*ওয়েবসাইট|আমাদের\s*(?:অফিসিয়াল\s*)?ফেসবুক|টেলিগ্রাম\s*(?:গ্রুপ|চ্যানেল)|সবার\s*আগে\s*(?:সকল\s*)?চাকরির)/i.test(
        raw
      )
    ) {
      return false; // drop competitor line completely!
    }

    return true;
  });

  cleaned = filteredLines.join('\n');

  // 3. Remove inline competitor watermarks, app mentions & empty tags
  const inlinePurgePatterns = [
    /\bandroid\s*app\s*[:\s-]*[^\n<,.]*(?:jobs?\s*exam\s*al[a-z]*t|al[a-z]*t)[^\n<,.]*/gi,
    /\bjobs?\s*exam\s*al[a-z]*t\b[a-z0-9.-]*/gi,
    /\bjob\s*alert\b/gi,
    /\bexam\s*alert\b/gi,
    /জব(?:স)?\s*(?:এক্সাম|পরীক্ষা|পরিক্ষা)\s*(?:অ্যালার্ট|এলার্ট|এল্যার্ট|অ্যালার্টটি|এলার্টটি)/gi,
    /চাকরি(?:র)?\s*(?:পরীক্ষা|পরিক্ষা|এক্সাম)\s*(?:অ্যালার্ট|এলার্ট)/gi,
    /\b(?:bdjobs|alljobs|chakrir\s*khobor|daily\s*job|career\s*bangladesh|priyo\s*job)[a-z0-9.-]*\s*(?:app|website|\.com|\.net)?/gi,
    /\bandroid\s*app\b/gi,
    /অ্যাপটি\s*ডাউনলোড\s*করুন/gi,
    /প্লে\s*স্টোর\s*থেকে/gi,
  ];

  for (const pat of inlinePurgePatterns) {
    cleaned = cleaned.replace(pat, '');
  }

  cleaned = cleaned.replace(/<a\b[^>]*href=["\x27]\s*["\x27][^>]*>([\s\S]*?)<\/a>/gi, '$1');
  cleaned = cleaned.replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, '');

  return cleaned.trim();
}

/**
 * Repairs corrupted HTML (nested <a>, broken <img src="<a href="...">">, doubled <p>)
 */
export function repairCorruptedJobHtml(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Repair <img src="<a href="URL"...>...</a>" ...>
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

/**
 * Transforms circular content into an executive, super-premium layout
 */
export function formatJobContent(content: string): string {
  if (!content) return '';

  // Step 1: Purge competitor branding & repair corrupted HTML
  let text = purgeCompetitorBranding(content.trim());
  text = repairCorruptedJobHtml(text);

  // Step 2: Check if content already contains a semantic <table> or styled structure
  const hasHtmlStructure =
    /<(h[1-6]|table|ul|ol)\b/i.test(text) ||
    (/<p\b/i.test(text) && /<\/p>/i.test(text) && text.split(/<\/(?:p|h[1-6]|ul|ol|table)>/i).length > 2);

  if (hasHtmlStructure) {
    // Polish existing HTML:
    // Ensure headings have icons and polish
    text = text
      .replace(/<h3>এক নজরে[^<]*<\/h3>/gi, '<h3>📌 এক নজরে নিয়োগ বিজ্ঞপ্তির সারসংক্ষেপ</h3>')
      .replace(/<h3>পদের বিবরণ[^<]*<\/h3>/gi, '<h3>📋 পদের বিবরণ, পদসংখ্যা ও শিক্ষাগত যোগ্যতা</h3>')
      .replace(/<h3>গুরুত্বপূর্ণ তারিখ[^<]*<\/h3>/gi, '<h3>⏳ জরুরি তারিখ ও সময়সীমা</h3>')
      .replace(/<h3>আবেদনের (?:শর্তাবলী|নিয়মাবলী)[^<]*<\/h3>/gi, '<h3>📝 অনলাইনে আবেদন করার নিয়ম ও শর্তাবলি</h3>')
      .replace(/<h3>টেলিটক এসএমএস[^<]*<\/h3>/gi, '<h3>📲 টেলিটক SMS ও আবেদন ফি জমা দেওয়ার নিয়ম</h3>');

    // Format markdown bold/italic
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/__(.*?)__/g, '<b>$1</b>');

    return repairCorruptedJobHtml(text);
  }

  // Step 3: Raw plain-text / Markdown circular parsing into executive HTML
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
    const isStandaloneImageUrl =
      /^https?:\/\/[^\s<"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s<"']*)?$/i.test(rawLine) ||
      /^https:\/\/lh3\.googleusercontent\.com\/d\/[a-zA-Z0-9_-]+$/i.test(rawLine);
    if (isStandaloneImageUrl) {
      closeLists();
      result.push(
        `<p style="text-align:center; margin:20px 0;"><img src="${rawLine}" alt="চাকরির সার্কুলার ইমেজ" style="max-width:100%; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.08); margin:12px auto; display:block;" /></p>`
      );
      continue;
    }

    // Lines containing existing <img> tags: preserve
    if (/<img[\s>]/i.test(rawLine)) {
      closeLists();
      if (!rawLine.startsWith('<p')) {
        result.push(`<p style="text-align:center; margin:20px 0;">${rawLine}</p>`);
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
      /^(এক নজরে|পদের বিবরণ|শিক্ষাগত যোগ্যতা|বয়সসীমা|বয়স সীমা|আবেদনের নিয়ম|আবেদন প্রক্রিয়া|বেতন স্কেল|শর্তাবলী|আবেদনের শেষ তারিখ|প্রয়োজনীয় কাগজপত্র|ফি পরিশোধের নিয়ম|আবেদন সংক্রান্ত সাধারণ তথ্যাবলি)/i.test(
        rawLine
      );

    if (isJobHeading && rawLine.length < 90 && !rawLine.startsWith('<p')) {
      let icon = '📌';
      if (/পদের বিবরণ|শিক্ষাগত যোগ্যতা/i.test(rawLine)) icon = '📋';
      else if (/তারিখ|সময়সীমা/i.test(rawLine)) icon = '⏳';
      else if (/নিয়ম|শর্তাবলী/i.test(rawLine)) icon = '📝';
      else if (/টেলিটক|এসএমএস|ফি/i.test(rawLine)) icon = '📲';
      else if (/সতর্কতা/i.test(rawLine)) icon = '⚠️';

      result.push(`<h3>${icon} ${formatInlineStyles(rawLine)}</h3>`);
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
  let formatted = text.replace(/^([^:\n<]{2,30})[:ঃ]\s*(.+)$/, '<b>$1:</b> $2');
  formatted = formatInlineLinks(formatted);
  return formatted;
}

/**
 * Turns plain text URLs into clickable links safely without breaking HTML tags or attributes
 */
function formatInlineLinks(text: string): string {
  if (/<a\s|<img\s/i.test(text)) {
    return text;
  }
  return text.replace(/(https?:\/\/[^\s<"']+)/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
