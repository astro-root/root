#!/usr/bin/env bash
# zip を取り込み → 解凍 → リポジトリへ反映 → セットアップ/チェック → commit → push までを一括実行する。
# このファイルは単体で動きます（リポジトリの外に置いて実行できます）。
#
# 使い方:
#   bash import-zip.sh <zipファイル> --repo-dir <ローカルのクローン先> [--repo-url <GitHubのURL>] [オプション]
#
# 例（初回: クローンから行う）:
#   bash import-zip.sh ~/Downloads/roots-laboratory.zip \
#        --repo-url git@github.com:astro-root/（リポジトリ名）.git --repo-dir ~/astro-root
# 例（2回目以降: 既存のクローンを使う）:
#   bash import-zip.sh ~/Downloads/roots-laboratory.zip --repo-dir ~/astro-root
#
# オプション:
#   --repo-dir DIR     ローカルのリポジトリ（無ければ --repo-url からクローン）  [必須]
#   --repo-url URL     クローン元（repo-dir が無い場合に使用）
#   --branch NAME      コミット先ブランチ（既定: renewal。無ければ作成）
#   --message TEXT     コミットメッセージ
#   --quick            チェックを Lint+型のみにする（ビルドとスモークテストを省略）
#   --no-push          commit までで止める
#   --yes              確認プロンプトをすべて自動で「yes」にする（非対話実行用）
#
# 安全策:
#   ・既定では main に直接コミットしない（新ブランチ renewal へ）
#   ・作業ツリーに未コミットの変更があれば中止
#   ・.env / .dev.vars / DB / バックアップがコミット対象に入っていれば中止
#   ・push 前に変更内容を表示して確認（--yes で省略）
#   ・認証情報はスクリプトで扱わない（gh auth login か SSH鍵を事前に設定）
set -euo pipefail

if [ -t 1 ]; then OK=$'\033[32m'; WARN=$'\033[33m'; ERR=$'\033[31m'; DIM=$'\033[2m'; OFF=$'\033[0m'; else OK=""; WARN=""; ERR=""; DIM=""; OFF=""; fi
info() { echo "${DIM}→${OFF} $*"; }
ok()   { echo "${OK}✓${OFF} $*"; }
warn() { echo "${WARN}!${OFF} $*" >&2; }
die()  { echo "${ERR}✗ $*${OFF}" >&2; exit 1; }

ZIP=""; REPO_DIR=""; REPO_URL=""; BRANCH="renewal"; MSG="リニューアル: るーとの研究室（Root's Laboratory）"
YES=0; NO_PUSH=0; QUICK=0

usage() { sed -n '2,31p' "$0"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo-dir) REPO_DIR="${2:?--repo-dir にパスを指定してください}"; shift 2;;
    --repo-url) REPO_URL="${2:?--repo-url にURLを指定してください}"; shift 2;;
    --branch)   BRANCH="${2:?--branch に名前を指定してください}"; shift 2;;
    --message)  MSG="${2:?--message に文言を指定してください}"; shift 2;;
    --quick)    QUICK=1; shift;;
    --no-push)  NO_PUSH=1; shift;;
    --yes)      YES=1; shift;;
    -h|--help)  usage; exit 0;;
    -*)         die "不明なオプション: $1（--help で使い方を表示）";;
    *)          [ -z "$ZIP" ] && ZIP="$1" || die "zip は1つだけ指定してください。"; shift;;
  esac
done

[ -n "$ZIP" ] || { usage; die "zipファイルを指定してください。"; }
[ -f "$ZIP" ] || die "zipファイルが見つかりません: $ZIP"
[ -n "$REPO_DIR" ] || die "--repo-dir を指定してください。"
case "$REPO_DIR" in "~"*) REPO_DIR="$HOME${REPO_DIR#\~}";; esac

confirm() { # confirm "メッセージ"
  [ "$YES" = 1 ] && { echo "$1 (yes/no): yes  ${DIM}(--yes)${OFF}"; return 0; }
  local a; read -r -p "$1 (yes/no): " a; [ "$a" = "yes" ]
}

# ---------------------------------------------------------------- 0. 事前チェック
info "必要なコマンドを確認します"
for c in git unzip node npm; do
  command -v "$c" >/dev/null 2>&1 || die "$c が見つかりません。
  Chromebook(Debian) の場合:  sudo apt update && sudo apt install -y git unzip curl
  Node.js は README の「事前準備」（nvm）を参照してください。"
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js $(node -v) では動きません。20 以上が必要です。"
git config user.name  >/dev/null 2>&1 || die "git の user.name が未設定です。例: git config --global user.name \"Your Name\""
git config user.email >/dev/null 2>&1 || die "git の user.email が未設定です。例: git config --global user.email you@example.com"
ok "git $(git --version | awk '{print $3}') / Node $(node -v) / npm $(npm -v)"

# ---------------------------------------------------------------- 1. 解凍
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
info "zip を解凍します: $ZIP"
unzip -q "$ZIP" -d "$TMP/x" || die "解凍に失敗しました（壊れたzipの可能性があります）。"

# zip の直下が単一ディレクトリなら、その中身を取り込み元にする
shopt -s dotglob nullglob
entries=("$TMP"/x/*)
if [ "${#entries[@]}" -eq 1 ] && [ -d "${entries[0]}" ]; then SRC="${entries[0]}"; else SRC="$TMP/x"; fi
shopt -u dotglob nullglob

for f in package.json astro.config.mjs wrangler.toml scripts/setup.sh scripts/check.sh migrations/0001_init.sql; do
  [ -e "$SRC/$f" ] || die "このzipは想定した構成ではありません（$f がありません）。中止します。"
done
ok "取り込み元を確認しました（$(find "$SRC" -type f | wc -l) ファイル）"

# ---------------------------------------------------------------- 2. リポジトリの準備
if [ ! -d "$REPO_DIR" ]; then
  [ -n "$REPO_URL" ] || die "$REPO_DIR がありません。--repo-url でクローン元を指定してください。"
  info "クローンします: $REPO_URL → $REPO_DIR"
  git clone "$REPO_URL" "$REPO_DIR" || die "クローンに失敗しました。GitHub認証（gh auth login / SSH鍵）を確認してください。"
fi
REPO_DIR="$(cd "$REPO_DIR" && pwd)"
git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1 || die "$REPO_DIR は Git リポジトリではありません。"
cd "$REPO_DIR"

if [ -n "$(git status --porcelain)" ]; then
  git status --short >&2
  die "未コミットの変更があります。先にコミットまたは退避（git stash）してください。上書きで失われるのを防ぐため中止します。"
fi

git remote get-url origin >/dev/null 2>&1 || die "リモート origin がありません。例: git remote add origin git@github.com:astro-root/（リポジトリ名）.git"
info "リモートの最新情報を取得します"
git fetch --quiet origin || warn "fetch に失敗しました（オフライン？）。ローカルの状態で続行します。"

CURRENT="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  warn "「$BRANCH」へ直接コミットします。既存の公開サイトに影響する可能性があります。"
  confirm "$BRANCH に直接コミットしてよいですか？" || { echo "中止しました。"; exit 0; }
fi
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  info "既存ブランチ $BRANCH に切り替えます"; git checkout "$BRANCH"
else
  info "ブランチ $BRANCH を作成します（元: ${CURRENT:-HEAD}）"; git checkout -b "$BRANCH"
fi

# ---------------------------------------------------------------- 3. 反映（ファイルの置き換え）
echo
echo "リポジトリ内の既存ファイル（.git と node_modules 以外）を、zip の内容で置き換えます。"
echo "置き換え前の状態はコミット済みなので、Git で元に戻せます。"
confirm "続行しますか？" || { echo "中止しました（ブランチ $BRANCH は作成済みですが、ファイルは変更していません）。"; exit 0; }

find "$REPO_DIR" -mindepth 1 -maxdepth 1 ! -name .git ! -name node_modules -exec rm -rf {} +
cp -a "$SRC"/. "$REPO_DIR"/
ok "ファイルを反映しました"

# ---------------------------------------------------------------- 4. セットアップ & チェック
info "セットアップを実行します（依存関係のインストール・ローカルDB。数分かかります）"
bash scripts/setup.sh

if [ "$QUICK" = 1 ]; then
  info "チェックを実行します（--quick: Lint + 型）"; bash scripts/check.sh --quick
else
  info "チェックを実行します（Lint → 型 → ビルド → 本番ビルドのスモークテスト）"; bash scripts/check.sh
fi

# ---------------------------------------------------------------- 4.5 管理者アカウント（ローカル）
# 管理画面にログインするには管理者が必要。未作成なら、この場で作るか尋ねる（対話実行時のみ）。
ADMINS="$(npx wrangler d1 execute DB --local --json --command 'SELECT COUNT(*) AS n FROM admins' 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s)[0].results[0].n)}catch{console.log(0)}})")"
if [ "$ADMINS" = "0" ]; then
  warn "ローカルDBに管理者アカウントがありません（管理画面にログインできません）。"
  if [ "$YES" = 0 ] && [ -t 0 ]; then
    if confirm "いま管理者を作成しますか？（メールとパスワードを入力。画面には表示されません）"; then
      npm run admin:create || warn "管理者の作成に失敗しました。後で: cd $REPO_DIR && npm run admin:create"
    fi
  else
    echo "  後で作成してください:  cd $REPO_DIR && npm run admin:create"
  fi
fi

# ---------------------------------------------------------------- 5. commit
git add -A

# シークレット・DB・バックアップが紛れ込んでいないか確認
LEAK="$(git diff --cached --name-only | grep -E '(^|/)(\.env|\.dev\.vars)$|\.sqlite$|^backups/|^\.wrangler/|^db/seed\.sql$' || true)"
if [ -n "$LEAK" ]; then
  git reset -q
  echo "$LEAK" >&2
  die "コミットしてはいけないファイルが含まれていました（上記）。ステージを取り消して中止しました。"
fi

if git diff --cached --quiet; then
  ok "変更がありません。コミットするものはありませんでした。"; exit 0
fi

echo; echo "── コミット内容 ──"
# 注意: `git status | head` は pipefail 下で SIGPIPE(141) になり得るため、一度ファイルに出してから表示する
git status --short > "$TMP/status.txt"
head -n 40 "$TMP/status.txt"
TOTAL="$(wc -l < "$TMP/status.txt")"; [ "$TOTAL" -gt 40 ] && echo "…ほか $((TOTAL - 40)) ファイル"
git diff --cached --shortstat
echo
git commit -q -m "$MSG"
ok "コミットしました: $(git log --oneline -n 1)"

# ---------------------------------------------------------------- 6. push
if [ "$NO_PUSH" = 1 ]; then
  ok "--no-push のため push しません。後で: git push -u origin $BRANCH"; exit 0
fi

echo
echo "ブランチ $BRANCH を origin（$(git remote get-url origin)）に push します。"
if confirm "push しますか？"; then
  git push -u origin "$BRANCH"
  ok "push しました。"
  cat <<MSG

次のステップ:
  1) GitHub で $BRANCH → main の Pull Request を作成して内容を確認
  2) 管理者を作成:  cd $REPO_DIR && npm run admin:create
  3) 本番へ出す前に docs/DEPLOY.md の手順（D1作成・database_id・シークレット）を実施
MSG
else
  echo "push は行いませんでした。後で実行する場合: cd $REPO_DIR && git push -u origin $BRANCH"
fi
