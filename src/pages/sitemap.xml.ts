import type { APIRoute } from 'astro';
import { listPosts, listProjects } from '@/lib/content';

export const prerender = false;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const GET: APIRoute = async ({ locals, site, url }) => {
  const base = (site ?? url).origin;
  const [projects, posts] = await Promise.all([listProjects(locals.db), listPosts(locals.db)]);
  const entries: { loc: string; lastmod?: string }[] = [
    ...['/', '/projects', '/blog', '/about', '/contact', '/terms', '/privacy'].map((p) => ({ loc: base + p })),
    ...projects.map((p) => ({ loc: `${base}/projects/${p.id}`, lastmod: p.updated_at.slice(0, 10) })),
    ...posts.map((p) => ({ loc: `${base}/blog/${p.slug}`, lastmod: p.updated_at.slice(0, 10) }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map((e) => `  <url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
};

// HEADはGETと同じステータス・ヘッダーで本文なしを返す（死活監視・リンクチェッカー対応）
export const HEAD: APIRoute = async (ctx) => {
  const res = await GET(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
};
