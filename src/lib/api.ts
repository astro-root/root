import type { APIContext } from 'astro';
import { ValidationError, json } from './validate';

/** 管理API共通ラッパー。認証・CSRFはmiddlewareで検証済みだが、ここでも多層防御として admin を確認する。 */
export function admin(handler: (ctx: APIContext, body: any) => Promise<Response>) {
  return async (ctx: APIContext) => {
    if (!ctx.locals.admin) return json({ error: 'unauthorized' }, 401);
    let body: any = {};
    if (!['GET', 'DELETE'].includes(ctx.request.method)) {
      const ct = ctx.request.headers.get('Content-Type') ?? '';
      if (ct.includes('application/json')) {
        try { body = await ctx.request.json(); } catch { return json({ error: 'bad_json' }, 400); }
      }
    }
    try {
      return await handler(ctx, body);
    } catch (e) {
      if (e instanceof ValidationError) return json({ ok: false, error: 'validation', errors: e.fields }, 400);
      console.error('admin api error', e);
      return json({ ok: false, error: 'server_error' }, 500);
    }
  };
}
