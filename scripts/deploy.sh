#!/usr/bin/env bash
# 本番デプロイ（Cloudflare Pages）。明示的な確認なしには何も実行しない。
#   bash scripts/deploy.sh --migrate    本番DBのマイグレーション適用のみ
#   bash scripts/deploy.sh --pages      ビルドして Pages にデプロイ
# 認証: `npx wrangler login`（ブラウザ認証）または環境変数 CLOUDFLARE_API_TOKEN。トークンをファイルに書かないこと。
# Pages プロジェクト名: 環境変数 CF_PAGES_PROJECT（例: astro-root）
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
require_node
DO_MIGRATE=0; DO_PAGES=0
for a in "$@"; do case "$a" in --migrate) DO_MIGRATE=1;; --pages) DO_PAGES=1;; -h|--help) sed -n '2,7p' "$0"; exit 0;; *) die "不明なオプション: $a";; esac; done
[ "$DO_MIGRATE$DO_PAGES" = "00" ] && die "--migrate か --pages を指定してください（何も指定されていないため何もしません）。"
grep -q '00000000-0000-0000-0000-000000000000' wrangler.toml && die "wrangler.toml の database_id がプレースホルダのままです。docs/DEPLOY.md の手順で D1 を作成し、ID を設定してください。"

if [ "$DO_MIGRATE" = 1 ]; then
  echo "本番DB（remote）に未適用のマイグレーションを適用します。"; npx wrangler d1 migrations list DB --remote || true
  confirm "本番DBにマイグレーションを適用しますか？ 事前に bash scripts/backup.sh --remote を推奨します。" || { echo "中止しました。"; exit 0; }
  npx wrangler d1 migrations apply DB --remote; ok "マイグレーション適用完了"
fi

if [ "$DO_PAGES" = 1 ]; then
  : "${CF_PAGES_PROJECT:?環境変数 CF_PAGES_PROJECT（Pagesのプロジェクト名）を設定してください}"
  bash scripts/check.sh
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  [ -z "$(git status --porcelain 2>/dev/null)" ] || warn "コミットされていない変更があります（デプロイ内容はワーキングツリーの状態です）。"
  confirm "プロジェクト「$CF_PAGES_PROJECT」の本番(ブランチ: $branch)にデプロイしますか？" || { echo "中止しました。"; exit 0; }
  npx wrangler pages deploy dist --project-name "$CF_PAGES_PROJECT" --branch main
  ok "デプロイ完了。公開サイトで動作を確認してください。"
fi
