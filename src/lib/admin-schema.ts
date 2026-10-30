// 管理画面から受け取った値のサーバー側検証・正規化。クライアント側の検証には依存しない。
import { DEFAULT_SETTINGS, PROJECT_STATUSES, CONTENT_STATES, type Settings } from './defaults';
import { EMAIL_RE, SLUG_RE, ValidationError, clean, isHttpUrl, isLinkTarget, splitList } from './validate';

type Errors = Record<string, string>;
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const bool = (v: unknown) => v === true || v === 'true' || v === 'on' || v === 1;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function link(v: unknown, field: string, errors: Errors, opts: { required?: boolean; httpOnly?: boolean } = {}): string {
  const s = clean(v, 500);
  if (!s) { if (opts.required) errors[field] = 'リンク先を入力してください。'; return ''; }
  const ok = opts.httpOnly ? isHttpUrl(s) || (s.startsWith('mailto:') && isLinkTarget(s)) : isLinkTarget(s);
  if (!ok) errors[field] = opts.httpOnly ? 'http(s):// または mailto: のURLを入力してください。' : 'URL（http/https）またはサイト内パス（/…）を入力してください。';
  return s;
}

function navItems(v: unknown, max: number, field: string, errors: Errors, httpOnly = false) {
  return arr(v, max).map((raw, i) => {
    const o = obj(raw);
    const label = clean(o.label, 40);
    if (!label) errors[`${field}.${i}.label`] = '表示名を入力してください。';
    const href = link(o.href, `${field}.${i}.href`, errors, { required: true, httpOnly });
    return { label, href, external: bool(o.external) || /^https?:\/\//i.test(href) };
  });
}

export function sanitizeSetting(key: keyof Settings, input: unknown): unknown {
  const v = obj(input);
  const errors: Errors = {};
  let out: unknown;

  switch (key) {
    case 'site': {
      const email = clean(v.contactEmail, 254);
      if (email && !EMAIL_RE.test(email)) errors.contactEmail = 'メールアドレスの形式が正しくありません。';
      const name = clean(v.name, 60);
      if (!name) errors.name = 'サイト名は必須です。';
      out = {
        name, nameEn: clean(v.nameEn, 60), description: clean(v.description, 300), tagline: clean(v.tagline, 100),
        contactEmail: email, copyright: clean(v.copyright, 80), logo: link(v.logo, 'logo', errors, { required: true }), logoAlt: clean(v.logoAlt, 100)
      };
      break;
    }
    case 'nav': {
      // nav は配列そのものを value として受け取る
      const items = navItems(Array.isArray(input) ? input : v.items, 12, 'nav', errors);
      out = items;
      break;
    }
    case 'footer':
      out = { links: navItems(v.links, 12, 'links', errors), note: clean(v.note, 100), showSocial: bool(v.showSocial) };
      break;
    case 'social': {
      out = navItems(Array.isArray(input) ? input : v.items, 10, 'social', errors, true).map((i) => ({ ...i, external: true }));
      break;
    }
    case 'seo': {
      const tpl = clean(v.titleTemplate, 100) || DEFAULT_SETTINGS.seo.titleTemplate;
      if (!tpl.includes('%s')) errors.titleTemplate = 'タイトルテンプレートには %s（ページ名の位置）を含めてください。';
      const card = v.twitterCard === 'summary' ? 'summary' : 'summary_large_image';
      out = { titleTemplate: tpl, ogImage: link(v.ogImage, 'ogImage', errors, { required: true }), twitterCard: card, noindex: bool(v.noindex), structuredData: bool(v.structuredData) };
      break;
    }
    case 'display': {
      const m = obj(v.meteors);
      const freq = ['low', 'normal', 'high'].includes(String(m.frequency)) ? String(m.frequency) : 'normal';
      out = { meteors: { enabled: bool(m.enabled), frequency: freq }, opening: bool(v.opening), reveal: bool(v.reveal) };
      break;
    }
    case 'home': {
      const ids = DEFAULT_SETTINGS.home.sections.map((s) => s.id) as string[];
      const seen = new Set<string>();
      const sections: unknown[] = [];
      for (const raw of arr(v.sections, 20)) {
        const o = obj(raw);
        const id = String(o.id);
        if (!ids.includes(id) || seen.has(id)) continue;
        seen.add(id);
        sections.push({ id, enabled: bool(o.enabled), title: clean(o.title, 60), body: clean(o.body, 400) });
      }
      for (const d of DEFAULT_SETTINGS.home.sections) if (!seen.has(d.id)) sections.push({ ...d }); // 欠けたセクションを補完
      const heroTitle = clean(v.heroTitle, 80);
      if (!heroTitle) errors.heroTitle = 'ヒーロータイトルは必須です。';
      out = {
        heroTitle, heroLede: clean(v.heroLede, 400),
        interests: arr(v.interests, 12).map((r, i) => { const o = obj(r); const label = clean(o.label, 40); if (!label) errors[`interests.${i}.label`] = '項目名を入力してください。'; return { label, note: clean(o.note, 200) }; }),
        buttons: arr(v.buttons, 4).map((r, i) => { const o = obj(r); const label = clean(o.label, 40); if (!label) errors[`buttons.${i}.label`] = 'ボタン名を入力してください。'; return { label, href: link(o.href, `buttons.${i}.href`, errors, { required: true }), primary: bool(o.primary) }; }),
        sections,
        news: arr(v.news, 10).map((r, i) => { const o = obj(r); const text = clean(o.text, 200); if (!text) errors[`news.${i}.text`] = '本文を入力してください。'; return { date: clean(o.date, 20), text, href: link(o.href, `news.${i}.href`, errors) }; })
      };
      break;
    }
    case 'contact': {
      const days = Math.round(Number(v.retentionDays));
      if (!Number.isFinite(days) || days < 30 || days > 3650) errors.retentionDays = '保存期間は30〜3650日で指定してください。';
      out = { intro: clean(v.intro, 400), successMessage: clean(v.successMessage, 400), retentionDays: days };
      break;
    }
    default:
      throw new ValidationError({ key: '不明な設定項目です。' });
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

// ---------------------------------------------------------------- コンテンツ
const isoOrNull = (v: unknown): string | null => {
  const s = clean(v, 40);
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00.000Z` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function common(v: Record<string, unknown>, errors: Errors) {
  const state = String(v.state);
  if (!(CONTENT_STATES as readonly string[]).includes(state)) errors.state = '公開状態が不正です。';
  const thumb = link(v.thumbnail, 'thumbnail', errors);
  const rawDate = clean(v.published_at, 40);
  const published_at = isoOrNull(v.published_at);
  if (rawDate && !published_at) errors.published_at = '公開日の形式が正しくありません。';
  return { state: state as 'draft' | 'published' | 'private', thumbnail: thumb || null, thumbnail_alt: clean(v.thumbnail_alt, 200), published_at };
}

export function sanitizeProject(input: unknown) {
  const v = obj(input);
  const errors: Errors = {};
  const id = clean(v.id, 80);
  if (!SLUG_RE.test(id)) errors.id = 'スラッグは英小文字・数字・ハイフンのみ（例: my-project）で入力してください。';
  const title = clean(v.title, 120);
  if (!title) errors.title = 'タイトルは必須です。';
  const status = String(v.status);
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) errors.status = '開発状況が不正です。';
  const order = Math.round(Number(v.sort_order ?? 0));
  if (!Number.isFinite(order) || order < 0 || order > 9999) errors.sort_order = '表示順は0〜9999の整数で指定してください。';
  const url = link(v.url, 'url', errors, { httpOnly: true });
  const github = link(v.github, 'github', errors, { httpOnly: true });
  const body_md = typeof v.body_md === 'string' ? v.body_md.slice(0, 60000) : '';
  const c = common(v, errors);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    id, title, summary: clean(v.summary, 300), body_md, category: clean(v.category, 40), status, year: clean(v.year, 20),
    technology: splitList(typeof v.technology === 'string' ? v.technology : Array.isArray(v.technology) ? v.technology.join(',') : ''),
    url: url || null, github: github || null, featured: bool(v.featured), sort_order: order, ...c,
    published_at: c.published_at ?? (c.state === 'published' ? new Date().toISOString() : null)
  };
}

export function sanitizePost(input: unknown) {
  const v = obj(input);
  const errors: Errors = {};
  const slug = clean(v.slug, 80);
  if (!SLUG_RE.test(slug)) errors.slug = 'スラッグは英小文字・数字・ハイフンのみ（例: my-first-post）で入力してください。';
  const title = clean(v.title, 150);
  if (!title) errors.title = 'タイトルは必須です。';
  const body_md = typeof v.body_md === 'string' ? v.body_md.slice(0, 100000) : '';
  const c = common(v, errors);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return {
    slug, title, excerpt: clean(v.excerpt, 300), body_md, category: clean(v.category, 40),
    tags: splitList(typeof v.tags === 'string' ? v.tags : Array.isArray(v.tags) ? v.tags.join(',') : ''),
    featured: bool(v.featured), seo_title: clean(v.seo_title, 120), seo_description: clean(v.seo_description, 200), ...c,
    published_at: c.published_at ?? (c.state === 'published' ? new Date().toISOString() : null)
  };
}

export function sanitizePage(slug: string, input: unknown) {
  const v = obj(input);
  const errors: Errors = {};
  if (!['about', 'terms', 'privacy'].includes(slug)) throw new ValidationError({ slug: '不明なページです。' });
  const title = clean(v.title, 100);
  if (!title) errors.title = 'タイトルは必須です。';
  let meta: Record<string, unknown> = {};
  if (slug === 'about') {
    const image = link(v.image, 'image', errors);
    meta = { displayName: clean(v.displayName, 60), status: clean(v.status, 120), based: clean(v.based, 60), image, imageAlt: clean(v.imageAlt, 150) };
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { slug, title, description: clean(v.description, 300), body_md: typeof v.body_md === 'string' ? v.body_md.slice(0, 100000) : '', meta };
}
