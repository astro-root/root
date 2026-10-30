import type { APIRoute } from 'astro';
export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const row = await locals.db.prepare('SELECT mime, data FROM media WHERE id = ?').bind(params.id ?? '').first<{ mime: string; data: ArrayBuffer }>();
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(row.data, {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }
  });
};

// HEADはGETと同じステータス・ヘッダーで本文なしを返す（死活監視・リンクチェッカー対応）
export const HEAD: APIRoute = async (ctx) => {
  const res = await GET(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
};
