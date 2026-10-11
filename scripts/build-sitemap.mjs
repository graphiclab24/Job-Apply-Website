import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

export async function generateSitemap() {
  const base = 'https://bdjobapply.site';
  const today = new Date().toISOString().split('T')[0];

  const urls = [
    { loc: `${base}/`, priority: '1.0', changefreq: 'hourly', lastmod: today },
    { loc: `${base}/jobs`, priority: '0.9', changefreq: 'hourly', lastmod: today },
    { loc: `${base}/login`, priority: '0.4', changefreq: 'monthly', lastmod: today },
    { loc: `${base}/register`, priority: '0.5', changefreq: 'monthly', lastmod: today },
  ];

  try {
    const snap = await getDocs(collection(db, 'jobs'));
    snap.forEach((docItem) => {
      const data = docItem.data();
      if (data.status === 'published' || !data.status) {
        const slug = data.slug || docItem.id;
        let lastmod = today;
        if (data.updatedAt?.toDate) {
          lastmod = data.updatedAt.toDate().toISOString().split('T')[0];
        } else if (data.createdAt?.toDate) {
          lastmod = data.createdAt.toDate().toISOString().split('T')[0];
        }
        urls.push({
          loc: `${base}/jobs/${encodeURIComponent(slug)}`,
          priority: '0.8',
          changefreq: 'daily',
          lastmod,
        });
      }
    });
  } catch (err) {
    console.warn('Sitemap Firestore query note:', err.message);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  fs.writeFileSync('public/sitemap.xml', xml);
  console.log(`Generated public/sitemap.xml with ${urls.length} entries`);
  process.exit(0);
}

generateSitemap().catch((err) => {
  console.error(err);
  process.exit(1);
});
