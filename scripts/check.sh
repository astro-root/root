#!/usr/bin/env bash
# 品質チェック一式: Lint → 型チェック → ビルド → 本番ビルドのスモークテスト（任意でE2E）。
#   bash scripts/check.sh            Lint + 型 + ビルド + スモーク
#   bash scripts/check.sh --e2e      さらにPlaywrightのE2E（ブラウザが必要）
#   bash scripts/check.sh --quick    Lint + 型のみ
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
require_node
QUICK=0; E2E=0
for a in "$@"; do case "$a" in --quick) QUICK=1;; --e2e) E2E=1;; -h|--help) sed -n '2,6p' "$0"; exit 0;; *) die "不明なオプション: $a";; esac; done
[ -d node_modules ] || die "依存関係がありません。先に bash scripts/setup.sh を実行してください。"

info "1/4 Lint";      node scripts/lint.mjs
info "2/4 型チェック"; npx astro check 2>&1 | tail -4
[ "$QUICK" = 1 ] && { ok "quick チェック完了"; exit 0; }

info "3/4 ビルド";    npx astro build 2>&1 | grep -E "error|Complete" || true
[ -d dist ] || die "ビルドに失敗しました。"

# 4/4 本番ビルドをCloudflare互換(workerd)で起動してスモークテスト。専用DBを使い、開発用DBには触れない。
info "4/4 本番ビルドのスモークテスト"
PORT=4390; TMP="$(mktemp -d)"; LOG="$TMP/server.log"
cleanup() { [ -n "${SRV:-}" ] && kill -TERM -- "-$SRV" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
npx wrangler d1 migrations apply DB --local --persist-to "$TMP/state" >/dev/null
node scripts/build-seed.mjs >/dev/null
npx wrangler d1 execute DB --local --persist-to "$TMP/state" --file db/seed.sql >/dev/null
setsid npx wrangler pages dev dist --port "$PORT" --persist-to "$TMP/state" >"$LOG" 2>&1 &
SRV=$!
for _ in $(seq 1 60); do curl -fsS -o /dev/null "http://localhost:$PORT/" 2>/dev/null && break; sleep 1; done
curl -fsS -o /dev/null "http://localhost:$PORT/" 2>/dev/null || { cat "$LOG"; die "本番ビルドの起動に失敗しました。"; }
node scripts/smoke.mjs "http://localhost:$PORT"

if [ "$E2E" = 1 ]; then
  info "E2E（Playwright）"
  npx playwright test
fi
ok "すべてのチェックが完了しました"
