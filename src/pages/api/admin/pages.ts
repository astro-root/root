import type { APIRoute } from 'astro';
import { admin } from '@/lib/api';
import { sanitizePage } from '@/lib/admin-schema';
import { savePage } from '@/lib/content';
import { json } from '@/lib/validate';

export const prerender = false;

export const POST: APIRoute = admin(async ({ locals }, body) => {
  const p = sanitizePage(String(body?.slug), body);
  await savePage(locals.db, p);
  return json({ ok: true });
});
