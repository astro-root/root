#!/usr/bin/env bash
# 開発サーバーの起動。ローカルDBが未準備なら先に準備する。
#   bash scripts/dev.sh              http://localhost:4321
#   bash scripts/dev.sh --host       LAN内の他端末からも開く（スマホ実機確認用）
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
require_node
[ -d node_modules ] || die "依存関係がありません。先に bash scripts/setup.sh を実行してください。"
[ -f .dev.vars ] || die ".dev.vars がありません。先に bash scripts/setup.sh を実行してください。"
info "ローカルDBを最新のスキーマにします（適用済みならそのまま）…"
npx wrangler d1 migrations apply DB --local >/dev/null
ok "開発サーバーを起動します → http://localhost:4321  （終了: Ctrl+C）"
exec npx astro dev "$@"
