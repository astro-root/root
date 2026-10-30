import type { APIRoute } from 'astro';
import { admin } from '@/lib/api';
import { sanitizePost } from '@/lib/admin-schema';
import { SLUG_RE, ValidationError, json } from '@/lib/validate';

export const prerender = false;

export const POST: APIRoute = admin(async ({ locals }, body) => {
  const db = locals.db;
  const p = sanitizePost(body);
  const original = typeof body.original === 'string' && body.original ? body.original : null;
  const now = new Date().toISOString();
  const vals = [p.title, p.excerpt, p.body_md, p.category, JSON.stringify(p.tags), p.thumbnail, p.thumbnail_alt, p.featured ? 1 : 0, p.state, p.published_at, p.seo_title, p.seo_description, now];

  if (!original) {
    if (await db.prepare('SELECT 1 FROM posts WHERE slug = ?').bind(p.slug).first()) throw new ValidationError({ slug: 'このスラッグは既に使われています。' });
    await db.prepare('INSERT INTO posts (slug,title,excerpt,body_md,category,tags,thumbnail,thumbnail_alt,featured,state,published_at,seo_title,seo_description,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(p.slug, ...vals).run();
  } else {
    if (!SLUG_RE.test(original) || !(await db.prepare('SELECT 1 FROM posts WHERE slug = ?').bind(original).first())) return json({ ok: false, error: 'not_found' }, 404);
    if (original !== p.slug && (await db.prepare('SELECT 1 FROM posts WHERE slug = ?').bind(p.slug).first())) throw new ValidationError({ slug: 'このスラッグは既に使われています。' });
    await db.prepare('UPDATE posts SET slug=?,title=?,excerpt=?,body_md=?,category=?,tags=?,thumbnail=?,thumbnail_alt=?,featured=?,state=?,published_at=?,seo_title=?,seo_description=?,updated_at=? WHERE slug=?').bind(p.slug, ...vals, original).run();
  }
  return json({ ok: true, slug: p.slug });
});

export const DELETE: APIRoute = admin(async ({ locals, url }) => {
  const r = await locals.db.prepare('DELETE FROM posts WHERE slug = ?').bind(url.searchParams.get('slug') ?? '').run();
  return json({ ok: true, deleted: r.meta.changes });
});
