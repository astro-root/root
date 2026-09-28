# Root's Laboratory

Root's Laboratory の個人サイト。Astro（SSR / Cloudflare Pages）+ Firebase（Auth + Firestore）構成。

- 公開サイトは Firestore からリクエスト時にデータを読む（Adminで保存 → 即座にサイトに反映）
- Firebase未設定でも壊れない：`src/content/` のMarkdownに自動フォールバックする
- Admin (`/admin`) の権限チェックは **Firestore Security Rules** が本体。フロントエンドのガードはUXのためだけ

---

## 1. ローカル開発

```bash
npm install
npm run dev      # http://localhost:4321 （Firestore未設定でもMarkdownで動く）
npm run build    # dist/ にビルド（Cloudflare Workers形式）
npm run preview  # wrangler pages dev でビルド結果をローカル確認（Cloudflare実行環境の再現）
```

`npm run dev` の通常の Astro dev サーバーは Firebase を設定していなくても動きます。まずはこれで見た目を確認してください。

---

## 2. Firebaseのセットアップ（Admin機能に必須）

所要時間の目安は10〜15分です。

### 2-1. プロジェクト作成

1. https://console.firebase.google.com を開き、「プロジェクトを追加」
2. 名前は何でも良い（例: `roots-laboratory`）。Googleアナリティクスは不要ならオフでOK

### 2-2. Webアプリを追加してconfigを取得

1. プロジェクトの概要画面 →「</>」(Web) アイコン → アプリのニックネームを入力して登録
2. 表示される `firebaseConfig` の値を、プロジェクト直下の `.env`（`.env.example` をコピーして作成）に転記
   ```bash
   cp .env.example .env
   ```
3. `PUBLIC_FIREBASE_API_KEY` などを埋める

### 2-3. Authentication（ログイン用アカウント）

1. Firebase Console → Authentication → Sign-in method →「メール/パスワード」を有効化
2. Authentication → Users →「ユーザーを追加」→ 自分のメールアドレスとパスワードで**1人だけ**作成
3. 作成したユーザーの行に表示される **User UID** をコピー
4. `.env` の `PUBLIC_ADMIN_UID` に貼り付け

### 2-4. Firestore Database

1. Firebase Console → Firestore Database →「データベースの作成」→ 本番モードで作成（リージョンは `asia-northeast1` などお好みで）
2. 「ルール」タブを開き、このリポジトリの `firestore.rules` の中身をコピーして貼り付け
3. `ADMIN_UID_HERE` の部分を、2-3でコピーした User UID に書き換えてから「公開」

これで **書き込みはそのUIDでログインした人だけ**、**読み込みは公開データのみ誰でも**という制御が有効になります。

### 2-5. 既存コンテンツをFirestoreへ流し込む（任意・初回のみ）

今の About / Projects / Blog はそのままだと `src/content/` のMarkdownから読まれます（フォールバック）。Adminから管理したい場合は、一度だけ流し込んでください。

1. Firebase Console → プロジェクトの設定 → サービスアカウント →「新しい秘密鍵を生成」
2. ダウンロードしたJSONを `scripts/service-account.json` として保存（`.gitignore`済みなのでコミットされません）
3. 実行:
   ```bash
   npm run seed
   ```

実行後、Firebase Console の Firestore Database に `projects` `blog` `about` `settings` の各コレクションができているはずです。

### 2-6. Cloudflare Pages側の環境変数

Cloudflare Pages のプロジェクト設定 → Environment variables に、`.env` と同じ6つの `PUBLIC_FIREBASE_*` と `PUBLIC_ADMIN_UID` を追加してください（Production / Preview 両方）。

---

## 3. Admin (`/admin`) の使い方

`https://あなたのドメイン/admin` にアクセスし、2-3で作成したメールアドレス／パスワードでログインします。

| ページ | できること |
|---|---|
| `/admin` | Dashboard（件数の概要、クイックリンク） |
| `/admin/projects` | 一覧・削除・Featured切替・表示順の入れ替え |
| `/admin/projects/edit` | 新規作成・編集（`?id=...`） |
| `/admin/blog` | 一覧・削除・公開/非公開切替・Featured切替 |
| `/admin/blog/edit` | 新規作成・編集（Markdown本文） |
| `/admin/about` | About本文とプロフィール情報の編集 |
| `/admin/settings` | Heroの文言、サイト説明、SNS/Contactリンク、Footer文言 |

保存すると、次にそのページを開いた訪問者から即座に新しい内容が表示されます（ビルド不要）。

---

## 4. 動作確認チェックリスト

Firebaseのセットアップ（上記2章）が終わったら、実際に以下を確認してください。私の側では実在のFirebaseプロジェクトを持っていないため、この一連の動作は**あなたの環境でご確認いただく必要があります**。

- [ ] `/admin/login` でメール/パスワードでログインできる
- [ ] 管理者以外のアカウント（もし作った場合）ではログインできない、またはログインできてもデータ操作が失敗する
- [ ] `/admin/projects` で新規Projectを追加 → `/projects` に反映される
- [ ] Projectを編集 → 内容が公開ページに反映される
- [ ] Projectを削除 → 公開ページから消える
- [ ] 表示順（↑↓）を変更 → `/projects` の並び順が変わる
- [ ] Featuredを切り替え → Homeの「Featured Projects」に出入りする
- [ ] `/admin/blog` で記事を作成 → 「公開」チェックを外した状態では `/blog` に出ない
- [ ] 「公開」に切り替えると `/blog` に出る
- [ ] 記事を編集・削除できる
- [ ] `/admin/about` を編集 → `/about` とHomeの抜粋の両方に反映される
- [ ] `/admin/settings` でHero文言やSNSリンクを変更 → Home/Contact/Footerに反映される
- [ ] ログアウト後、`/admin/*` にアクセスすると `/admin/login` に戻される
- [ ] ブラウザの開発者ツールでFirestoreに直接書き込みリクエストを送っても（未ログイン状態で）拒否される（Security Rulesの確認）

うまくいかない項目があれば、エラーメッセージ（特に `status-msg` に赤字で出るもの）と一緒に教えてください。

---

## 5. 構成

```
src/
  components/       Nav, Footer, Opening, CosmicField, ProjectEntry, NoteRow
  content/          Firestore未設定時のフォールバック用Markdown（従来通り編集可）
  lib/
    content.ts          公開ページ用の統一データ取得（Firestore→なければMarkdown）
    firestore-rest.ts    サーバー側の読み取り専用REST実装（SDK不要、Workers対応）
    firebase-client.ts   ブラウザ側（/admin専用）：Auth + Firestore SDK
  layouts/
    Layout.astro         公開ページ共通レイアウト
    AdminLayout.astro    Admin共通レイアウト（サイドバー）
  pages/
    index.astro, about.astro, projects.astro, blog/*, contact.astro, 404.astro
    admin/               Admin一式（login, index, projects/*, blog/*, about, settings）
  styles/
    global.css   公開サイトのデザイントークン
    admin.css    Admin共通UI（ボタン・フォーム・テーブル等）
scripts/
  seed.mjs             ローカルMarkdown → Firestore への初回投入スクリプト
firestore.rules        Firestore Security Rules（実際の権限強制はここ）
.env.example           Firebase設定のテンプレート
```

---

## 6. 既知の制約・今後の調整点

- `public/og-default.svg` はSVGです。X/FacebookなどのOGP表示の多くはSVGに対応していないため、公開前にPNG（1200×630）に変換してください。
- Admin画面のFirebase SDKバンドルは約170KB(gzip)あります。`/admin` 配下でのみ読み込まれ、公開ページの訪問者には配信されません。
- Blogの本文はMarkdownとして保存し、表示時に `marked` でHTML化しています。Adminからの入力はサイト所有者本人のみが行う前提のため、サニタイズ処理は行っていません（第三者が投稿できる仕組みではないため）。
- 「Featured設定」はProjects/Blog双方に保存されますが、公開ページ側でBlogのFeaturedは現状「一覧の並び順（Featured優先→新着順）」にのみ使用しています。
- 私の環境ではCloudflare/Google Cloudの外部ネットワークにアクセスできないため、実在のFirebaseプロジェクトを使ったログイン・保存の動作確認はできていません。ビルドの成功、SSRでのページ表示、権限ガードのリダイレクトまでは確認済みです。上記チェックリストを、あなたの環境で実施してください。

## 7. デプロイ（Cloudflare Pages）

- Build command: `npm run build`
- Build output directory: `dist`
- Framework preset: Astro（`@astrojs/cloudflare` アダプタを使うため、SSR/Functionsとして自動的にデプロイされます）
- Environment variables: `.env` と同じ `PUBLIC_FIREBASE_*` / `PUBLIC_ADMIN_UID` を設定
- `astro.config.mjs` の `site` は実際のドメインに合わせてください（現在 `https://astro-root.com`）
