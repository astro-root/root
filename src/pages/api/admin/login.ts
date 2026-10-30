import type { APIRoute } from 'astro';
import { SESSION_COOKIE, clientKey, createSession, dummyVerify, rateLimit, sessionCookie, verifyPassword } from '@/lib/auth';
import { EMAIL_RE, json } from '@/lib/validate';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const db = locals.db;
  let body: { email?: unknown; password?: unknown } = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';

  const key = await clientKey(request, locals.runtime.env.IP_HASH_SALT);
  const byIp = await rateLimit(db, `login:ip:${key}`, 10, 900);
  const byEmail = await rateLimit(db, `login:email:${email || '-'}`, 5, 900);
  if (!byIp.ok || !byEmail.ok) {
    return json({ ok: false, error: 'rate_limited', message: '試行回数が多すぎます。しばらくしてからお試しください。' }, 429, { 'Retry-After': String(Math.max(byIp.retryAfter, byEmail.retryAfter)) });
  }

  const fail = () => json({ ok: false, error: 'invalid_credentials', message: 'メールアドレスまたはパスワードが正しくありません。' }, 401);
  if (!EMAIL_RE.test(email) || !password) { await dummyVerify(password); return fail(); }

  const admin = await db.prepare('SELECT id, password_hash FROM admins WHERE email = ?').bind(email).first<{ id: number; password_hash: string }>();
  if (!admin) { await dummyVerify(password); return fail(); }
  if (!(await verifyPassword(password, admin.password_hash))) return fail();

  const { token, maxAge } = await createSession(db, admin.id);
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', sessionCookie(token, maxAge, url.protocol === 'https:'));
  return res;
};
