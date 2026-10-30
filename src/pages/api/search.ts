import type { APIRoute } from 'astro';
import { search } from '@/lib/content';
import { json } from '@/lib/validate';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const q = (url.searchParams.get('q') ?? '').slice(0, 100);
  if (!q.trim()) return json({ hits: [] });
  const hits = await search(locals.db, q);
  // 公開コンテンツのみを返すので短時間のキャッシュを許可
  return json({ hits }, 200, { 'Cache-Control': 'public, max-age=30' });
};

// HEADはGETと同じステータス・ヘッダーで本文なしを返す（死活監視・リンクチェッカー対応）
export const HEAD: APIRoute = async (ctx) => {
  const res = await GET(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
};
