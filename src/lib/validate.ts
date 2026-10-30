export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// 実用上十分な厳しさのメール検証（RFC完全準拠ではない）
export const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export class ValidationError extends Error {
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super('validation');
    this.fields = fields;
  }
}

export function clean(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // 制御文字（改行・タブ以外）を除去
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 外部URL or サイト内パス（/…）。空は許容 */
export function isLinkTarget(v: string): boolean {
  if (!v) return true;
  if (v.startsWith('/') && !v.startsWith('//')) return true;
  if (v.startsWith('#')) return true;
  if (v.startsWith('mailto:')) return EMAIL_RE.test(v.slice(7));
  return isHttpUrl(v);
}

export function parseJsonArray(v: string | null | undefined): string[] {
  try {
    const a = JSON.parse(v ?? '[]');
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function splitList(v: string, maxItems = 30, maxLen = 40): string[] {
  const seen = new Set<string>();
  for (const part of v.split(/[,\n、]/)) {
    const t = part.trim().slice(0, maxLen);
    if (t) seen.add(t);
    if (seen.size >= maxItems) break;
  }
  return [...seen];
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}
