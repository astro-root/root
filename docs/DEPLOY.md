# デプロイ手順書（Cloudflare Pages + D1）

> **注意**: 本番環境への変更はすべて手動・明示的な操作で行います。このリポジトリのスクリプトは、確認なしに本番へ変更を加えません。
> 現在の公開サイト（`astro-root.pages.dev`）が Cloudflare Pages のどの方式（GitHub連携 / 手動アップロード）でデプロイされているかは、
> リポジトリからは判別できません。Cloudflare ダッシュボードで確認してください。

## 0. 全体像

```
GitHub ──push──▶ Cloudflare Pages（ビルド: npm run build → dist/）
                     │  Pages Functions(workerd) が SSR を実行
                     └──▶ D1（binding名: DB）  ← コンテンツ・設定・問い合わせ・セッション
```

## 1. D1 データベースを作成する（初回のみ）

```bash
npx wrangler login                          # ブラウザで認証（トークンはwranglerが管理）
npx wrangler d1 create roots-laboratory     # 表示される database_id を控える
```

`wrangler.toml` の `database_id` を、表示された値に置き換えてコミットします
（`database_id` はシークレットではありません）。

## 2. スキーマと既存コンテンツを本番DBへ

```bash
bash scripts/deploy.sh --migrate                       # テーブル作成（確認あり）
npm run db:seed:build
npx wrangler d1 execute DB --remote --file db/seed.sql # 既存のMarkdownコンテンツを投入
npm run admin:create -- --remote                       # 管理者を作成
```

`db/seed.sql` は `INSERT OR IGNORE` なので、再実行しても管理画面で編集済みの内容は上書きされません。

## 3. Cloudflare Pages の設定

ダッシュボード → Workers & Pages → 対象プロジェクト → Settings。

| 項目 | 値 |
|---|---|
| ビルドコマンド | `npm run build` |
| 出力ディレクトリ | `dist` |
| Node.js | 20 以上（環境変数 `NODE_VERSION=22`） |
| 環境変数（ビルド） | `SITE_URL=https://（公開ドメイン）` |
| **シークレット** | `IP_HASH_SALT`（`openssl rand -hex 32` などで生成した長いランダム値）。必要なら `TURNSTILE_SECRET` |
| D1 バインディング | `wrangler.toml` に定義済み（`DB`）。**`wrangler.toml` がある場合、バインドはファイル側が正**になります |

- 互換性フラグ `nodejs_compat` と互換日付は `wrangler.toml` に定義済みです。
- `robots.txt` と `sitemap.xml` は動的に生成されます（`public/` に静的ファイルは置きません）。カスタムドメインを使う場合は、ビルド変数 `SITE_URL` を合わせれば canonical / sitemap / OGP が追従します。

## 4. デプロイ

**A. GitHub連携（推奨）**: `bash scripts/git-push.sh` で push → Pages が自動ビルド。まず別ブランチ（`renewal` など）に push すると、プレビューURLで確認できます。

**B. 手動**: `export CF_PAGES_PROJECT=（プロジェクト名）` → `bash scripts/deploy.sh --pages`（check.sh 実行 → 確認 → デプロイ）。

## 5. 公開前チェックリスト

- [ ] `https://（ドメイン）/admin/login` でログインでき、問い合わせ・コンテンツを編集できる
- [ ] 管理画面で編集 → 公開サイトに即時反映される
- [ ] `/contact` から送信 → `/admin/contacts` に届く
- [ ] `/notes`, `/notes/（記事）` が `/blog` へ301される
- [ ] `/robots.txt` に `Disallow: /admin`、`/sitemap.xml` に公開コンテンツのみ
- [ ] `node scripts/smoke.mjs https://（ドメイン）` が全項目成功（※ サンプル記事 `q-room` / `cherenkov-blue` が存在する前提です。削除済みなら該当項目は失敗します）
- [ ] `docs/LEGAL_REVIEW.md` の確認事項を完了した
- [ ] 流れ星・テーマ切替・モバイル表示を実機で確認した
- [ ] `IP_HASH_SALT` が本番に設定されている（未設定だと弱いソルトでハッシュ化されます）

## 6. 旧サイト（Firebase構成）からの移行

- **リポジトリ内のコンテンツ**（`seed/content/*.md` = 旧 `src/content`）は上記のシードで移行されます。
- **旧管理画面から Firestore に追加・編集した内容**は、自動移行しません（移行スクリプトは未実装）。新しい管理画面で再入力するか、Firestore の公開データを元に手動で登録してください。旧Firestoreのデータは本リニューアルでは**削除しません**。
- 旧 `src/content` のプロジェクトにあった仮のURL（`example.com`、空の `github.com/`）は、実リンクではないためシードから除外しました。実URLは管理画面で設定してください。
- 旧SNSリンク（`github.com/`・`x.com/` の仮URL）は、実在する `https://github.com/astro-root` のみに置き換えています。追加は「基本・ナビ・SEO」から。

## 既知の制限・未検証事項

実際に動作確認したもの・していないものを区別して記載します。

**未検証（コードはあるが、実環境で確認できていない）**
- Cloudflare 本番環境（実際のCloudflare Pages / リモートD1）での動作。ローカル workerd（`wrangler pages dev`）での確認のみです。
- `wrangler d1 ... --remote` を使う操作（`deploy.sh`・`backup.sh --remote`・`create-admin --remote`）。ローカルでの動作のみ確認しています。
- Cloudflare Turnstile（`TURNSTILE_SECRET` / `PUBLIC_TURNSTILE_SITE_KEY`）の検証フロー。
- `scripts/git-push.sh` の push 本体（認証が必要なため）。ガードとメッセージのみ確認。
- `scripts/setup.sh --with-browser`、Chromebook実機でのセットアップ手順全体。
- 実機スマホでの表示（エミュレーション Pixel 7 のみ）。Safari/Firefox での表示。

**既知の制限**
- CSP に `'unsafe-inline'` を含む（Astroのインラインスクリプトのため）。
- 管理者ロールは `admin` のみ。
- 画像は D1 に保存（1枚1.5MBまで）。大量・大容量の画像が必要になった場合は R2 への移行を検討。
- 問い合わせ・コンテンツの検索は `LIKE`（部分一致）。数千件を超える規模では全文検索への移行を検討。
- 問い合わせは新着通知（メール送信）を行いません（管理画面で確認する方式）。
- 問い合わせの期限切れ削除は手動（管理画面のボタン）。自動削除はしません。
- アクセス解析は導入していません。
