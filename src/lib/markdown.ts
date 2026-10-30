// Markdown → 安全なHTML。生HTMLはすべてエスケープし、危険なURLスキームは除去する。
import { Marked } from 'marked';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** http(s) / mailto / サイト内パス(/…) / ページ内(#…) のみ許可 */
export function safeUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  const h = href.trim();
  if (/^(https?:\/\/|mailto:)/i.test(h)) return h;
  if (h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/\\')) return h;
  if (h.startsWith('#')) return h;
  return null;
}

export function slugifyHeading(text: string): string {
  const s = text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return s || 'section';
}

export interface TocItem { depth: number; text: string; id: string }

export function renderMarkdown(md: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const used = new Map<string, number>();
  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    renderer: {
      html({ text }) {
        return escapeHtml(text);
      },
      heading({ depth, text, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const base = slugifyHeading(text);
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n ? `${base}-${n}` : base;
        if (depth >= 2 && depth <= 3) toc.push({ depth, text, id });
        return `<h${depth} id="${escapeHtml(id)}">${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const url = safeUrl(href);
        if (!url) return inner;
        const external = /^https?:\/\//i.test(url);
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        const rel = external ? ' rel="noopener noreferrer" target="_blank"' : '';
        return `<a href="${escapeHtml(url)}"${t}${rel}>${inner}</a>`;
      },
      image({ href, title, text }) {
        const url = safeUrl(href);
        if (!url || url.startsWith('mailto:')) return escapeHtml(text);
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text)}"${t} loading="lazy" decoding="async">`;
      }
    }
  });

  let html = marked.parse(md ?? '', { async: false }) as string;
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return { html, toc };
}

/** 検索・要約用にMarkdown記号を落とした平文 */
export function plainText(md: string): string {
  return (md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+\s]+/gm, '')
    .replace(/[*_~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
