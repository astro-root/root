#!/usr/bin/env bash
# るーとの研究室: デザイン更新（nopo1 系の見た目 + 新オープニング）を、zip なしでそのまま反映する。
# 使い方（リポジトリの直下で）:   bash update-design.sh
#
# ・このファイルだけで完結（変更内容はファイル末尾に差分として埋め込み済み。git apply で適用）
# ・すでに適用済みなら何もしない / 当たらない場合は何も変更せず理由を表示
# ・依存関係の追加なし（npm install 不要）。コミット・push はしない（内容を確認してから自分で行う）
set -euo pipefail

die() { echo "✗ $*" >&2; exit 1; }
ok()  { echo "✓ $*"; }
info(){ echo "→ $*"; }

[ -f package.json ] && grep -q '"name": "roots-laboratory"' package.json || die "リポジトリの直下（package.json のある場所）で実行してください。"
command -v git >/dev/null || die "git が必要です。"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# 末尾に埋め込まれた差分を取り出す（__PATCH_*__ の行で区切られている）
extract() { awk -v name="$1" '$0=="__PATCH_" name "_BEGIN__"{f=1;next} $0=="__PATCH_" name "_END__"{f=0} f' "$0" > "$TMP/$1.patch"; }
extract proxyfix; extract design

# ---- 1) Codespaces 等のプロキシ越しでログインが403になる問題の修正（未適用の場合のみ）
if grep -q 'isSameOriginRequest' src/middleware.ts 2>/dev/null; then
  ok "プロキシ対応（Origin検査）は反映済みです"
else
  info "プロキシ対応（Origin検査・Cookie・Vite許可ホスト）を先に適用します"
  git apply --check "$TMP/proxyfix.patch" 2>/dev/null || die "プロキシ対応の差分が当たりません（該当ファイルを手で変更していませんか？ git diff で確認してください）。何も変更していません。"
  git apply "$TMP/proxyfix.patch"; ok "プロキシ対応を適用しました"
fi

# ---- 2) デザイン更新
if grep -q 'opening__num' src/styles/global.css 2>/dev/null; then
  ok "デザイン更新は適用済みです。何もしません。"; exit 0
fi
if ! git apply --check "$TMP/design.patch" 2>"$TMP/err.txt"; then
  cat "$TMP/err.txt" >&2
  die "デザイン更新の差分が当たりません。上記のファイルを手で変更している可能性があります（git diff / git stash で確認）。何も変更していません。"
fi
git apply "$TMP/design.patch"
ok "デザイン更新を適用しました"

cat <<'MSG'

次の手順:
  bash scripts/dev.sh        # 開発サーバー（ブラウザで / を開く。オープニングは1セッション1回。もう一度見るには、タブを閉じるか sessionStorage を消す）
  git diff --stat            # 変更内容を確認
  git add -A && git commit -m "デザイン更新" && bash scripts/git-push.sh
MSG
exit 0

: <<'__PATCH_DATA__'
__PATCH_proxyfix_BEGIN__
diff --git a/astro.config.mjs b/astro.config.mjs
index 9930cca..41d5b99 100644
--- a/astro.config.mjs
+++ b/astro.config.mjs
@@ -20,6 +20,8 @@ export default defineConfig({
   // Astro標準の checkOrigin は HEAD まで 403 にしてしまう（4.16時点）ため無効化し、
   // src/middleware.ts で全パスの変更系リクエスト(GET/HEAD/OPTIONS以外)に同等のOrigin検査を行っている。
   security: { checkOrigin: false },
+  // 開発サーバー(Vite)のホスト検査: GitHub Codespaces 等のプロキシ経由の公開URLを許可する（本番には影響しない）
+  vite: { server: { allowedHosts: ['.github.dev', '.githubpreview.dev', '.gitpod.io'] } },
   compressHTML: true,
   build: { inlineStylesheets: 'auto' }
 });
diff --git a/src/lib/auth.ts b/src/lib/auth.ts
index d6fd4b1..46350f4 100644
--- a/src/lib/auth.ts
+++ b/src/lib/auth.ts
@@ -86,6 +86,11 @@ export async function destroySession(db: D1Database, token: string | undefined)
   await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
 }
 
+/** https でアクセスされているか（リバースプロキシの X-Forwarded-Proto も考慮） */
+export function isHttps(request: Request, url: URL): boolean {
+  return url.protocol === 'https:' || request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim() === 'https';
+}
+
 export function sessionCookie(token: string, maxAge: number, secure: boolean) {
   return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
 }
diff --git a/src/middleware.ts b/src/middleware.ts
index d3214ba..c7ea9d9 100644
--- a/src/middleware.ts
+++ b/src/middleware.ts
@@ -1,6 +1,25 @@
 import { defineMiddleware } from 'astro:middleware';
 import { SESSION_COOKIE, getSessionAdmin, timingSafeEqual } from '@/lib/auth';
 
+/**
+ * 同一オリジンからのリクエストか（CSRF / クロスサイト送信対策）。
+ * ・Sec-Fetch-Site はブラウザが付け、ページのJSからは偽装できない。same-origin ならプロキシ越しでも確実に同一オリジン。
+ * ・古いブラウザ等では Origin を、サーバーが見ているURL、またはリバースプロキシ(Codespaces等)の外部ホストと比較する。
+ */
+function isSameOriginRequest(request: Request, url: URL): boolean {
+  const site = request.headers.get('Sec-Fetch-Site');
+  if (site === 'same-origin' || site === 'none') return true;
+  const origin = request.headers.get('Origin');
+  if (!origin) return false;
+  if (origin === url.origin) return true;
+  const fwdHost = request.headers.get('X-Forwarded-Host')?.split(',')[0]?.trim();
+  if (fwdHost) {
+    const proto = request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '');
+    if (origin === `${proto}://${fwdHost}`) return true;
+  }
+  return false;
+}
+
 const LEGACY: [RegExp, (m: RegExpMatchArray) => string][] = [
   [/^\/notes\/?$/i, () => '/blog'],
   [/^\/notes\/(.+)$/i, (m) => `/blog/${m[1]}`],
@@ -68,10 +87,7 @@ export const onRequest = defineMiddleware(async (context, next) => {
 
   // 状態を変更するリクエスト（GET/HEAD/OPTIONS以外）は、全パスで同一オリジンのみ受け付ける（CSRF/クロスサイト送信対策）
   if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
-    const origin = request.headers.get('Origin');
-    const site = request.headers.get('Sec-Fetch-Site');
-    const sameOrigin = origin ? origin === url.origin : site === 'same-origin' || site === 'none';
-    if (!sameOrigin) {
+    if (!isSameOriginRequest(request, url)) {
       return path.startsWith('/api/')
         ? new Response(JSON.stringify({ error: 'forbidden_origin' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
         : new Response('Forbidden', { status: 403 });
diff --git a/src/pages/api/admin/login.ts b/src/pages/api/admin/login.ts
index 6950b43..e08529c 100644
--- a/src/pages/api/admin/login.ts
+++ b/src/pages/api/admin/login.ts
@@ -1,5 +1,5 @@
 import type { APIRoute } from 'astro';
-import { clientKey, createSession, dummyVerify, rateLimit, rateLimitCheck, rateLimitReset, sessionCookie, verifyPassword } from '@/lib/auth';
+import { clientKey, createSession, isHttps, dummyVerify, rateLimit, rateLimitCheck, rateLimitReset, sessionCookie, verifyPassword } from '@/lib/auth';
 import { EMAIL_RE, json } from '@/lib/validate';
 
 export const prerender = false;
@@ -63,6 +63,6 @@ export const POST: APIRoute = async ({ request, locals, url }) => {
   await rateLimitReset(db, ipKey);
   const { token, maxAge } = await createSession(db, admin.id);
   const res = json({ ok: true });
-  res.headers.append('Set-Cookie', sessionCookie(token, maxAge, url.protocol === 'https:'));
+  res.headers.append('Set-Cookie', sessionCookie(token, maxAge, isHttps(request, url)));
   return res;
 };
diff --git a/src/pages/api/admin/logout.ts b/src/pages/api/admin/logout.ts
index 53b57d5..178ab9d 100644
--- a/src/pages/api/admin/logout.ts
+++ b/src/pages/api/admin/logout.ts
@@ -1,12 +1,12 @@
 import type { APIRoute } from 'astro';
-import { SESSION_COOKIE, clearSessionCookie, destroySession } from '@/lib/auth';
+import { SESSION_COOKIE, clearSessionCookie, destroySession, isHttps } from '@/lib/auth';
 import { json } from '@/lib/validate';
 
 export const prerender = false;
 
-export const POST: APIRoute = async ({ locals, cookies, url }) => {
+export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
   await destroySession(locals.db, cookies.get(SESSION_COOKIE)?.value);
   const res = json({ ok: true });
-  res.headers.append('Set-Cookie', clearSessionCookie(url.protocol === 'https:'));
+  res.headers.append('Set-Cookie', clearSessionCookie(isHttps(request, url)));
   return res;
 };
__PATCH_proxyfix_END__
__PATCH_design_BEGIN__
diff --git a/src/components/Opening.astro b/src/components/Opening.astro
index 8d5691d..9ed18f1 100644
--- a/src/components/Opening.astro
+++ b/src/components/Opening.astro
@@ -1,12 +1,18 @@
 ---
-// トップで1セッションに1回だけ再生（元サイトと同じ: 文字を輪郭→塗りで描く。CSSのみ）。
+// オープニング: カウンター(000→100) + 細い進捗線 → 上下に割れて本編が現れる。
+// 1セッションに1回だけ再生（sessionStorage）。CSSのみで動き、JSは「再生済みの記録」と Skip だけ。
+// ※ 見た目を差し替えたいときは、このファイルと global.css の「Opening」ブロックだけを変更すればよい。
 interface Props { name: string }
 const { name } = Astro.props;
-const letters = [...name];
 ---
 <div class="opening" id="opening">
-  <p class="opening__word" role="img" aria-label={name}>
-    {letters.map((letter, i) => <span class="opening__letter" aria-hidden="true" style={`--i:${i}`}>{letter}</span>)}
-  </p>
+  <div class="opening__panel opening__panel--top" aria-hidden="true"></div>
+  <div class="opening__panel opening__panel--bottom" aria-hidden="true"></div>
+  <div class="opening__content" aria-hidden="true">
+    <p class="opening__name">{name}</p>
+    <p class="opening__count"><span class="opening__num"></span><span class="opening__pct">%</span></p>
+    <span class="opening__bar"><i></i></span>
+  </div>
+  <!-- 装飾（上記）は読み上げ対象外。Skip は実際に操作できるボタン（Tab / Escape でもスキップ可） -->
   <button class="opening__skip" id="opening-skip" type="button">Skip</button>
 </div>
diff --git a/src/lib/defaults.ts b/src/lib/defaults.ts
index 0869b24..da79f9e 100644
--- a/src/lib/defaults.ts
+++ b/src/lib/defaults.ts
@@ -66,7 +66,7 @@ export const DEFAULT_SETTINGS: Settings = {
   },
   display: { meteors: { enabled: true, frequency: 'normal' }, opening: true, reveal: true },
   home: {
-    heroTitle: 'るーとの研究室',
+    heroTitle: 'OBSERVE.\nTHINK.\nBUILD.',
     heroLine: 'Astronomy / Physics / Software / Quiz',
     heroLede: '',
     interests: [
diff --git a/src/pages/admin/home.astro b/src/pages/admin/home.astro
index a9f5887..02254fb 100644
--- a/src/pages/admin/home.astro
+++ b/src/pages/admin/home.astro
@@ -13,7 +13,7 @@ const sections = home.sections.map((s) => ({ ...s, name: names[s.id] ?? s.id }))
   <form data-admin-form data-endpoint="/api/admin/settings" data-wrap-key="home">
     <section class="panel"><h2>ヒーロー</h2><p class="hint">トップページの最上部。初期状態では、これだけが表示されます。</p>
       <div class="grid">
-        <AField name="heroTitle" label="ワードマーク（大見出し）" value={home.heroTitle} required maxlength={80} />
+        <AField name="heroTitle" label="大見出し（改行で行を分けます）" as="textarea" rows={3} value={home.heroTitle} required maxlength={80} hint="2行以上に分けると最後の行が輪郭文字になります。1行は8〜10文字程度（大文字の英語）が収まりやすい長さです。サイト名は小さく表示されます。" />
         <AField name="heroLine" label="関心領域の一行（等幅で表示）" value={home.heroLine} maxlength={120} hint="例: Astronomy / Physics / Software / Quiz。Aboutページの関心領域にも使われます。" />
         <AField name="heroLede" label="リード文（任意）" as="textarea" rows={3} value={home.heroLede} maxlength={400} hint="空欄なら表示されません。" />
       </div>
diff --git a/src/pages/index.astro b/src/pages/index.astro
index 2cd7e37..7322f8a 100644
--- a/src/pages/index.astro
+++ b/src/pages/index.astro
@@ -11,6 +11,8 @@ const db = Astro.locals.db;
 const settings = await getSettings(db);
 const { home, site, display } = settings;
 const sections = home.sections.filter((s) => s.enabled);
+// 大見出し: 改行で行に分ける（最後の行は輪郭文字）
+const titleLines = home.heroTitle.split('\n').map((l) => l.trim()).filter(Boolean);
 const need = (id: string) => sections.some((s) => s.id === id);
 const [allProjects, posts] = await Promise.all([
   need('projects') ? listProjects(db) : Promise.resolve([]),
@@ -26,28 +28,44 @@ const jsonLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: sit
 
   {sections.map((s) => {
     if (s.id === 'hero') return (
-      <section class="hero">
-        <Cosmic />
-        <div class="shell hero__inner">
-          <h1 class="hero__word">{home.heroTitle}</h1>
-          {home.heroLine && <p class="hero__interests">{home.heroLine}</p>}
-          {home.heroLede && <p class="hero__lede">{home.heroLede}</p>}
-          {s.body && <p class="hero__lede">{s.body}</p>}
-          {home.cards.length > 0 && (
-            <ul class="hero__links">
+      <>
+        <section class="hero" aria-label={site.name}>
+          <Cosmic />
+          <div class="shell hero__inner">
+            <div class="hero__top">
+              <p class="hero__kicker">{site.name}<span> / {site.nameEn}</span></p>
+              <p class="hero__clock" aria-hidden="true"><time id="clock">00:00</time> JST</p>
+            </div>
+            <h1 class="hero__title">
+              {titleLines.map((line) => <><span class="line"><span>{line}</span></span>{' '}</>)}
+            </h1>
+            <div class="hero__bottom">
+              <div>
+                {home.heroLine && <p class="hero__interests">{home.heroLine}</p>}
+                {home.heroLede && <p class="hero__lede">{home.heroLede}</p>}
+                {s.body && <p class="hero__lede">{s.body}</p>}
+              </div>
+              <a class="hero__explore" href="#index">Explore <span aria-hidden="true">↓</span></a>
+            </div>
+          </div>
+        </section>
+        {home.cards.length > 0 && (
+          <section class="index" id="index" aria-label="サイト内メニュー">
+            <div class="shell"><ul class="index__list">
               {home.cards.map((c, i) => (
-                <li>
-                  <a href={c.href} class="hero-card">
-                    <span class="hero-card__n">{String(i + 1).padStart(2, '0')}</span>
-                    <span class="hero-card__label">{c.label}</span>
-                    {c.note && <span class="hero-card__note">{c.note}</span>}
+                <li class="reveal" style={`--d:${i * 60}ms`}>
+                  <a class="index__row" href={c.href}>
+                    <span class="index__n">{String(i + 1).padStart(2, '0')}</span>
+                    <span class="index__label">{c.label}</span>
+                    {c.note && <span class="index__note">{c.note}</span>}
+                    <span class="index__arrow" aria-hidden="true">→</span>
                   </a>
                 </li>
               ))}
-            </ul>
-          )}
-        </div>
-      </section>
+            </ul></div>
+          </section>
+        )}
+      </>
     );
     if (s.id === 'interests' && home.interests.length) return (
       <section class="section" aria-labelledby="interests-h"><div class="shell">
diff --git a/src/scripts/ui.ts b/src/scripts/ui.ts
index 8b38758..c25599c 100644
--- a/src/scripts/ui.ts
+++ b/src/scripts/ui.ts
@@ -32,12 +32,28 @@ overlay?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () =>
 document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay && !overlay.hidden) { setMenu(false); toggle?.focus(); } });
 matchMedia('(min-width: 721px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
 
-// ---- オープニング（再生済みの記録のみ。アニメーション自体はCSS）
+// ---- オープニング（再生済みの記録と Skip のみ。アニメーション自体はCSS）
 const opening = document.getElementById('opening');
 if (opening) {
   const finish = () => { try { sessionStorage.setItem('rl-opening-seen', '1'); } catch { /* noop */ } };
-  document.getElementById('opening-skip')?.addEventListener('click', () => { opening.classList.add('is-skipping'); finish(); });
+  document.getElementById('opening-skip')?.addEventListener('click', () => {
+    root.classList.add('no-opening');      // 本編の出現アニメーションを前倒しする
+    opening.classList.add('is-skipping');
+    finish();
+    setTimeout(() => opening.remove(), 350);
+  });
   opening.addEventListener('animationend', (e) => { if (e.target === opening) { finish(); opening.remove(); } });
+  // キーボード: Escape でも Skip
+  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('opening')) document.getElementById('opening-skip')?.click(); });
+}
+
+// ---- ヒーローの時計（日本時間。装飾なので読み上げ対象外）
+const clock = document.getElementById('clock');
+if (clock) {
+  const fmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
+  const tick = () => { clock.textContent = fmt.format(new Date()); };
+  tick();
+  setInterval(tick, 10_000);
 }
 
 // ---- スクロール表示
diff --git a/src/styles/global.css b/src/styles/global.css
index c1c3135..b0a1eb9 100644
--- a/src/styles/global.css
+++ b/src/styles/global.css
@@ -117,7 +117,7 @@ main { min-height: 70vh; }
 .rule { border: 0; border-top: 1px solid var(--line); margin: 0; }
 
 .page-head { display: grid; gap: 0.75rem; margin-bottom: clamp(1.5rem, 4vw, 2.5rem); }
-.page-head h1 { font-size: var(--fs-4); font-weight: 600; }
+.page-head h1 { font-size: clamp(2.5rem, 8vw, 5.5rem); font-weight: 800; letter-spacing: -0.04em; line-height: 0.95; text-transform: uppercase; }
 
 /* ---------- Buttons（元の btn-pill / btn-secondary） */
 .btn {
@@ -174,11 +174,11 @@ a.tag:hover { border-color: var(--accent); color: var(--accent); }
 .site-header { position: fixed; inset: 0 0 auto 0; z-index: 100; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-bottom: 1px solid transparent; transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease); }
 .site-header[data-scrolled='true'] { border-bottom-color: var(--line); }
 .site-header__bar { display: flex; align-items: center; justify-content: space-between; min-height: var(--header-h); gap: 1rem; }
-.brand { display: inline-flex; align-items: center; gap: 0.6rem; font-weight: 600; font-size: 1rem; letter-spacing: -0.01em; color: var(--ink); text-decoration: none; white-space: nowrap; }
+.brand { display: inline-flex; align-items: center; gap: 0.6rem; font-weight: 600; font-size: var(--fs-1); letter-spacing: 0.02em; color: var(--ink); text-decoration: none; white-space: nowrap; }
 .brand img { width: 26px; height: 26px; border-radius: 6px; }
 .brand:hover { text-decoration: none; }
 .site-nav ul { display: flex; gap: clamp(1.25rem, 2.2vw, 2.25rem); }
-.site-nav a { position: relative; display: block; padding-bottom: 2px; text-decoration: none; font-size: var(--fs-0); color: var(--ink-soft); }
+.site-nav a { position: relative; display: block; padding-bottom: 2px; text-decoration: none; font-family: var(--font-mono); font-size: var(--fs-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-soft); }
 .site-nav a::after { content: ''; position: absolute; left: 0; right: 100%; bottom: 0; height: 1px; background: var(--accent); transition: right var(--dur-fast) var(--ease); }
 .site-nav a:hover::after, .site-nav a:focus-visible::after, .site-nav a[aria-current='page']::after { right: 0; }
 .site-nav a[aria-current='page'] { color: var(--accent-deep); }
@@ -189,7 +189,7 @@ a.tag:hover { border-color: var(--accent); color: var(--accent); }
 :root[data-theme='dark'] .icon-sun { display: none; } :root[data-theme='dark'] .icon-moon { display: block; }
 @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) .icon-sun { display: none; } :root:not([data-theme='light']) .icon-moon { display: block; } }
 .nav-toggle { display: none; align-items: center; gap: 0.6rem; margin-left: 0.5rem; }
-.nav-toggle__label { font-family: var(--font-mono); font-size: var(--fs-xs); }
+.nav-toggle__label { font-family: var(--font-mono); font-size: var(--fs-xs); letter-spacing: 0.16em; text-transform: uppercase; }
 .nav-toggle__icon { width: 22px; height: 14px; position: relative; }
 .nav-toggle__icon::before, .nav-toggle__icon::after { content: ''; position: absolute; left: 0; right: 0; height: 1px; background: currentColor; transition: transform var(--dur-fast) var(--ease); }
 .nav-toggle__icon::before { top: 0; } .nav-toggle__icon::after { bottom: 0; }
@@ -231,20 +231,43 @@ mark { background: var(--accent-soft); color: var(--accent-deep); border-radius:
 .site-footer a { text-decoration: none; color: var(--ink-soft); }
 .site-footer a:hover { color: var(--accent); }
 
-/* ---------- Home（元: Root ワードマーク + 等幅1行 + 番号付きカード） */
-.hero { position: relative; min-height: calc(100svh - 4rem); display: flex; align-items: center; padding-top: var(--header-h); overflow: hidden; }
-.hero__inner { position: relative; z-index: 1; width: 100%; }
-.hero__word { font-size: var(--fs-5); font-weight: 600; letter-spacing: -0.02em; }
-.hero__interests { margin-top: 0.85rem; font-family: var(--font-mono); font-size: var(--fs-0); color: var(--muted); }
-.hero__lede { margin-top: 1rem; color: var(--ink-soft); max-width: 46ch; }
-.hero__links { margin-top: clamp(2.5rem, 6vw, 4rem); display: grid; grid-template-columns: repeat(2, minmax(0, 16rem)); gap: 1rem; }
-.hero-card { display: flex; flex-direction: column; background: var(--bg-elev); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 1.25rem 1.4rem; text-decoration: none; transition: transform var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease); }
-.hero-card:hover, .hero-card:focus-visible { transform: translateY(-2px); border-color: var(--line-strong); box-shadow: var(--shadow-hover); }
-.hero-card__n { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--accent); }
-.hero-card__label { margin-top: 0.6rem; font-size: 1.25rem; font-weight: 600; }
-.hero-card__note { margin-top: 0.3rem; font-size: var(--fs-xs); color: var(--muted); }
-@media (max-width: 520px) { .hero__links { grid-template-columns: 1fr; } }
-@media (min-width: 1100px) { .hero__links { grid-template-columns: repeat(4, minmax(0, 16rem)); } }
+/* ---------- Home（大文字のタグライン + 等幅の補足 + 番号付きインデックス。nopo1 系の設計言語） */
+.hero { position: relative; min-height: 100svh; display: flex; overflow: hidden; }
+.hero__inner { position: relative; z-index: 1; width: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 2rem; padding-top: calc(var(--header-h) + 1.5rem); padding-bottom: clamp(1.5rem, 4vw, 2.5rem); }
+.hero__top { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; font-family: var(--font-mono); font-size: var(--fs-xs); letter-spacing: 0.08em; color: var(--muted); }
+.hero__kicker span { opacity: 0.7; }
+.hero__clock { font-variant-numeric: tabular-nums; }
+.hero__title { font-size: clamp(2.75rem, 17vw, 10rem); font-weight: 800; line-height: 0.92; letter-spacing: -0.04em; text-transform: uppercase; margin: 0; }
+.hero__title .line { display: block; overflow: hidden; padding-block: 0.04em; }
+.hero__title .line > span { display: block; animation: title-rise 0.95s var(--ease) both; animation-delay: calc(var(--i, 0) * 90ms + 2s); }
+.hero__title .line:nth-child(2) > span { --i: 1; } .hero__title .line:nth-child(3) > span { --i: 2; } .hero__title .line:nth-child(4) > span { --i: 3; }
+html.no-opening .hero__title .line > span { animation-delay: calc(var(--i, 0) * 90ms + 0.05s); }
+/* 輪郭文字: 塗りを背景色にして線を先に描く（paint-order）。フォントのグリフ内部で輪郭が重なる箇所（例: D）の線が、塗りで隠れる */
+.hero__title .line:last-child:not(:first-child) > span { color: var(--bg); -webkit-text-stroke: 3px var(--ink); paint-order: stroke fill; }
+@keyframes title-rise { from { transform: translateY(105%); } to { transform: none; } }
+.hero__bottom { display: flex; justify-content: space-between; align-items: flex-end; gap: 1.5rem; flex-wrap: wrap; opacity: 0; animation: fade-up 0.8s var(--ease) 2.45s both; }
+html.no-opening .hero__bottom, html.no-opening .hero__top { animation-delay: 0.3s; }
+.hero__top { animation: fade-up 0.8s var(--ease) 2.25s both; opacity: 0; }
+@keyframes fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
+.hero__interests { font-family: var(--font-mono); font-size: var(--fs-0); letter-spacing: 0.04em; color: var(--ink-soft); }
+.hero__lede { margin-top: 0.75rem; color: var(--ink-soft); max-width: 46ch; }
+.hero__explore { display: inline-flex; align-items: center; gap: 0.6rem; font-family: var(--font-mono); font-size: var(--fs-xs); letter-spacing: 0.16em; text-transform: uppercase; text-decoration: none; padding: 0.7rem 1.1rem; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); transition: border-color var(--dur-fast), color var(--dur-fast), background var(--dur-fast); }
+.hero__explore span { display: inline-block; transition: transform var(--dur-fast) var(--ease); }
+.hero__explore:hover { border-color: var(--accent); color: var(--accent); }
+.hero__explore:hover span { transform: translateY(3px); }
+
+.index { padding-block: var(--section-space) 0; }
+.index__list { list-style: none; border-top: 1px solid var(--line); }
+.index__list li { border-bottom: 1px solid var(--line); }
+.index__row { display: grid; grid-template-columns: 3.5rem minmax(0, 1fr) auto 2rem; align-items: baseline; gap: 1rem; padding: clamp(1.1rem, 3vw, 1.9rem) 0.25rem; text-decoration: none; transition: background var(--dur-fast) var(--ease), padding var(--dur-fast) var(--ease); }
+.index__n { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--muted); }
+.index__label { font-size: clamp(1.75rem, 5.5vw, 3.75rem); font-weight: 700; letter-spacing: -0.03em; line-height: 1; text-transform: uppercase; transition: transform var(--dur-med) var(--ease), color var(--dur-fast); }
+.index__note { font-size: var(--fs-0); color: var(--muted); text-align: right; }
+.index__arrow { font-size: 1.5rem; color: var(--muted); justify-self: end; transition: transform var(--dur-med) var(--ease), color var(--dur-fast); }
+.index__row:hover, .index__row:focus-visible { background: var(--bg-sunken); padding-inline: 1rem; }
+.index__row:hover .index__label, .index__row:focus-visible .index__label { transform: translateX(0.5rem); color: var(--accent-deep); }
+.index__row:hover .index__arrow, .index__row:focus-visible .index__arrow { transform: translateX(6px); color: var(--accent); }
+@media (max-width: 640px) { .index__row { grid-template-columns: 2.25rem minmax(0, 1fr) 1.5rem; } .index__note { display: none; } }
 
 .cosmic { position: absolute; inset: 0; overflow: hidden; pointer-events: none; color: var(--ink-soft); z-index: 0; }
 .cosmic svg { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.02; }
@@ -365,21 +388,33 @@ mark { background: var(--accent-soft); color: var(--accent-deep); border-radius:
 .form { display: grid; gap: 1.25rem; }
 @media (max-width: 960px) { .contact-layout { grid-template-columns: 1fr; } }
 
-/* ---------- Opening（元: 「Root」を輪郭→塗りで描く。CSSのみ。セッション中1回） */
-.opening { position: fixed; inset: 0; z-index: 150; display: flex; align-items: center; justify-content: center; background: var(--bg); animation: opening-exit 500ms var(--ease) forwards; animation-delay: 1.5s; }
-.opening.is-skipping { animation: opening-exit 300ms var(--ease) forwards !important; animation-delay: 0ms !important; }
+/* ---------- Opening（カウンター 000→100 + 進捗線 → 上下に割れて本編が現れる。CSSのみ・約2.7秒・セッション中1回）
+   差し替えるときは、このブロックと components/Opening.astro だけを変更する。 */
+@property --count { syntax: '<integer>'; initial-value: 0; inherits: false; }
+@counter-style pad3 { system: extends decimal; pad: 3 '0'; }
+
+.opening { position: fixed; inset: 0; z-index: 150; display: grid; place-items: center; animation: opening-life 2.65s linear forwards; }
 html.no-opening .opening { display: none; }
-.opening__word { font-weight: 600; font-size: clamp(2.2rem, 11vw, 6rem); line-height: 1; letter-spacing: -0.02em; text-align: center; }
-.opening__letter { display: inline-block; color: transparent; -webkit-text-stroke: 1.2px var(--accent); opacity: 0; transform: translateY(0.15em); animation: letter-draw 550ms var(--ease) forwards; animation-delay: calc(var(--i) * 90ms); }
-.opening__skip { position: absolute; right: var(--gutter); bottom: var(--gutter); font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--muted); opacity: 0; animation: rise-in 400ms var(--ease) forwards; animation-delay: 0.4s; }
+.opening__panel { position: absolute; left: 0; right: 0; height: 50.5%; background: var(--bg); will-change: transform; }
+.opening__panel--top { top: 0; animation: panel-up 0.75s cubic-bezier(0.76, 0, 0.24, 1) 1.8s both; }
+.opening__panel--bottom { bottom: 0; animation: panel-down 0.75s cubic-bezier(0.76, 0, 0.24, 1) 1.8s both; }
+.opening__content { position: relative; width: min(100% - 2 * var(--gutter), 60rem); display: grid; gap: 1rem; animation: content-out 0.25s var(--ease) 1.65s both; }
+.opening__name { font-family: var(--font-mono); font-size: var(--fs-xs); letter-spacing: 0.24em; text-transform: uppercase; color: var(--muted); opacity: 0; animation: fade-up 0.6s var(--ease) 0.1s both; }
+.opening__count { display: flex; align-items: baseline; gap: 0.25rem; font-size: clamp(4.5rem, 20vw, 13rem); font-weight: 800; line-height: 0.85; letter-spacing: -0.05em; font-variant-numeric: tabular-nums; }
+.opening__num { counter-reset: n var(--count); animation: opening-count 1.75s cubic-bezier(0.65, 0, 0.35, 1) 0.15s both; }
+.opening__num::after { content: counter(n, pad3); }
+.opening__pct { font-size: 0.28em; font-weight: 500; color: var(--muted); letter-spacing: 0; }
+.opening__bar { display: block; height: 1px; background: var(--line-strong); overflow: hidden; }
+.opening__bar i { display: block; height: 100%; background: var(--accent); transform-origin: left; transform: scaleX(0); animation: bar-fill 1.75s cubic-bezier(0.65, 0, 0.35, 1) 0.15s both; }
+.opening__skip { position: absolute; right: var(--gutter); bottom: var(--gutter); z-index: 2; font-family: var(--font-mono); font-size: var(--fs-xs); letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); opacity: 0; animation: fade-up 0.4s var(--ease) 0.5s both, content-out 0.25s var(--ease) 1.65s both; }
 .opening__skip:hover, .opening__skip:focus-visible { color: var(--ink); }
-@keyframes letter-draw {
-  0% { opacity: 0; transform: translateY(0.15em); color: transparent; -webkit-text-stroke: 1.2px var(--accent); }
-  40% { opacity: 1; transform: translateY(0); color: transparent; -webkit-text-stroke: 1.2px var(--accent); }
-  100% { opacity: 1; transform: translateY(0); color: var(--ink); -webkit-text-stroke: 0 transparent; }
-}
-@keyframes rise-in { to { opacity: 1; } }
-@keyframes opening-exit { 0%, 80% { opacity: 1; visibility: visible; } 100% { opacity: 0; visibility: hidden; } }
+.opening.is-skipping { animation: none; opacity: 0; visibility: hidden; transition: opacity 0.3s var(--ease), visibility 0.3s; }
+@keyframes opening-count { from { --count: 0; } to { --count: 100; } }
+@keyframes bar-fill { to { transform: scaleX(1); } }
+@keyframes content-out { to { opacity: 0; transform: translateY(-12px); } }
+@keyframes panel-up { to { transform: translateY(-101%); } }
+@keyframes panel-down { to { transform: translateY(101%); } }
+@keyframes opening-life { 0%, 99% { visibility: visible; } 100% { visibility: hidden; } }
 
 /* ---------- 流れ星 / スクロール表示 / 画面遷移 */
 /* 背面に置く（z-index:-1）。本文側に重なり順の枠を作らないため、オープニングなどが正しく最前面になる */
@@ -399,5 +434,6 @@ html.reveal-on .reveal.is-in { opacity: 1; transform: none; }
   *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }
   html.reveal-on .reveal { opacity: 1; transform: none; }
   #meteors { display: none; }
-  .opening { animation-delay: 0.3s; }
+  .opening { display: none; }
+  .hero__top, .hero__bottom { opacity: 1; animation: none; }
 }
diff --git a/tests/e2e/admin.spec.ts b/tests/e2e/admin.spec.ts
index 2824d7c..2d339a9 100644
--- a/tests/e2e/admin.spec.ts
+++ b/tests/e2e/admin.spec.ts
@@ -186,6 +186,29 @@ test.describe('管理画面: CMS', () => {
     await anon.close();
   });
 
+  test('トップページ: 大見出しを管理画面で変更すると公開側に反映される（元に戻す）', async ({ page, browser }) => {
+    await page.goto('/admin/home');
+    const title = page.locator('#f-heroTitle');
+    const original = await title.inputValue();
+    await title.fill('HELLO.\nWORLD.');
+    await page.getByRole('button', { name: '保存する' }).click();
+    await expect(page.locator('[data-savestate]')).toContainText('保存しました');
+    const anon = await browser.newContext();
+    await anon.addInitScript(() => { try { sessionStorage.setItem('rl-opening-seen', '1'); } catch { /* noop */ } });
+    const pub = await anon.newPage();
+    await pub.goto('http://localhost:4322/');
+    await expect(pub.getByRole('heading', { level: 1 })).toHaveText(/HELLO\.\s*WORLD\./);
+    await expect(pub.locator('.hero__title .line')).toHaveCount(2);
+    // 後続のテストに影響しないよう元に戻す
+    await page.reload();
+    await page.locator('#f-heroTitle').fill(original);
+    await page.getByRole('button', { name: '保存する' }).click();
+    await expect(page.locator('[data-savestate]')).toContainText('保存しました');
+    await pub.reload();
+    await expect(pub.getByRole('heading', { level: 1 })).toHaveText(/OBSERVE\./);
+    await anon.close();
+  });
+
   test('設定: ナビ/サイト名の編集と不正リンクの拒否、繰り返し項目の追加削除', async ({ page, browser }) => {
     await page.goto('/admin/site');
     const navForm = page.locator('form[data-wrap-key="nav"]');
diff --git a/tests/e2e/public.spec.ts b/tests/e2e/public.spec.ts
index 144fd5f..cded7ba 100644
--- a/tests/e2e/public.spec.ts
+++ b/tests/e2e/public.spec.ts
@@ -8,12 +8,20 @@ test.describe('公開サイト', () => {
   test('トップ: サイト名とブランド統一、主要ナビ', async ({ page }) => {
     await page.goto('/');
     await expect(page).toHaveTitle('るーとの研究室');
-    await expect(page.getByRole('heading', { level: 1 })).toHaveText('るーとの研究室');
+    // 大見出しはサイト名ではなくタグライン（大文字・3行・最後だけ輪郭文字）。サイト名は小さく表示する
+    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/OBSERVE\.\s*THINK\.\s*BUILD\./);
+    await expect(page.locator('.hero__title .line')).toHaveCount(3);
+    const strokeOf = (n: number) => page.locator('.hero__title .line').nth(n).locator('span').evaluate((el) => getComputedStyle(el).webkitTextStrokeWidth);
+    expect(await strokeOf(0)).toBe('0px');
+    expect(await strokeOf(2)).not.toBe('0px');
+    await expect(page.locator('.hero__kicker')).toContainText('るーとの研究室');
     await expect(page.getByText('Astronomy / Physics / Software / Quiz')).toBeVisible();
-    // 元サイトの番号付きカード（01〜04）
-    const cards = page.locator('.hero-card');
-    await expect(cards).toHaveCount(4);
-    await expect(cards.first().locator('.hero-card__n')).toHaveText('01');
+    await expect(page.locator('#clock')).toHaveText(/^\d{2}:\d{2}$/);
+    // 番号付きインデックス（01〜04）
+    const rows = page.locator('.index__row');
+    await expect(rows).toHaveCount(4);
+    await expect(rows.first().locator('.index__n')).toHaveText('01');
+    await expect(rows.first().locator('.index__label')).toHaveText('Projects');
     const nav = page.getByRole('navigation', { name: 'メイン' });
     for (const label of ['Projects', 'Blog', 'About', 'Contact']) await expect(nav.getByRole('link', { name: label })).toBeVisible();
     await expect(nav.getByRole('link', { name: 'Notes' })).toHaveCount(0);
@@ -185,19 +193,33 @@ test.describe('公開サイト', () => {
     expect(Math.max(r, g, b)).toBeLessThan(30); // 黒に近い
   });
 
-  test('オープニング: 初回のみ再生・Skipで閉じる・同セッションでは再生しない', async ({ browser }) => {
+  test('オープニング: カウンター→割れて本編・初回のみ・Skipで閉じる', async ({ browser }) => {
     const ctx = await browser.newContext(); const page = await ctx.newPage();
     await page.goto('/');
     const opening = page.locator('#opening');
     await expect(opening).toBeVisible();
-    await expect(opening.locator('.opening__letter')).toHaveCount('るーとの研究室'.length);
+    await expect(opening.locator('.opening__num')).toBeAttached();
+    await expect(opening.locator('.opening__bar')).toBeAttached();
+    await expect(opening.locator('.opening__panel')).toHaveCount(2);
     await page.getByRole('button', { name: 'Skip' }).click();
     await expect(opening).toHaveCount(0, { timeout: 3000 });
+    expect(await page.evaluate(() => sessionStorage.getItem('rl-opening-seen'))).toBe('1');
     await page.goto('/about'); await page.goto('/');
     await expect(page.locator('#opening')).toBeHidden(); // 再生済み（sessionStorage）
     await ctx.close();
   });
 
+  test('オープニング: 自動で終わり、本編の見出しが現れる', async ({ browser }) => {
+    const ctx = await browser.newContext(); const page = await ctx.newPage();
+    await page.goto('/');
+    await expect(page.locator('#opening')).toHaveCount(0, { timeout: 7000 }); // 約2.7秒で完了して片付く
+    expect(await page.evaluate(() => sessionStorage.getItem('rl-opening-seen'))).toBe('1');
+    await page.waitForTimeout(1200);
+    const y = await page.locator('.hero__title .line > span').first().evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
+    expect(y).toBe(0); // 見出しが所定の位置まで上がっている
+    await ctx.close();
+  });
+
   test('robots / sitemap / 管理画面のnoindex', async ({ request }) => {
     const robots = await (await request.get('/robots.txt')).text();
     expect(robots).toContain('Disallow: /admin');
__PATCH_design_END__
__PATCH_DATA__
