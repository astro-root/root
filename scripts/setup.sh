#!/usr/bin/env bash
# 開発環境のセットアップ（何度実行しても安全）。sudo・システム設定の変更・シークレットの直書きは行わない。
#   bash scripts/setup.sh                 依存関係 + ローカルDB
#   bash scripts/setup.sh --skip-install  npm install を省略
#   bash scripts/setup.sh --with-browser  E2E用のChromiumも取得（Playwright）
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

SKIP_INSTALL=0; WITH_BROWSER=0
for a in "$@"; do case "$a" in --skip-install) SKIP_INSTALL=1;; --with-browser) WITH_BROWSER=1;; -h|--help) sed -n '2,6p' "$0"; exit 0;; *) die "不明なオプション: $a";; esac; done

require_node; need npm "Node.js に同梱されています。"; need git "sudo apt install git で入れてください。"
ok "Node $(node -v) / npm $(npm -v) / git $(git --version | awk '{print $3}')"

if [ "$SKIP_INSTALL" = 0 ]; then info "依存関係をインストール中…"; npm install --no-audit --no-fund; ok "依存関係OK"; fi

# .dev.vars（ローカルのシークレット。Gitには含まれない）
if [ ! -f .dev.vars ]; then
  cp .dev.vars.example .dev.vars
  salt="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  # 値だけを置換（シークレットはこのファイルにのみ書かれ、スクリプトには残らない）
  node -e "const fs=require('fs');let s=fs.readFileSync('.dev.vars','utf8').replace(/^IP_HASH_SALT=.*/m,'IP_HASH_SALT='+process.argv[1]);fs.writeFileSync('.dev.vars',s)" "$salt"
  ok ".dev.vars を作成しました（IP_HASH_SALT を自動生成）"
else ok ".dev.vars は既にあります（変更しません）"; fi
[ -f .env ] || { cp .env.example .env; ok ".env を作成しました（必要なら SITE_URL を編集）"; }

info "アイコン・シードデータを生成中…"
node scripts/build-seed.mjs >/dev/null && ok "db/seed.sql を生成"

info "ローカルDB（D1）にマイグレーションを適用中…"
npx wrangler d1 migrations apply DB --local >/dev/null
count="$(npx wrangler d1 execute DB --local --json --command 'SELECT COUNT(*) AS n FROM projects' 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s)[0].results[0].n)}catch{console.log(0)}})")"
if [ "$count" = "0" ]; then npx wrangler d1 execute DB --local --file db/seed.sql >/dev/null; ok "既存コンテンツをローカルDBに投入しました"; else ok "ローカルDBに既にコンテンツがあります（上書きしません）"; fi

if [ "$WITH_BROWSER" = 1 ]; then info "Chromium を取得中…"; npx playwright install chromium; ok "Chromium OK（依存ライブラリが不足する場合は README の「E2Eテスト」を参照）"; fi

cat <<MSG

${C_OK}セットアップ完了${C_OFF}。次の手順:
  1) 管理者を作る:  npm run admin:create
  2) 開発サーバー:  bash scripts/dev.sh      → http://localhost:4321
  3) 管理画面:      http://localhost:4321/admin
MSG
