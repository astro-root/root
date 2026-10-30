import type { APIRoute } from 'astro';
import { admin } from '@/lib/api';
import { ValidationError, clean, json } from '@/lib/validate';

export const prerender = false;

export const POST: APIRoute = admin(async ({ locals }, body) => {
  const id = Math.floor(Number(body?.id));
  if (!Number.isInteger(id) || id < 1) throw new ValidationError({ id: 'IDが不正です。' });
  if (!['new', 'in_progress', 'done'].includes(body.status)) throw new ValidationError({ status: 'ステータスが不正です。' });
  const r = await locals.db.prepare('UPDATE contacts SET status = ?, admin_note = ? WHERE id = ?').bind(body.status, clean(body.admin_note, 3000), id).run();
  if (!r.meta.changes) return json({ ok: false, error: 'not_found' }, 404);
  return json({ ok: true });
});

export const DELETE: APIRoute = admin(async ({ locals, url }) => {
  // 保存期間の経過した問い合わせを一括削除: DELETE /api/admin/contacts?olderThanDays=365
  const older = url.searchParams.get('olderThanDays');
  if (older !== null) {
    const days = Math.floor(Number(older));
    if (!Number.isInteger(days) || days < 1) throw new ValidationError({ olderThanDays: '日数が不正です。' });
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    const r = await locals.db.prepare('DELETE FROM contacts WHERE created_at < ?').bind(cutoff).run();
    return json({ ok: true, deleted: r.meta.changes });
  }
  const id = Math.floor(Number(url.searchParams.get('id')));
  const r = await locals.db.prepare('DELETE FROM contacts WHERE id = ?').bind(id).run();
  return json({ ok: true, deleted: r.meta.changes });
});
