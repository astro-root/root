import type { APIRoute } from 'astro';
import { SESSION_COOKIE, clearSessionCookie, destroySession } from '@/lib/auth';
import { json } from '@/lib/validate';

export const prerender = false;

export const POST: APIRoute = async ({ locals, cookies, url }) => {
  await destroySession(locals.db, cookies.get(SESSION_COOKIE)?.value);
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', clearSessionCookie(url.protocol === 'https:'));
  return res;
};
