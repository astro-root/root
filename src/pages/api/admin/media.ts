import type { APIRoute } from 'astro';
import { admin } from '@/lib/api';
import { ValidationError, clean, json } from '@/lib/validate';

export const prerender = false;
const MAX = 1_500_000; // D1の1行上限(約2MB)に収める

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null; // SVGはスクリプトを含み得るため許可しない
}

export const POST: APIRoute = admin(async ({ request, locals }) => {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ValidationError({ file: 'ファイルを選択してください。' });
  if (file.size > MAX) throw new ValidationError({ file: `ファイルが大きすぎます（上限 ${(MAX / 1_000_000).toFixed(1)}MB）。` });
  const buf = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(buf);
  if (!mime) throw new ValidationError({ file: 'PNG / JPEG / GIF / WebP のみアップロードできます。' });
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const filename = clean(file.name, 120).replace(/[^\w.\-぀-ヿ一-鿿]+/g, '_') || 'image';
  await locals.db.prepare('INSERT INTO media (id, filename, mime, size, alt, data) VALUES (?,?,?,?,?,?)').bind(id, filename, mime, buf.length, clean(form.get('alt'), 200), buf).run();
  return json({ ok: true, id, url: `/media/${id}` });
});

export const DELETE: APIRoute = admin(async ({ locals, url }) => {
  const r = await locals.db.prepare('DELETE FROM media WHERE id = ?').bind(url.searchParams.get('id') ?? '').run();
  return json({ ok: true, deleted: r.meta.changes });
});
