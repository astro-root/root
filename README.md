# Root's Laboratory

Root's Laboratory の個人サイト。Astro + TypeScript による静的サイトで、Cloudflare Pages へのデプロイを前提にしています。

## 使い方

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ に静的出力
npm run preview  # ビルド結果をローカルで確認
```

## 構成

```
src/
  components/   Nav, Footer, Opening（オープニング演出）, ProjectEntry, NoteRow
  content/      編集するコンテンツはすべてここ
    about/      About本文（index.md 1本）
    blog/       ブログ記事（Markdownファイル 1記事 = 1ファイル）
    projects/   プロジェクト一覧（Markdownファイル 1件 = 1ファイル）
    config.ts   上記コレクションのスキーマ定義
  data/
    interests.ts  Home/Aboutで使う興味分野のラベルと一言
  layouts/
    Layout.astro   共通の<head>・SEO・Nav/Footer
  pages/
    index.astro     Home（Opening + Hero + 各セクション）
    about.astro
    projects.astro
    blog/index.astro, blog/[slug].astro
    contact.astro
    404.astro
  styles/global.css  デザイントークン（色・フォント・余白）とリセット
public/
  favicon.svg, og-default.svg, robots.txt
```

## コンテンツの編集

- **About本文** → `src/content/about/index.md` を直接編集するだけで `/about` とHomeの抜粋の両方に反映されます。
- **ブログ記事の追加** → `src/content/blog/` に新しい `.md` ファイルを追加。frontmatterは既存記事を参考に。`published: false` にすると非公開のまま保存できます。
- **プロジェクトの追加・更新** → `src/content/projects/` に同様に `.md` を追加。`featured: true` にするとHomeの「Featured Projects」に表示されます（先着4件）。
- **興味分野のラベル** → `src/data/interests.ts`

すべてスキーマ（`src/content/config.ts`）で型チェックされるため、必須項目が抜けているとビルド時にエラーで教えてくれます。

## 将来のブログ管理画面について

`blog` コレクションのスキーマ（title / slug / date / category / tags / thumbnail / content / published）は、将来ブラウザ上のエディタ（Gemini APIによる下書き支援などを想定）から記事を作成・公開する仕組みに差し替えても、ページ側のコード（`getCollection` / `getEntry` を呼ぶだけ）を変えずに済むように設計してあります。実際の管理画面・データベース連携・Gemini APIの呼び出しは今回のスコープには含めていません。実装する際は、APIキーをクライアントに露出させないよう、Cloudflare Pages Functions などサーバー側からのみ呼び出してください。

## 既知の未対応・要調整

- `public/og-default.svg` はSVGです。X(Twitter)やFacebookなどSNSのOGP表示は多くがSVGに対応していないため、実運用前にPNG（1200×630）へ変換してください。
- `src/components/Footer.astro` / `src/pages/contact.astro` のGitHub・XリンクはプレースホルダーURLです。実際のアカウントURLに差し替えてください。
- 画像を追加する場合は、各コレクションのスキーマに `image()` フィールド（`thumbnail` / `cover`）を用意済みなので、frontmatterに画像パスを追加するだけで使えます。

## デプロイ（Cloudflare Pages）

- Build command: `npm run build`
- Build output directory: `dist`
- `astro.config.mjs` の `site` を実際のドメインに合わせてください（現在 `https://astro-root.com`）。
