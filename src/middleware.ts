import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, getSessionAdmin, timingSafeEqual } from '@/lib/auth';

const LEGACY: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/notes\/?$/i, () => '/blog'],
  [/^\/notes\/(.+)$/i, (m) => `/blog/${m[1]}`],
  [/^\/note\/?$/i, () => '/blog'],
  [/^\/note\/(.+)$/i, (m) => `/blog/${m[1]}`],
  [/^\/blog\/(.+)\/$/i, (m) => `/blog/${m[1]}`]
];

function securityHeaders(res: Response, isAdmin: boolean, turnstile: boolean) {
  const h = res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${turnstile ? ' https://challenges.cloudflare.com' : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      turnstile ? 'frame-src https://challenges.cloudflare.com' : "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  );
  if (isAdmin) {
    h.set('Cache-Control', 'no-store');
    h.set('X-Robots-Tag', 'noindex, nofollow');
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals, cookies } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 旧URL → /blog への 301（チェーンを作らない）
  if (request.method === 'GET' || request.method === 'HEAD') {
    for (const [re, to] of LEGACY) {
      const m = path.match(re);
      if (m) return Response.redirect(new URL(to(m) + url.search, url).toString(), 301);
    }
  }

  const db = locals.runtime?.env?.DB;
  locals.db = db as D1Database;

  const isAdminPage = path === '/admin' || path.startsWith('/admin/');
  const isAdminApi = path.startsWith('/api/admin/');
  const isLogin = path === '/admin/login' || path === '/api/admin/login';
  const turnstile = !!import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;

  // 状態を変更するリクエスト（GET/HEAD/OPTIONS以外）は、全パスで同一オリジンのみ受け付ける（CSRF/クロスサイト送信対策）
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    const site = request.headers.get('Sec-Fetch-Site');
    const sameOrigin = origin ? origin === url.origin : site === 'same-origin' || site === 'none';
    if (!sameOrigin) {
      return path.startsWith('/api/')
        ? new Response(JSON.stringify({ error: 'forbidden_origin' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
        : new Response('Forbidden', { status: 403 });
    }
  }

  if ((isAdminPage || isAdminApi) && !isLogin) {
    const admin = db ? await getSessionAdmin(db, cookies.get(SESSION_COOKIE)?.value) : null;
    if (!admin) {
      if (isAdminApi) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
      return Response.redirect(new URL('/admin/login', url).toString(), 302);
    }
    locals.admin = admin;
    // 変更系の管理APIはCSRFトークン必須
    if (isAdminApi && !['GET', 'HEAD'].includes(request.method)) {
      const ct = request.headers.get('Content-Type') ?? '';
      let token = request.headers.get('X-CSRF-Token') ?? '';
      if (!token && ct.includes('form')) {
        token = String((await request.clone().formData()).get('_csrf') ?? '');
      }
      if (!token || !timingSafeEqual(token, admin.csrf)) {
        return new Response(JSON.stringify({ error: 'invalid_csrf' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
    }
  }

  const response = await next();
  // Responseのヘッダーがimmutableな場合に備えて複製
  const out = new Response(response.body, response);
  securityHeaders(out, isAdminPage || isAdminApi, turnstile);
  return out;
});
