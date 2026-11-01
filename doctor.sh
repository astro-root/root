#!/usr/bin/env bash
# 診断: Wrangler のローカル実行エンジン(workerd)が動くかを調べ、「write EPIPE」などの原因を切り分ける。
# このファイルは単体で動きます（どこに置いても実行可能）。何も変更しません（一時ファイルのみ）。
#
#   bash doctor.sh              カレントディレクトリのプロジェクトを診断
#   bash doctor.sh ~/astro-root プロジェクトのパスを指定
#
# `write EPIPE` は「workerd が起動直後に終了した」ときに出ます。以下で、起動できない理由を確認します。
REPO="${1:-$(pwd)}"
if [ -d "$(dirname "${BASH_SOURCE[0]}")/../node_modules" ] && [ -z "${1:-}" ]; then REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; fi

if [ -t 1 ]; then OK=$'\033[32m'; NG=$'\033[31m'; WN=$'\033[33m'; DM=$'\033[2m'; OFF=$'\033[0m'; else OK=""; NG=""; WN=""; DM=""; OFF=""; fi
PASS=0; FAIL=0; WARN=0
ok()   { echo "  ${OK}✓${OFF} $*"; PASS=$((PASS+1)); }
ng()   { echo "  ${NG}✗${OFF} $*"; FAIL=$((FAIL+1)); }
wn()   { echo "  ${WN}!${OFF} $*"; WARN=$((WARN+1)); }
sec()  { echo; echo "■ $*"; }

echo "診断対象: $REPO"

sec "1. 環境"
ARCH="$(uname -m)"
echo "  CPUアーキテクチャ: $ARCH"
[ -r /etc/os-release ] && echo "  OS: $(. /etc/os-release; echo "$PRETTY_NAME")"
GLIBC="$(ldd --version 2>/dev/null | head -n1)"; echo "  glibc: ${GLIBC:-不明}"
echo "  Node: $(node -v 2>/dev/null || echo 未インストール) / npm: $(npm -v 2>/dev/null || echo 未インストール)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 20 ] && ok "Node.js 20 以上" || ng "Node.js 20 以上が必要です"

sec "2. CPU・メモリ・ディスク"
if [ -r /proc/cpuinfo ]; then
  MODEL="$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ *//')"
  [ -n "$MODEL" ] && echo "  CPU: $MODEL"
  FLAGS="$(grep -m1 '^flags' /proc/cpuinfo)"
  for f in sse4_2 avx avx2 bmi2; do
    if echo "$FLAGS" | grep -qw "$f"; then echo "  ${DM}命令セット $f: あり${OFF}"; else echo "  ${WN}命令セット $f: なし${OFF}"; fi
  done
fi
MEM_TOTAL="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null)"
MEM_AVAIL="$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null)"
echo "  メモリ: 合計 ${MEM_TOTAL:-?} MB / 利用可能 ${MEM_AVAIL:-?} MB"
[ -n "$MEM_AVAIL" ] && [ "$MEM_AVAIL" -lt 600 ] && wn "利用可能メモリが少ない（600MB未満）。他のアプリを閉じるか、Linuxのメモリ割り当てを増やしてください" || true
DISK="$(df -Pm "$REPO" 2>/dev/null | awk 'NR==2 {print $4}')"
echo "  ディスク空き: ${DISK:-?} MB"
[ -n "$DISK" ] && [ "$DISK" -lt 500 ] && wn "ディスクの空きが少ない（500MB未満）" || true

sec "3. workerd（Wranglerが使うローカル実行エンジン）"
if [ ! -d "$REPO/node_modules" ]; then
  ng "node_modules がありません。先に bash scripts/setup.sh（または npm install）を実行してください"
else
  WORKERDS="$(find "$REPO/node_modules" -path '*workerd-linux-*/bin/workerd' -type f 2>/dev/null)"
  if [ -z "$WORKERDS" ]; then
    ng "workerd のバイナリが見つかりません。node_modules を削除して npm install し直してください: rm -rf node_modules && npm install"
  else
    case "$ARCH" in x86_64) WANT="workerd-linux-64";; aarch64|arm64) WANT="workerd-linux-arm64";; *) WANT="";; esac
    while IFS= read -r W; do
      echo "  バイナリ: ${W#"$REPO"/}"
      if [ -n "$WANT" ] && ! echo "$W" | grep -q "$WANT"; then
        ng "CPU($ARCH)に合わない workerd です（期待: $WANT）。node_modules を別のPCからコピーしていませんか？ → rm -rf node_modules && npm install"
        continue
      fi
      MISSING="$(ldd "$W" 2>&1 | grep 'not found')"
      [ -n "$MISSING" ] && ng "共有ライブラリが不足しています: $(echo "$MISSING" | sed 's/^[[:space:]]*//' | tr '\n' ' ')"
      OUT="$(timeout 20 "$W" --version 2>&1)"; RC=$?
      if [ "$RC" -eq 0 ]; then
        ok "workerd は起動できます（$OUT）"
      else
        case "$RC" in
          132) ng "workerd が「Illegal instruction」で異常終了しました。この CPU が必要な命令に対応していない可能性が高いです" ;;
          139) ng "workerd が「Segmentation fault」で異常終了しました" ;;
          137) ng "workerd が強制終了されました（メモリ不足の可能性）" ;;
          124) ng "workerd が20秒以内に応答しませんでした" ;;
          126|127) ng "workerd を実行できません（権限、または共有ライブラリ不足）: $OUT" ;;
          *) ng "workerd が異常終了しました（終了コード $RC）: $OUT" ;;
        esac
      fi
    done <<< "$WORKERDS"
  fi
fi

sec "4. Wrangler の動作確認（一時DBで SELECT 1）"
if [ -d "$REPO/node_modules/wrangler" ]; then
  TMP="$(mktemp -d)"
  cat > "$TMP/wrangler.toml" <<'EOF'
name = "doctor"
compatibility_date = "2024-09-01"
[[d1_databases]]
binding = "DB"
database_name = "doctor"
database_id = "00000000-0000-0000-0000-000000000000"
EOF
  ( cd "$REPO" && timeout 90 npx wrangler d1 execute DB --local --config "$TMP/wrangler.toml" --persist-to "$TMP/state" --command "SELECT 1 AS ok" > "$TMP/out.txt" 2>&1 ); RC=$?
  if [ "$RC" -eq 0 ] && grep -q '"ok": 1' "$TMP/out.txt"; then
    ok "wrangler d1（ローカル）が動作しました"
  else
    ng "wrangler d1（ローカル）が失敗しました（終了コード $RC）"
    sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' "$TMP/out.txt" | grep -vE '^\s*$' | tail -n 8 | sed 's/^/      /'
    grep -q "EPIPE" "$TMP/out.txt" && echo "      ↑ 「write EPIPE」は workerd が起動直後に終了したときのエラーです（上の 3. を確認）"
  fi
  rm -rf "$TMP"
else
  wn "wrangler が未インストールのためスキップ"
fi

sec "5. Wrangler の最新ログ"
LOGDIR="${XDG_CONFIG_HOME:-$HOME/.config}/.wrangler/logs"
LATEST="$(ls -t "$LOGDIR"/*.log 2>/dev/null | head -n1)"
if [ -n "$LATEST" ]; then
  echo "  $LATEST（エラー関連の行のみ表示）"
  sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' "$LATEST" | grep -iE 'error|epipe|workerd|illegal|fail|exception|cannot|not found' | grep -v 'Metrics dispatcher' | tail -n 10 | awk '{print "      " substr($0,1,180)}'
else echo "  ログはありません"; fi

echo
echo "────────────────────────────"
echo "結果: ${OK}${PASS} 件OK${OFF} / ${NG}${FAIL} 件NG${OFF} / ${WN}${WARN} 件注意${OFF}"
if [ "$FAIL" -gt 0 ]; then
  echo
  echo "上の ✗ が原因の候補です。この出力をそのままコピーして共有してください（ユーザー名を含むパスが出ることがあります。気になる場合は伏せてください）。"
  exit 1
fi
echo "workerd は正常に動いています。それでも失敗する場合は、上の「5. 最新ログ」を共有してください。"
