import fs from 'fs';
import path from 'path';

const BASE = 'https://bdjobapply.site';
const R2 = 'https://files.bdjobapply.site';
const OUT_DIR = 'public';
const today = new Date().toISOString().split('T')[0];

// আর্কাইব URL সাইটম্যাপে যাবে (SEO)। JobDetailsPage-এ আর্কাইব ফলব্যাক না থাকলে এটি false রাখুন।
const INCLUDE_ARCHIVE = true;

async function getJson(url, fallback) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`Sitemap: ${url} → HTTP ${res.status}, এড়িয়ে যাওয়া হলো`);
      return fallback;
    }
    return await res.json();
  } catch (err) {
    console.warn(`Sitemap: ${url} পড়া যায়নি (${err.message}), এড়িয়ে যাওয়া হলো`);
    return fallback;
  }
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const dateOnly = (v, fallback = today) => {
  if (!v) return fallback;
  const d = new Date(v);
  return isNaN(d.getTime()) ? fallback : d.toISOString().split('T')[0];
};

const jobUrl = (slug) => `${BASE}/jobs/${encodeURIComponent(slug)}`;

function urlsetXml(urls) {
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${esc(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function sitemapIndexXml(files) {
  const body = files
    .map(
      (f) => `  <sitemap>
    <loc>${esc(f.loc)}</loc>
    <lastmod>${f.lastmod}</lastmod>
  </sitemap>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`;
}

// আগের বারের আর্কাইব সাইটম্যাপ মুছে ফেলা (মাস বদলালে পুরনো ফাইল থাকবে না)
function cleanOldArchiveSitemaps() {
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (/^sitemap-archive-\d{4}-\d{2}\.xml$/.test(f)) {
      fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }
}

async function generateSitemaps() {
  const children = [];

  // ১. স্ট্যাটিক পেজ
  const staticUrls = [
    { loc: `${BASE}/`, priority: '1.0', changefreq: 'hourly', lastmod: today },
    { loc: `${BASE}/jobs`, priority: '0.9', changefreq: 'hourly', lastmod: today },
    { loc: `${BASE}/login`, priority: '0.4', changefreq: 'monthly', lastmod: today },
    { loc: `${BASE}/register`, priority: '0.5', changefreq: 'monthly', lastmod: today },
  ];
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap-static.xml'), urlsetXml(staticUrls));
  children.push({ loc: `${BASE}/sitemap-static.xml`, lastmod: today });

  // ২. চলমান সার্কুলার (R2 jobs.json, শুধু চলমান)
  const active = await getJson(`${R2}/jobs.json`, []);
  const activeUrls = (Array.isArray(active) ? active : [])
    .filter((j) => j && j.status !== 'draft')
    .map((j) => ({
      loc: jobUrl(j.slug || j.id),
      priority: '0.8',
      changefreq: 'daily',
      lastmod: dateOnly(j.updatedAt || j.publishedAt, today),
    }));
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap-active.xml'), urlsetXml(activeUrls));
  children.push({ loc: `${BASE}/sitemap-active.xml`, lastmod: today });
  console.log(`Sitemap: ${activeUrls.length}টি চলমান সার্কুলার`);

  // ৩. আর্কাইব: মাস অনুযায়ী আলাদা সাইটম্যাপ (R2 index.json থেকে)
  if (INCLUDE_ARCHIVE) {
    cleanOldArchiveSitemaps();
    const index = await getJson(`${R2}/jobs/archive/index.json`, []);
    const byMonth = new Map();
    for (const e of Array.isArray(index) ? index : []) {
      if (!e || !e.month || !e.slug) continue;
      if (!byMonth.has(e.month)) byMonth.set(e.month, []);
      byMonth.get(e.month).push(e);
    }

    const months = [...byMonth.keys()].sort().reverse();
    for (const month of months) {
      const list = byMonth.get(month);
      const urls = list.map((e) => ({
        loc: jobUrl(e.slug),
        priority: '0.5',
        changefreq: 'monthly',
        lastmod: dateOnly(e.deadline, today),
      }));
      const file = `sitemap-archive-${month}.xml`;
      fs.writeFileSync(path.join(OUT_DIR, file), urlsetXml(urls));
      children.push({ loc: `${BASE}/${file}`, lastmod: today });
    }
    console.log(`Sitemap: ${months.length}টি আর্কাইব মাস, মোট ${index.length || 0}টি সার্কুলার`);
  }

  // ৪. ইনডেক্স: সকল সাইটম্যাপের তালিকা
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), sitemapIndexXml(children));
  console.log(`Generated sitemap index with ${children.length} sitemap files`);
}

generateSitemaps()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
