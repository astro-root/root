import { DEFAULT_SETTINGS, SETTING_KEYS, type Settings } from './defaults';
import { parseJsonArray } from './validate';
import { plainText } from './markdown';

const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------------ Settings
function merge<T>(base: T, over: unknown): T {
  if (Array.isArray(base)) return (Array.isArray(over) ? over : base) as T;
  if (base && typeof base === 'object') {
    const o = (over && typeof over === 'object' ? over : {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(base as object)) out[k] = merge((base as Record<string, unknown>)[k], o[k]);
    return out as T;
  }
  return (typeof over === typeof base ? over : base) as T;
}

export async function getSettings(db: D1Database): Promise<Settings> {
  let rows: { key: string; value: string }[] = [];
  try {
    rows = (await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()).results;
  } catch {
    /* 未マイグレーション時は既定値で動作 */
  }
  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try { stored[r.key] = JSON.parse(r.value); } catch { /* 壊れた値は無視 */ }
  }
  const out = {} as Record<string, unknown>;
  for (const k of SETTING_KEYS) out[k] = merge(DEFAULT_SETTINGS[k], stored[k]);
  return out as unknown as Settings;
}

export async function saveSetting(db: D1Database, key: keyof Settings, value: unknown) {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3`
    )
    .bind(key, JSON.stringify(value), nowIso())
    .run();
}

// ------------------------------------------------------------------ Pages
export interface PageRow { slug: string; title: string; description: string; body_md: string; meta: Record<string, any>; updated_at: string }

export async function getPage(db: D1Database, slug: string): Promise<PageRow | null> {
  const r = await db.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first<any>();
  if (!r) return null;
  let meta = {};
  try { meta = JSON.parse(r.meta || '{}'); } catch { /* noop */ }
  return { ...r, meta };
}

export async function savePage(db: D1Database, p: { slug: string; title: string; description: string; body_md: string; meta?: Record<string, unknown> }) {
  await db
    .prepare(
      `INSERT INTO pages (slug, title, description, body_md, meta, updated_at) VALUES (?1,?2,?3,?4,?5,?6)
       ON CONFLICT(slug) DO UPDATE SET title=?2, description=?3, body_md=?4, meta=?5, updated_at=?6`
    )
    .bind(p.slug, p.title, p.description, p.body_md, JSON.stringify(p.meta ?? {}), nowIso())
    .run();
}

// ------------------------------------------------------------------ Projects
export interface Project {
  id: string; title: string; summary: string; body_md: string; category: string; status: string; year: string;
  technology: string[]; url: string | null; github: string | null; thumbnail: string | null; thumbnail_alt: string;
  featured: boolean; sort_order: number; state: 'draft' | 'published' | 'private'; published_at: string | null; updated_at: string;
}
const toProject = (r: any): Project => ({ ...r, technology: parseJsonArray(r.technology), featured: !!r.featured });

const PUBLIC_WHERE = `state = 'published' AND (published_at IS NULL OR published_at <= ?)`;

export async function listProjects(db: D1Database, opts: { all?: boolean } = {}): Promise<Project[]> {
  const q = opts.all
    ? db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, title ASC')
    : db.prepare(`SELECT * FROM projects WHERE ${PUBLIC_WHERE} ORDER BY sort_order ASC, title ASC`).bind(nowIso());
  return (await q.all<any>()).results.map(toProject);
}

export async function getProject(db: D1Database, id: string, opts: { all?: boolean } = {}): Promise<Project | null> {
  const r = opts.all
    ? await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<any>()
    : await db.prepare(`SELECT * FROM projects WHERE id = ? AND ${PUBLIC_WHERE}`).bind(id, nowIso()).first<any>();
  return r ? toProject(r) : null;
}

// ------------------------------------------------------------------ Posts
export interface Post {
  slug: string; title: string; excerpt: string; body_md: string; category: string; tags: string[]; thumbnail: string | null;
  thumbnail_alt: string; featured: boolean; state: 'draft' | 'published' | 'private'; published_at: string | null;
  seo_title: string; seo_description: string; updated_at: string;
}
const toPost = (r: any): Post => ({ ...r, tags: parseJsonArray(r.tags), featured: !!r.featured });

export async function listPosts(db: D1Database, opts: { all?: boolean; limit?: number } = {}): Promise<Post[]> {
  const lim = opts.limit ? ` LIMIT ${Math.max(1, Math.min(200, Math.floor(opts.limit)))}` : '';
  const q = opts.all
    ? db.prepare(`SELECT * FROM posts ORDER BY COALESCE(published_at, updated_at) DESC${lim}`)
    : db.prepare(`SELECT * FROM posts WHERE ${PUBLIC_WHERE} ORDER BY published_at DESC${lim}`).bind(nowIso());
  return (await q.all<any>()).results.map(toPost);
}

export async function getPost(db: D1Database, slug: string, opts: { all?: boolean } = {}): Promise<Post | null> {
  const r = opts.all
    ? await db.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first<any>()
    : await db.prepare(`SELECT * FROM posts WHERE slug = ? AND ${PUBLIC_WHERE}`).bind(slug, nowIso()).first<any>();
  return r ? toPost(r) : null;
}

// ------------------------------------------------------------------ Search
export interface SearchHit { kind: 'project' | 'post' | 'page'; title: string; href: string; snippet: string; meta: string }

const likeEsc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

function snippetFor(text: string, terms: string[]): string {
  const t = plainText(text);
  const lower = t.toLowerCase();
  let idx = -1;
  for (const term of terms) {
    const i = lower.indexOf(term.toLowerCase());
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx < 0) return t.slice(0, 110);
  const start = Math.max(0, idx - 30);
  return (start > 0 ? '…' : '') + t.slice(start, start + 120) + (start + 120 < t.length ? '…' : '');
}

export function parseQuery(q: string): string[] {
  return q.normalize('NFKC').split(/\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 60));
}

export async function search(db: D1Database, q: string, perKind = 12): Promise<SearchHit[]> {
  const terms = parseQuery(q);
  if (!terms.length) return [];
  const now = nowIso();
  const cond = (cols: string[]) =>
    terms.map(() => '(' + cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')').join(' AND ');
  const binds = (n: number) => terms.flatMap((t) => Array(n).fill(`%${likeEsc(t)}%`));

  const pCols = ['title', 'summary', 'body_md', 'category', 'technology'];
  const bCols = ['title', 'excerpt', 'body_md', 'category', 'tags'];
  const gCols = ['title', 'description', 'body_md'];

  const [proj, post, page] = await Promise.all([
    db.prepare(`SELECT * FROM projects WHERE ${PUBLIC_WHERE} AND ${cond(pCols)} ORDER BY sort_order LIMIT ${perKind}`)
      .bind(now, ...binds(pCols.length)).all<any>(),
    db.prepare(`SELECT * FROM posts WHERE ${PUBLIC_WHERE} AND ${cond(bCols)} ORDER BY published_at DESC LIMIT ${perKind}`)
      .bind(now, ...binds(bCols.length)).all<any>(),
    db.prepare(`SELECT * FROM pages WHERE ${cond(gCols)} LIMIT ${perKind}`).bind(...binds(gCols.length)).all<any>()
  ]);

  const hits: SearchHit[] = [];
  for (const r of proj.results) hits.push({ kind: 'project', title: r.title, href: `/projects/${r.id}`, snippet: snippetFor(r.summary + ' ' + r.body_md, terms), meta: r.category });
  for (const r of post.results) hits.push({ kind: 'post', title: r.title, href: `/blog/${r.slug}`, snippet: snippetFor(r.excerpt + ' ' + r.body_md, terms), meta: (r.published_at ?? '').slice(0, 10) });
  const pageHref: Record<string, string> = { about: '/about', terms: '/terms', privacy: '/privacy' };
  for (const r of page.results) if (pageHref[r.slug]) hits.push({ kind: 'page', title: r.title, href: pageHref[r.slug], snippet: snippetFor(r.description + ' ' + r.body_md, terms), meta: 'Page' });
  return hits;
}

// ------------------------------------------------------------------ Contacts
export interface Contact {
  id: number; name: string; email: string; subject: string; message: string;
  status: 'new' | 'in_progress' | 'done'; admin_note: string; created_at: string;
}
