#!/usr/bin/env bash
# GitHubへのpush。内容を確認し、「yes」と入力した場合のみ実行する。認証情報は保存・出力しない。
#   bash scripts/git-push.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
need git "sudo apt install git"
git rev-parse --git-dir >/dev/null 2>&1 || die "ここは Git リポジトリではありません。README の「GitHubへの反映」を参照してください。"
remote="$(git remote | head -n1 || true)"
[ -n "$remote" ] || die "リモートが設定されていません。README の「GitHubへの反映」を参照してください。"
git rev-parse --verify HEAD >/dev/null 2>&1 || die "コミットがまだありません。先に git add -A && git commit -m \"...\" を実行してください。"
branch="$(git rev-parse --abbrev-ref HEAD)"

echo "ブランチ: $branch → $remote"; echo
git status --short; echo
if [ -n "$(git status --porcelain)" ]; then warn "コミットされていない変更があります。先に git add / git commit してください（pushされるのはコミット済みの内容のみ）。"; fi
echo "── push されるコミット ──"; git log --oneline "@{u}..HEAD" 2>/dev/null || git log --oneline -n 10
echo; echo "── 変更ファイル数 ──"; git diff --stat "@{u}..HEAD" 2>/dev/null | tail -n 1 || true
echo
info "品質チェック（Lint + 型）を実行します"; bash scripts/check.sh --quick
echo
confirm "上記の内容を $remote/$branch に push しますか？" || { echo "中止しました。"; exit 0; }
git push -u "$remote" "$branch"
ok "push しました。Cloudflare Pages がGit連携なら自動でビルドが始まります。"
