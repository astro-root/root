import type { APIRoute } from 'astro';
import { admin } from '@/lib/api';
import { sanitizeSetting } from '@/lib/admin-schema';
import { saveSetting } from '@/lib/content';
import { SETTING_KEYS } from '@/lib/defaults';
import { ValidationError, json } from '@/lib/validate';

export const prerender = false;

export const POST: APIRoute = admin(async ({ locals }, body) => {
  const key = body?.key;
  if (!SETTING_KEYS.includes(key)) throw new ValidationError({ key: '不明な設定項目です。' });
  const value = sanitizeSetting(key, body.value);
  await saveSetting(locals.db, key, value);
  return json({ ok: true, value });
});
