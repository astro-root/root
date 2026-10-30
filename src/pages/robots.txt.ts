import type { APIRoute } from 'astro';
export const prerender = false;
export const GET: APIRoute = ({ site, url }) => {
  const base = (site ?? url).origin;
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /search\n\nSitemap: ${base}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
};

// HEADはGETと同じステータス・ヘッダーで本文なしを返す（死活監視・リンクチェッカー対応）
export const HEAD: APIRoute = async (ctx) => {
  const res = await GET(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
};
