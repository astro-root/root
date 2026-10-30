import type { APIRoute } from 'astro';
import { admin } from '@/lib/api';
import { renderMarkdown } from '@/lib/markdown';
import { json } from '@/lib/validate';

export const prerender = false;

// 公開ページと同じレンダラー（サニタイズ込み）でプレビューを返す
export const POST: APIRoute = admin(async (_ctx, body) => {
  const md = typeof body?.md === 'string' ? body.md.slice(0, 100000) : '';
  return json({ html: renderMarkdown(md).html });
});
