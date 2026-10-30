#!/usr/bin/env bash
# 共通関数。直接実行せず、他のスクリプトから `source` する。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -t 1 ]; then C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'; else C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_OFF=""; fi
info() { echo "${C_DIM}→${C_OFF} $*"; }
ok()   { echo "${C_OK}✓${C_OFF} $*"; }
warn() { echo "${C_WARN}!${C_OFF} $*" >&2; }
die()  { echo "${C_ERR}✗ $*${C_OFF}" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 が見つかりません。$2"; }

require_node() {
  need node "Node.js 20 以上をインストールしてください（README の「事前準備」参照）。"
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] || die "Node.js $major では動きません。20 以上が必要です（現在: $(node -v)）。"
}

confirm() { # confirm "メッセージ" → yes と入力した場合のみ成功
  local ans; read -r -p "$1 (yes/no): " ans
  [ "$ans" = "yes" ]
}
