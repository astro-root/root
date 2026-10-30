#!/usr/bin/env bash
# バックアップの復元。既存データを守るため、復元先は「空のDB」に限る。
#   bash scripts/restore.sh backups/xxx.sql                  ローカルDBを作り直して復元（確認あり）
#   bash scripts/restore.sh backups/xxx.sql --remote-db NAME 新しく作った空のリモートD1「NAME」へ復元
# 本番の切り戻し: 新しいD1へ復元 → wrangler.toml の database_id を差し替えて再デプロイ（docs/DATABASE.md）
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
require_node
FILE="${1:-}"; [ -f "$FILE" ] || die "バックアップファイルを指定してください。例: bash scripts/restore.sh backups/d1-....sql"
if [ "${2:-}" = "--remote-db" ]; then
  NAME="${3:-}"; [ -n "$NAME" ] || die "--remote-db にD1の名前を指定してください。"
  confirm "リモートD1「$NAME」に $FILE を流し込みます。空のDBである必要があります。続行しますか？" || { echo "中止しました。"; exit 0; }
  npx wrangler d1 execute "$NAME" --remote --file "$FILE"; ok "復元しました"
else
  confirm "ローカルDB（.wrangler/state）を削除して $FILE から作り直します。続行しますか？" || { echo "中止しました。"; exit 0; }
  rm -rf .wrangler/state; npx wrangler d1 execute DB --local --file "$FILE" >/dev/null; ok "ローカルDBを復元しました"
fi
