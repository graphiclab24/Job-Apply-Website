import React, { useEffect, useState } from 'react';

export const RobotsView: React.FC = () => {
  const [robotsTxt, setRobotsTxt] = useState<string>(`# Robots.txt for https://bdjobapply.site
User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /dashboard
Disallow: /dashboard/
Disallow: /apply/
Disallow: /api/

User-agent: Googlebot
Allow: /
Allow: /jobs
Allow: /jobs/*

User-agent: Bingbot
Allow: /
Allow: /jobs
Allow: /jobs/*

Sitemap: https://bdjobapply.site/sitemap.xml
`);

  useEffect(() => {
    fetch('/robots.txt')
      .then((res) => {
        if (res.ok) return res.text();
        return null;
      })
      .then((text) => {
        if (text && text.includes('User-agent')) {
          setRobotsTxt(text);
        }
      })
      .catch(() => {});
  }, []);

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
      {robotsTxt}
    </pre>
  );
};
