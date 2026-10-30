import type { APIRoute } from 'astro';
import { admin } from '@/lib/api';
import { sanitizeProject } from '@/lib/admin-schema';
import { SLUG_RE, ValidationError, json } from '@/lib/validate';

export const prerender = false;

export const POST: APIRoute = admin(async ({ locals }, body) => {
  const db = locals.db;
  const p = sanitizeProject(body);
  const original = typeof body.original === 'string' && body.original ? body.original : null;
  const now = new Date().toISOString();
  const vals = [p.title, p.summary, p.body_md, p.category, p.status, p.year, JSON.stringify(p.technology), p.url, p.github, p.thumbnail, p.thumbnail_alt, p.featured ? 1 : 0, p.sort_order, p.state, p.published_at, now];

  if (!original) {
    if (await db.prepare('SELECT 1 FROM projects WHERE id = ?').bind(p.id).first()) throw new ValidationError({ id: 'このスラッグは既に使われています。' });
    await db.prepare('INSERT INTO projects (id,title,summary,body_md,category,status,year,technology,url,github,thumbnail,thumbnail_alt,featured,sort_order,state,published_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(p.id, ...vals).run();
  } else {
    if (!SLUG_RE.test(original) || !(await db.prepare('SELECT 1 FROM projects WHERE id = ?').bind(original).first())) return json({ ok: false, error: 'not_found' }, 404);
    if (original !== p.id && (await db.prepare('SELECT 1 FROM projects WHERE id = ?').bind(p.id).first())) throw new ValidationError({ id: 'このスラッグは既に使われています。' });
    await db.prepare('UPDATE projects SET id=?,title=?,summary=?,body_md=?,category=?,status=?,year=?,technology=?,url=?,github=?,thumbnail=?,thumbnail_alt=?,featured=?,sort_order=?,state=?,published_at=?,updated_at=? WHERE id=?').bind(p.id, ...vals, original).run();
  }
  return json({ ok: true, id: p.id });
});

export const DELETE: APIRoute = admin(async ({ locals, url }) => {
  const id = url.searchParams.get('id') ?? '';
  const r = await locals.db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  return json({ ok: true, deleted: r.meta.changes });
});
