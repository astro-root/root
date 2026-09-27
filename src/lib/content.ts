import { marked } from 'marked';
import { fetchCollection, fetchDoc, isFirestoreConfigured } from './firestore-rest';

export interface Project {
  id: string;
  title: string;
  order: number;
  category: string;
  status: string;
  year: string;
  summary: string;
  technology: string[];
  url?: string;
  github?: string;
  featured: boolean;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  date: string; // ISO string
  category: string;
  tags: string[];
  excerpt: string;
  contentHtml: string;
  published: boolean;
  featured: boolean;
}

export interface About {
  bodyHtml: string;
  based: string;
  status: string;
  currently: string;
}

export interface SiteSettings {
  heroTagline: string;
  heroLede: string;
  siteDescription: string;
  contactEmail: string;
  githubUrl: string;
  xUrl: string;
  footerNote: string;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  heroTagline: 'Science. Software. Ideas.',
  heroLede:
    '興味を持ったものを観測し、考え、作る。天文・物理・科学と、Web開発・ソフトウェアを横断しながら実験を続ける個人のラボラトリー。',
  siteDescription:
    '高校生Rootが、天文・物理・科学とソフトウェア開発を横断しながら研究・制作・実験する個人ラボラトリー。',
  contactEmail: 'contact@astro-root.com',
  githubUrl: 'https://github.com/',
  xUrl: 'https://x.com/',
  footerNote: '© Root'
};

function n(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}
function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function b(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// ---------------------------------------------------------------- Projects
export async function getProjects(): Promise<Project[]> {
  if (isFirestoreConfigured) {
    const docs = await fetchCollection('projects');
    if (docs.length > 0) {
      return docs
        .map((d) => ({
          id: s(d.id),
          title: s(d.title),
          order: n(d.order),
          category: s(d.category),
          status: s(d.status),
          year: s(d.year),
          summary: s(d.summary),
          technology: arr(d.technology),
          url: s(d.url) || undefined,
          github: s(d.github) || undefined,
          featured: b(d.featured)
        }))
        .sort((a, b2) => a.order - b2.order);
    }
  }

  // Fallback: local content collection (no Firebase configured yet, or empty DB).
  const { getCollection } = await import('astro:content');
  const local = await getCollection('projects');
  return local
    .map((p) => ({
      id: p.slug,
      title: p.data.title,
      order: p.data.order,
      category: p.data.category,
      status: p.data.status,
      year: p.data.year,
      summary: p.data.summary,
      technology: p.data.technology,
      url: p.data.url,
      github: p.data.github,
      featured: p.data.featured
    }))
    .sort((a, b2) => a.order - b2.order);
}

// --------------------------------------------------------------------- Blog
async function renderMarkdown(md: string): Promise<string> {
  return marked.parse(md, { async: false }) as string;
}

export async function getPosts({ includeUnpublished = false } = {}): Promise<Post[]> {
  if (isFirestoreConfigured) {
    const docs = await fetchCollection('blog');
    if (docs.length > 0) {
      const posts = await Promise.all(
        docs.map(async (d) => ({
          id: s(d.id),
          title: s(d.title),
          slug: s(d.slug) || s(d.id),
          date: s(d.date),
          category: s(d.category),
          tags: arr(d.tags),
          excerpt: s(d.excerpt),
          contentHtml: await renderMarkdown(s(d.content)),
          published: b(d.published),
          featured: b(d.featured)
        }))
      );
      const filtered = includeUnpublished ? posts : posts.filter((p) => p.published);
      return filtered.sort((a, b2) => {
        if (a.featured !== b2.featured) return a.featured ? -1 : 1;
        return new Date(b2.date).valueOf() - new Date(a.date).valueOf();
      });
    }
  }

  const { getCollection } = await import('astro:content');
  const local = await getCollection('blog', ({ data }) =>
    includeUnpublished ? true : data.published
  );
  const posts = await Promise.all(
    local.map(async (p) => ({
      id: p.slug,
      title: p.data.title,
      slug: p.data.slugOverride ?? p.slug,
      date: p.data.date.toISOString(),
      category: p.data.category,
      tags: p.data.tags,
      excerpt: p.data.excerpt,
      // .body is the raw Markdown source of the entry — rendered the same
      // way as the Firestore path, so both sources produce identical HTML.
      contentHtml: await renderMarkdown(p.body ?? ''),
      published: p.data.published,
      featured: false
    }))
  );
  return posts.sort(
    (a, b2) => new Date(b2.date).valueOf() - new Date(a.date).valueOf()
  );
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const posts = await getPosts({ includeUnpublished: false });
  return posts.find((p) => p.slug === slug) ?? null;
}

// -------------------------------------------------------------------- About
export async function getAbout(): Promise<About> {
  const defaults = {
    based: 'Japan',
    status: 'Student, building on the side',
    currently: 'Q-Room, physics notes'
  };

  if (isFirestoreConfigured) {
    const doc = await fetchDoc('about', 'main');
    if (doc) {
      return {
        bodyHtml: await renderMarkdown(s(doc.bodyMarkdown)),
        based: s(doc.based, defaults.based),
        status: s(doc.status, defaults.status),
        currently: s(doc.currently, defaults.currently)
      };
    }
  }

  const { getEntry } = await import('astro:content');
  const entry = await getEntry('about', 'index');
  return {
    bodyHtml: await renderMarkdown(entry?.body ?? ''),
    ...defaults
  };
}

// ----------------------------------------------------------------- Settings
export async function getSettings(): Promise<SiteSettings> {
  if (isFirestoreConfigured) {
    const doc = await fetchDoc('settings', 'site');
    if (doc) {
      return {
        heroTagline: s(doc.heroTagline, DEFAULT_SETTINGS.heroTagline),
        heroLede: s(doc.heroLede, DEFAULT_SETTINGS.heroLede),
        siteDescription: s(doc.siteDescription, DEFAULT_SETTINGS.siteDescription),
        contactEmail: s(doc.contactEmail, DEFAULT_SETTINGS.contactEmail),
        githubUrl: s(doc.githubUrl, DEFAULT_SETTINGS.githubUrl),
        xUrl: s(doc.xUrl, DEFAULT_SETTINGS.xUrl),
        footerNote: s(doc.footerNote, DEFAULT_SETTINGS.footerNote)
      };
    }
  }
  return DEFAULT_SETTINGS;
}
