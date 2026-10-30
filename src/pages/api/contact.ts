import type { APIRoute } from 'astro';
import { clientKey, rateLimit } from '@/lib/auth';
import { validateContact } from '@/lib/contact';
import { json } from '@/lib/validate';

export const prerender = false;

const MAX_STORED = 5000; // DB肥大化・攻撃時の保護

async function verifyTurnstile(secret: string, token: string, ip: string | null) {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    return !!((await r.json()) as { success?: boolean }).success;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const db = locals.db;
  const wantsJson = (request.headers.get('Accept') ?? '').includes('application/json');
  const respond = (data: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) => {
    if (wantsJson) return json(data, status, headers);
    // JS無効時のフォールバック: 結果ページへリダイレクト
    const to = data.ok ? '/contact?sent=1' : `/contact?error=${status === 429 ? 'rate' : 'invalid'}`;
    return new Response(null, { status: 303, headers: { Location: to, ...headers } });
  };

  if (Number(request.headers.get('Content-Length') ?? 0) > 20_000) return respond({ ok: false, error: 'too_large' }, 413);

  let raw: Record<string, unknown> = {};
  try {
    const ct = request.headers.get('Content-Type') ?? '';
    raw = ct.includes('application/json') ? await request.json() : Object.fromEntries(await request.formData());
  } catch {
    return respond({ ok: false, error: 'bad_request' }, 400);
  }

  const key = await clientKey(request, env.IP_HASH_SALT);

  const rl = await rateLimit(db, `contact:ip:${key}`, 5, 3600);
  if (!rl.ok) return respond({ ok: false, error: 'rate_limited', message: '送信回数の上限に達しました。しばらくしてからお試しください。' }, 429, { 'Retry-After': String(rl.retryAfter) });

  // ハニーポット: ボットが埋める隠し項目。成功を装って保存しない
  if (typeof raw.website === 'string' && raw.website.trim() !== '') return respond({ ok: true });

  // 表示から送信までが極端に短い場合はボットとみなす
  const t = Number(raw._t);
  const elapsed = Date.now() - t;
  if (!Number.isFinite(t) || elapsed < 2500 || elapsed > 86_400_000) {
    return respond({ ok: false, error: 'too_fast', message: '送信に失敗しました。ページを再読み込みして、もう一度お試しください。' }, 400);
  }

  if (env.TURNSTILE_SECRET) {
    const token = String(raw['cf-turnstile-response'] ?? '');
    const ip = request.headers.get('CF-Connecting-IP');
    if (!token || !(await verifyTurnstile(env.TURNSTILE_SECRET, token, ip))) {
      return respond({ ok: false, error: 'captcha', message: 'スパム対策の確認に失敗しました。もう一度お試しください。' }, 400);
    }
  }

  const v = validateContact(raw);
  if (!v.ok) return respond({ ok: false, error: 'validation', errors: v.errors }, 400);

  const rlEmail = await rateLimit(db, `contact:email:${v.value.email}`, 3, 3600);
  if (!rlEmail.ok) return respond({ ok: false, error: 'rate_limited', message: '同じメールアドレスからの送信回数の上限に達しました。しばらくしてからお試しください。' }, 429, { 'Retry-After': String(rlEmail.retryAfter) });

  const total = await db.prepare('SELECT COUNT(*) AS n FROM contacts').first<{ n: number }>();
  if ((total?.n ?? 0) >= MAX_STORED) return respond({ ok: false, error: 'unavailable', message: '現在お問い合わせを受け付けられません。' }, 503);

  await db
    .prepare('INSERT INTO contacts (name, email, subject, message, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(v.value.name, v.value.email, v.value.subject, v.value.message, key)
    .run();

  return respond({ ok: true });
};
