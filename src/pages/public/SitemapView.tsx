import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';

export const SitemapView: React.FC = () => {
  const [xmlContent, setXmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSitemap() {
      // 1. First try fetching the static sitemap.xml generated in public/dist
      try {
        const res = await fetch('/sitemap.xml', { headers: { Accept: 'application/xml, text/xml' } });
        if (res.ok) {
          const text = await res.text();
          if (text.includes('<urlset') && text.includes('https://bdjobapply.site')) {
            if (isMounted) {
              setXmlContent(text);
              setLoading(false);
            }
            return;
          }
        }
      } catch {
        // Fallback to dynamic generation
      }

      // 2. Dynamic generation fallback directly from Firestore
      try {
        const base = 'https://bdjobapply.site';
        const today = new Date().toISOString().split('T')[0];
        const urls = [
          { loc: `${base}/`, priority: '1.0', changefreq: 'hourly', lastmod: today },
          { loc: `${base}/jobs`, priority: '0.9', changefreq: 'hourly', lastmod: today },
          { loc: `${base}/login`, priority: '0.4', changefreq: 'monthly', lastmod: today },
          { loc: `${base}/register`, priority: '0.5', changefreq: 'monthly', lastmod: today },
        ];

        const q = query(collection(db, 'jobs'), where('status', '==', 'published'));
        const snap = await getDocs(q);
        snap.forEach((docItem) => {
          const data = docItem.data();
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
        });

        const generatedXml = `<?xml version="1.0" encoding="UTF-8"?>
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
</urlset>`;

        if (isMounted) {
          setXmlContent(generatedXml);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setXmlContent(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://bdjobapply.site/</loc>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://bdjobapply.site/jobs</loc>
    <priority>0.9</priority>
  </url>
</urlset>`);
          setLoading(false);
        }
      }
    }

    loadSitemap();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center text-sm font-mono text-gray-500">
        Loading sitemap.xml...
      </div>
    );
  }

  return (
    <pre
      style={{
        margin: 0,
        padding: '20px',
        backgroundColor: '#ffffff',
        color: '#111827',
        fontSize: '13px',
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        lineHeight: 1.5,
      }}
    >
      {xmlContent}
    </pre>
  );
};
