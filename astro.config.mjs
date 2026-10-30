import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: process.env.SITE_URL || 'https://astro-root.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
    platformProxy: {
      enabled: true,
      // E2Eテストなどで開発用DBと分離したいとき: D1_PERSIST_DIR=.e2e/state
      persist: process.env.D1_PERSIST_DIR ? { path: `${process.env.D1_PERSIST_DIR}/v3` } : true
    }
  }),
  // Astro標準の checkOrigin は HEAD まで 403 にしてしまう（4.16時点）ため無効化し、
  // src/middleware.ts で全パスの変更系リクエスト(GET/HEAD/OPTIONS以外)に同等のOrigin検査を行っている。
  security: { checkOrigin: false },
  compressHTML: true,
  build: { inlineStylesheets: 'auto' }
});
