#!/usr/bin/env bash
# D1のバックアップ（SQLダンプ）。問い合わせ(個人情報)を含むため backups/ はGit管理外・取り扱い注意。
#   bash scripts/backup.sh            ローカルDB
#   bash scripts/backup.sh --remote   本番DB
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
require_node
MODE="--local"; [ "${1:-}" = "--remote" ] && MODE="--remote"
mkdir -p backups; chmod 700 backups
OUT="backups/d1-$(date +%Y%m%d-%H%M%S)${MODE/--/-}.sql"
npx wrangler d1 export DB "$MODE" --output "$OUT" >/dev/null
chmod 600 "$OUT"
ok "バックアップを作成しました: $OUT（$(wc -c <"$OUT") bytes）"
warn "このファイルには問い合わせの個人情報が含まれます。共有・コミットしないでください。"
