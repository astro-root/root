# るーとの研究室

天文・物理・科学とソフトウェア開発を横断する、個人ラボラトリーのWebサイトです（旧 Root's Laboratory）。
公開サイトと、ブラウザから運営できる管理画面（CMS）を1つのプロジェクトで提供します。

| | |
|---|---|
| フレームワーク | [Astro 4](https://astro.build/)（SSR）+ `@astrojs/cloudflare` |
| ホスティング | Cloudflare Pages（Pages Functions / workerd） |
| データベース | Cloudflare D1（SQLite）。スキーマは `migrations/` |
| 認証 | サーバー側セッション（PBKDF2-SHA256 + HttpOnly Cookie + CSRFトークン） |
| テスト | Playwright（E2E）/ `astro check`（型）/ 独自リンター / 本番ビルドのスモークテスト |

> **以前の構成からの変更点**: 旧版は Firebase（Auth/Firestore）をブラウザから直接操作する構成でした。
> サーバー側での認証・認可、問い合わせの保存、レート制限を実現するため、Cloudflare D1 + サーバー側認証へ移行しています（理由は [docs/DATABASE.md](docs/DATABASE.md)）。

---

## 1. 事前準備（Chromebook）

1. 設定 → 「デベロッパー」→ **Linux開発環境** をオンにする。
2. Linuxターミナルを開き、以下を実行（初回のみ）。

   ```bash
   sudo apt update && sudo apt install -y git curl ca-certificates
   # Node.js 20 以上（nvm を使う例。ホームディレクトリ内にのみ入るのでシステムを汚しません）
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   exec bash && nvm install 22
   node -v   # v22.x.x
   ```
3. GitHub認証（どちらか）:
   - `sudo apt install gh && gh auth login`（ブラウザで認証。トークンはgh が安全に保管）
   - または SSH 鍵: `ssh-keygen -t ed25519` → 公開鍵 `~/.ssh/id_ed25519.pub` を GitHub に登録。

## 2. セットアップ（5分）

```bash
git clone git@github.com:astro-root/（リポジトリ名）.git roots-laboratory   # 公開サイトのリポジトリ
cd roots-laboratory
bash scripts/setup.sh          # 依存関係・.dev.vars・ローカルDB・既存コンテンツの投入
npm run admin:create           # 管理者を作成（パスワードは画面に表示されません）
bash scripts/dev.sh            # http://localhost:4321
```

- 公開サイト: <http://localhost:4321>　管理画面: <http://localhost:4321/admin>
- ChromebookのLinuxで起動したサーバーは、Chrome OS側のブラウザから `localhost` で開けます。
- スマホ実機で確認したい場合は `bash scripts/dev.sh --host` で起動し、表示された `Network:` のURLを開きます（同一Wi-Fi内のみ）。

`setup.sh` は何度実行しても安全です（既存の `.dev.vars` とDBの内容は上書きしません）。`sudo` やシステム設定の変更は行いません。

## 3. スクリプト一覧

| コマンド | 内容 |
|---|---|
| `bash scripts/setup.sh` | 開発環境のセットアップ（`--skip-install` / `--with-browser`） |
| `bash scripts/dev.sh` | 開発サーバー起動（DBを最新スキーマに） |
| `bash scripts/check.sh` | **Lint → 型チェック → ビルド → 本番ビルドのスモークテスト**（`--quick` / `--e2e`） |
| `bash scripts/git-push.sh` | 内容を表示 → 品質チェック → **`yes` と入力した場合のみ** push |
| `bash scripts/deploy.sh --migrate` / `--pages` | 本番DBのマイグレーション / Pagesへのデプロイ（**各々確認あり**） |
| `bash scripts/backup.sh [--remote]` | D1のSQLバックアップ（`backups/`、Git管理外） |
| `bash scripts/restore.sh <file>` | バックアップの復元（空DBへの復元に限定） |
| `npm run admin:create [-- --remote]` | 管理者の作成・パスワード再設定 |
| `npm run test:e2e` | PlaywrightのE2E（下記） |

どのスクリプトも、確認なしに本番へ変更を加えません。

## 4. 環境変数・シークレット

| 名前 | 場所 | 必須 | 説明 |
|---|---|---|---|
| `IP_HASH_SALT` | `.dev.vars`（ローカル）/ Pages の**シークレット**（本番） | 本番は必須 | 送信元IPをハッシュ化する際のソルト。長いランダム文字列（`setup.sh` が自動生成） |
| `TURNSTILE_SECRET` | 同上 | 任意 | 設定すると問い合わせフォームで Cloudflare Turnstile を検証 |
| `PUBLIC_TURNSTILE_SITE_KEY` | `.env` / Pages のビルド変数 | 任意 | Turnstile のサイトキー（公開値）。`TURNSTILE_SECRET` とセットで設定 |
| `SITE_URL` | `.env` / Pages のビルド変数 | 推奨 | 公開URL。canonical・sitemap・OGPの基準（既定 `https://astro-root.com`） |
| `CLOUDFLARE_API_TOKEN` | 実行時のシェル環境のみ | デプロイ時 | `scripts/deploy.sh` 用。**ファイルに書かない** |
| `CF_PAGES_PROJECT` | 実行時のシェル環境 | デプロイ時 | Pages のプロジェクト名 |

`.env` / `.dev.vars` は `.gitignore` 済みです。雛形は `.env.example` / `.dev.vars.example`。

## 5. 管理者アカウント

- **作成**: `npm run admin:create`（ローカル）／`npm run admin:create -- --remote`（本番、確認あり）。メールとパスワード（12文字以上）を対話入力します。
- **復旧（パスワードを忘れた）**: 同じコマンドを同じメールアドレスで再実行すると、パスワードが更新され、**全セッションが失効**します。
- **変更**: 管理画面の「アカウント」から（他端末のログインは無効化されます）。
- デフォルトの管理者・固定パスワードは存在しません。パスワードはPBKDF2-SHA256（10万回）でハッシュ化されて保存され、平文はファイルにもログにも残りません。
- ロールは現在 `admin` のみです（`admins.role` 列は将来の拡張用）。複数管理者が必要な場合は、異なるメールで `admin:create` を実行します。

## 6. 管理画面でできること

ダッシュボード / プロジェクト・ブログ（下書き・公開・非公開・予約公開、Markdown編集+プレビュー、画像アップロード、SEO）/ プロフィール / トップページ（セクションの順序・表示切替・お知らせ）/ 利用規約・プライバシーポリシー / 問い合わせ（ステータス・メモ・削除・期限切れ一括削除）/ メディア / サイト設定（名称・ロゴ・ナビ・フッター・SNS・SEO/OGP）/ 表示設定（**流れ星のON/OFFと頻度**、オープニング、スクロール演出）/ アカウント。

**公開への反映**: コンテンツはリクエストごとにD1から読むため、保存した内容は**再ビルド・再デプロイなしで即時反映**されます。

## 7. テスト

```bash
bash scripts/check.sh            # Lint + 型 + ビルド + 本番スモーク（約80秒）
bash scripts/check.sh --e2e      # さらにE2E
```

E2E は専用DB（`.e2e/`）を毎回作り直すため、開発用DBには影響しません。

- ブラウザが無い場合: `npx playwright install chromium`。Chromebookで共有ライブラリが不足する場合は、すでにインストール済みのChromium/Chromeがあれば `CHROME_PATH=/path/to/chrome npm run test:e2e` で使えます。
- E2E は `astro dev` に対して動きます。**本番ビルド固有の問題**は `scripts/smoke.mjs`（`check.sh` に組み込み済み）が検出します。

## 8. デプロイ・DB

- 初回の Cloudflare 側の設定（D1作成・バインド・シークレット・Pagesプロジェクト）: **[docs/DEPLOY.md](docs/DEPLOY.md)**
- スキーマ・マイグレーション・バックアップ/復元・データ保持: **[docs/DATABASE.md](docs/DATABASE.md)**
- 利用規約・プライバシーポリシーの確認事項: **[docs/LEGAL_REVIEW.md](docs/LEGAL_REVIEW.md)**

## 9. GitHubへの反映

```bash
git status                        # 変更内容を確認
git add -A && git commit -m "リニューアル: るーとの研究室"
bash scripts/git-push.sh          # 内容を確認し、yes と入力した場合のみ push
```

リモートが未設定なら `git remote add origin git@github.com:astro-root/（リポジトリ名）.git`。
既存の `main` を置き換える場合は、**必ず新しいブランチ（例: `renewal`）にpushしてPull Requestで確認**してから統合してください。

## 10. ディレクトリ構成

```
src/pages/            公開ページ / admin/（管理画面）/ api/（公開API・管理API）
src/layouts, components, styles/   デザインシステム（global.css = 公開・管理画面共通トークン）
src/lib/              auth（認証・レート制限）/ content（D1アクセス）/ markdown（サニタイズ）/ admin-schema（サーバー側検証）
src/middleware.ts     旧URLの301・Origin検査・管理画面の認証/CSRF・セキュリティヘッダー
src/scripts/          ブラウザ側JS（検索・流れ星・管理画面）
migrations/           D1スキーマ   seed/  初期コンテンツ（Markdown）   scripts/  開発・運用スクリプト
tests/e2e/            Playwright
```

## 11. セキュリティ上の注意

- 管理画面・管理APIはサーバー側で毎回セッションを検証し、変更系は **CSRFトークン + 同一Origin検査** を要求します。ログイン試行・問い合わせ・パスワード変更にはレート制限があります。
- MarkdownはサーバーでHTMLを無効化（生HTMLはエスケープ）し、`javascript:` などのURLを除去します。管理画面のプレビューも同じレンダラーです。
- CSPには `'unsafe-inline'`（スクリプト/スタイル）を含みます。Astroがインラインスクリプトを出力するためで、nonce化は未対応です（既知の制限）。
- 画像アップロードはマジックバイトでPNG/JPEG/GIF/WebPのみ許可（SVGは不許可）、1.5MBまで。
- 問い合わせにはIPアドレスそのものを保存せず、ソルト付きハッシュのみ保存します。
- `backups/` のSQLには個人情報が含まれます。共有・コミットしないでください。

## 12. 既知の制限・未対応

[docs/DEPLOY.md の末尾](docs/DEPLOY.md#既知の制限未検証事項) を参照してください。
