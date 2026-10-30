// 認証: PBKDF2-SHA256 + サーバー側セッション(D1) + CSRFトークン。
// ※ Cloudflare Workers の WebCrypto は PBKDF2 の反復回数が最大100000。
const ITERATIONS = 100_000;
const SESSION_DAYS = 7;
export const SESSION_COOKIE = 'rl_session';

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf: Uint8Array) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const n = Math.min(parseInt(iter, 10) || ITERATIONS, ITERATIONS);
  const derived = await pbkdf2(password, unb64(salt), n);
  return timingSafeEqual(b64(derived), hash);
}

// ユーザー不在時にも同等の計算を行い、応答時間の差でアカウント有無が分からないようにする
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
export async function dummyVerify(password: string) {
  await verifyPassword(password, DUMMY_HASH);
}

export interface SessionAdmin { id: number; email: string; role: string; csrf: string }

export async function createSession(db: D1Database, adminId: number) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const csrf = b64url(crypto.getRandomValues(new Uint8Array(24)));
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await db
    .prepare('INSERT INTO sessions (token_hash, admin_id, csrf, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), adminId, csrf, expires)
    .run();
  // 期限切れセッションを掃除
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export async function getSessionAdmin(db: D1Database, token: string | undefined): Promise<SessionAdmin | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT a.id, a.email, a.role, s.csrf FROM sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .bind(await sha256Hex(token), new Date().toISOString())
    .first<SessionAdmin>();
  return row ?? null;
}

export async function destroySession(db: D1Database, token: string | undefined) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

export function sessionCookie(token: string, maxAge: number, secure: boolean) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
export function clearSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

// ---- レート制限（D1。固定ウィンドウ）
export async function rateLimit(db: D1Database, key: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
       RETURNING count, window_start`
    )
    .bind(key, now, now - windowSec)
    .first<{ count: number; window_start: number }>();
  if (Math.random() < 0.02) {
    await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86400).run();
  }
  const count = row?.count ?? 1;
  const start = row?.window_start ?? now;
  return { ok: count <= limit, retryAfter: Math.max(1, start + windowSec - now) };
}

export async function clientKey(request: Request, salt: string | undefined): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'local';
  return (await sha256Hex(`${salt ?? 'unsalted'}:${ip}`)).slice(0, 32);
}
