import type { APIRoute } from 'astro';
import { SESSION_COOKIE, hashPassword, sha256Hex, verifyPassword, rateLimit } from '@/lib/auth';
import { admin } from '@/lib/api';
import { ValidationError, json } from '@/lib/validate';

export const prerender = false;

export const POST: APIRoute = admin(async ({ locals, cookies }, body) => {
  const db = locals.db;
  const me = locals.admin!;
  const rl = await rateLimit(db, `pw:${me.id}`, 5, 900);
  if (!rl.ok) return json({ ok: false, error: 'rate_limited', message: '試行回数が多すぎます。' }, 429);
  const current = String(body?.current ?? '');
  const next = String(body?.next ?? '');
  const row = await db.prepare('SELECT password_hash FROM admins WHERE id = ?').bind(me.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash))) throw new ValidationError({ current: '現在のパスワードが正しくありません。' });
  if (next.length < 12) throw new ValidationError({ next: '新しいパスワードは12文字以上にしてください。' });
  if (next.length > 200) throw new ValidationError({ next: 'パスワードが長すぎます。' });
  if (next === current) throw new ValidationError({ next: '現在と異なるパスワードを指定してください。' });
  await db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), me.id).run();
  // 他の端末のセッションを無効化（現在のセッションは維持）
  const keep = await sha256Hex(cookies.get(SESSION_COOKIE)?.value ?? '');
  await db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?').bind(me.id, keep).run();
  return json({ ok: true });
});
