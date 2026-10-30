# データベース（Cloudflare D1）

## なぜ Firebase から D1 へ移行したか

要件は「サーバー側での認証・認可」「問い合わせの安全な保存」「レート制限・スパム対策」「管理APIの保護」でした。
旧構成（ブラウザから Firestore を直接操作）では、権限の最終防衛線が Security Rules のみで、レート制限・CSRF対策・サーバー側検証を置けません。
D1 は同じ Cloudflare アカウント内で完結し（新規ベンダー追加なし）、`wrangler` でローカルに実DBを再現できるため、自動テストが可能です。

## テーブル（`migrations/0001_init.sql`）

| テーブル | 用途 |
|---|---|
| `admins` | 管理者（`email`, `password_hash` = `pbkdf2$反復$salt$hash`, `role`） |
| `sessions` | ログインセッション（`token_hash` = Cookieトークンの SHA-256。生トークンは保存しない / `csrf` / `expires_at`） |
| `settings` | サイト設定（`key` ごとにJSON）: `site` `nav` `footer` `social` `seo` `display` `home` `contact` |
| `pages` | Markdown本文の固定ページ: `about` `terms` `privacy` |
| `projects` | プロジェクト（`state`: draft/published/private、`technology`はJSON配列） |
| `posts` | ブログ記事（`state`、`tags`はJSON配列、`published_at`が未来なら予約公開） |
| `contacts` | 問い合わせ（`status`: new/in_progress/done、`admin_note`、`ip_hash`） |
| `rate_limits` | レート制限カウンタ（固定ウィンドウ。古い行は確率的に掃除） |
| `media` | アップロード画像（BLOB）。`/media/:id` で配信 |

設定の既定値は `src/lib/defaults.ts` にあり、DBに値が無い項目は既定値で動きます（設定テーブルが空でもサイトは表示されます）。

## マイグレーション

- 新しい変更は `migrations/0002_*.sql` のように**連番で追加**します（既存ファイルは編集しない）。
- ローカル: `npm run db:migrate:local` / 本番: `bash scripts/deploy.sh --migrate`（適用前に `backup.sh --remote` を推奨）。
- 破壊的変更（列削除など）は、バックアップ取得とプレビュー環境での確認後に行ってください。

## バックアップ・復元

```bash
bash scripts/backup.sh --remote                         # backups/d1-日時-remote.sql（権限600）
bash scripts/restore.sh backups/xxx.sql                 # ローカルDBを作り直して復元
```

**本番の復元（切り戻し）は、既存DBを上書きしません**:

```bash
npx wrangler d1 create roots-laboratory-restore
bash scripts/restore.sh backups/xxx.sql --remote-db roots-laboratory-restore
# 確認後、wrangler.toml の database_id を新DBに差し替えて再デプロイ
```

バックアップ→ローカル全消去→復元で、プロジェクト・記事・ページ・管理者の件数が一致することを確認済みです。
D1 には Cloudflare 側の Time Travel（直近30日の任意時点への復元）もあります。併用を推奨します。

## 個人情報（問い合わせ）の取扱い

- 保存項目: 名前・メール・件名・本文・受信日時・IPの**ソルト付きハッシュ**（IP自体は保存しない）。
- アクセス: 管理者のみ（サーバー側でセッション検証）。
- 保存期間: 既定365日の目安（管理画面「基本・ナビ・SEO」で変更）。期限を過ぎた分は「問い合わせ」画面の**期限切れを削除**で一括削除（自動削除ではありません）。
- 個別削除: 問い合わせ詳細の「削除」。開示・訂正・削除の請求は `/contact` で受け付ける旨をプライバシーポリシーに記載しています。
- 上限: 保存件数が5000件に達すると新規受付を停止します（攻撃時のDB肥大化対策）。
