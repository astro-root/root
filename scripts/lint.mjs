#!/usr/bin/env node
// 軽量リポジトリ・リンター。型チェックは `npm run check`（astro check）が担当する。
// ここでは「うっかり」を機械的に防ぐ: 秘密情報の混入 / 危険なAPI / ブランド・URLの不整合 / 旧Firebaseの残骸。
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.git', '.wrangler', '.e2e', 'test-results', 'playwright-report', 'backups']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(astro|ts|mjs|js|json|sh|md|toml|css|sql|example)$/.test(e.name) || e.name.startsWith('.env') || e.name === '.dev.vars.example') files.push(p);
  }
})(root);

const rel = (p) => path.relative(root, p);
const isSrc = (f) => f.startsWith('src/');
const problems = [];
const add = (f, line, msg) => problems.push(`${f}:${line}  ${msg}`);

const rules = [
  { name: '秘密情報らしき文字列', re: /(AIza[0-9A-Za-z_-]{30,}|-----BEGIN (RSA |EC )?PRIVATE KEY-----|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{30,}|service_role)/, only: () => true, skip: (f) => f === 'scripts/lint.mjs' },
  { name: 'eval / new Function は禁止', re: /\b(eval\s*\(|new Function\s*\()/, only: isSrc },
  { name: 'document.write は禁止', re: /document\.write\s*\(/, only: isSrc },
  { name: 'ブラウザ側のinnerHTMLは管理プレビュー以外で使わない', re: /\.innerHTML\s*=/, only: (f) => isSrc(f) && f.startsWith('src/scripts/') && f !== 'src/scripts/admin.ts' },
  { name: '旧Firebase依存の残骸', re: /\bfirebase\b|firestore/i, only: (f) => isSrc(f) || f === 'package.json' },
  { name: '旧サイト名「Root\'s Laboratory」を正式名称として直書きしない（補助表記は設定値 nameEn 経由）', re: /Root['’]s Laboratory/, only: (f) => isSrc(f) && f !== 'src/lib/defaults.ts' },
  { name: '旧URL /notes への内部リンク', re: /href=["'`]\/notes/, only: isSrc },
  { name: 'プレースホルダURL（example.com / 空のgithub.com）', re: /https?:\/\/(example\.com|github\.com\/?['"`])/, only: isSrc },
  { name: 'パスワード・トークンの直書き疑い', re: /(password|secret|token)\s*[:=]\s*['"][^'"\s]{8,}['"]/i, only: (f) => isSrc(f) && !f.includes('placeholder') },
];

for (const abs of files) {
  const f = rel(abs);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const r of rules) {
      if (!r.only(f) || (r.skip && r.skip(f))) continue;
      if (r.re.test(text)) add(f, i + 1, r.name);
    }
  });
}

// set:html は サニタイズ済みMarkdown と JSON-LD のみ許可
for (const abs of files.filter((f) => f.endsWith('.astro'))) {
  const f = rel(abs);
  fs.readFileSync(abs, 'utf8').split('\n').forEach((text, i) => {
    const m = text.match(/set:html=\{([^}]+)\}/);
    if (m && !/^(html|JSON\.stringify\(jsonLd\)[^}]*)$/.test(m[1].trim())) add(f, i + 1, `set:html に未検証の式: ${m[1].trim()}`);
  });
}

// 必須ファイル
for (const f of ['public/favicon.ico', 'public/favicon.svg', 'public/apple-touch-icon.png', 'public/site.webmanifest', 'migrations/0001_init.sql', '.env.example', '.dev.vars.example']) {
  if (!fs.existsSync(path.join(root, f))) add(f, 0, '必須ファイルがありません');
}
// .env / .dev.vars がgit管理対象外か
const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
for (const pat of ['.env', '.dev.vars', 'node_modules/']) if (!gi.split('\n').includes(pat)) add('.gitignore', 0, `${pat} が .gitignore にありません`);

if (problems.length) {
  console.error(`✗ lint: ${problems.length} 件の問題\n` + problems.map((p) => '  ' + p).join('\n'));
  process.exit(1);
}
console.log(`✓ lint: ${files.length} ファイルを検査、問題なし`);
