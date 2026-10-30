/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// workers-types はグローバルに Element/Response 等を上書きし、ブラウザDOMの型と衝突するため、
// 全体参照せず必要な型だけをエイリアスで取り込む。
type D1Database = import('@cloudflare/workers-types').D1Database;
type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

interface Env {
  DB: D1Database;
  IP_HASH_SALT?: string;
  TURNSTILE_SECRET?: string;
}

declare namespace App {
  interface Locals extends Runtime {
    admin?: { id: number; email: string; role: string; csrf: string };
    db: D1Database;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}
