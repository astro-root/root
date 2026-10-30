#!/usr/bin/env node
// 本番ビルド（wrangler pages dev / 実デプロイ）に対するスモークテスト。
//   node scripts/smoke.mjs http://localhost:4323
// 開発サーバー(astro dev)では再現しない「本番ビルド固有の不具合」（例: HEAD が 403 になる）を検出するために使う。
const base = (process.argv[2] || 'http://localhost:4323').replace(/\/$/, '');
let failed = 0;
const ok = (cond, name, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ← ${detail}`}`); if (!cond) failed++; };
const req = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });

const pages = ['/', '/projects', '/projects/q-room', '/blog', '/blog/cherenkov-blue', '/about', '/contact', '/terms', '/privacy', '/search?q=a', '/sitemap.xml', '/robots.txt', '/api/search?q=quiz'];
for (const p of pages) {
  const g = await req(p);
  const h = await req(p, { method: 'HEAD' });
  ok(g.status === 200, `GET  ${p}`, `status ${g.status}`);
  ok(h.status === 200, `HEAD ${p}`, `status ${h.status}`);
}
ok((await req('/nope')).status === 404, '未知のURLは404');
ok((await req('/blog/none')).status === 404, '存在しない記事は404');
const r301 = await req('/notes/cherenkov-blue');
ok(r301.status === 301 && new URL(r301.headers.get('location')).pathname === '/blog/cherenkov-blue', '/notes/* → /blog/* の301');
ok((await req('/admin')).status === 302, '/admin は未ログインでログインへ302');
ok((await req('/api/admin/settings')).status === 401, '管理APIは未認証で401');
ok((await req('/api/admin/settings', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' })).status === 401, '管理API(POST)は未認証で401');

// クロスオリジンの変更系リクエストは全パスで拒否
for (const p of ['/api/contact', '/api/admin/login', '/', '/admin/login']) {
  const r = await req(p, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  ok(r.status === 403, `クロスオリジン POST ${p} は403`, `status ${r.status}`);
}
const noOrigin = await req('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
ok(noOrigin.status === 403, 'Origin/Sec-Fetch-Site なしの POST は403', `status ${noOrigin.status}`);

const home = await req('/');
const h = Object.fromEntries(home.headers);
ok(h['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY');
ok(h['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff');
ok((h['content-security-policy'] || '').includes("frame-ancestors 'none'"), 'CSP frame-ancestors');
const login = await req('/admin/login');
ok((login.headers.get('x-robots-tag') || '').includes('noindex') && (login.headers.get('cache-control') || '').includes('no-store'), '管理画面は noindex / no-store');
const html = await home.text();
ok(html.includes('<title>るーとの研究室</title>'), 'タイトルが「るーとの研究室」');
ok(/rel="canonical"/.test(html) && /property="og:image"/.test(html), 'canonical / OGP');
for (const a of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/og-default.png', '/site.webmanifest']) ok((await req(a)).status === 200, `アセット ${a}`);
const robots = await (await req('/robots.txt')).text();
ok(robots.includes('Disallow: /admin') && robots.includes('Sitemap:'), 'robots.txt');

console.log(failed ? `\n✗ smoke: ${failed} 件失敗` : '\n✓ smoke: すべて成功');
process.exit(failed ? 1 : 0);
