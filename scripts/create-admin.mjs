#!/usr/bin/env node
// 管理者の作成 / パスワード再設定（復旧）。
//   node scripts/create-admin.mjs             → ローカルDB
//   node scripts/create-admin.mjs --remote    → 本番DB（確認あり）
// パスワードは対話入力（画面に表示されない）。ファイル・履歴・ログに平文は残さない。
// CI等で非対話にする場合のみ ADMIN_EMAIL / ADMIN_PASSWORD 環境変数を使えるが、通常は使わないこと。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

const remote = process.argv.includes('--remote');
const root = path.resolve(import.meta.dirname, '..');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else rl.output.write(''); };
    }
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
  });
}

const email = (process.env.ADMIN_EMAIL || (await ask('管理者のメールアドレス: '))).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('メールアドレスの形式が正しくありません。'); process.exit(1); }

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await ask('パスワード（12文字以上）: ', { hidden: true });
  const again = await ask('もう一度入力: ', { hidden: true });
  if (password !== again) { console.error('パスワードが一致しません。'); process.exit(1); }
}
if (password.length < 12) { console.error('パスワードは12文字以上にしてください。'); process.exit(1); }

if (remote && !process.env.ADMIN_EMAIL) {
  const ok = (await ask(`本番DBに管理者 ${email} を作成/更新します。続行しますか？ (yes/no): `)).trim();
  if (ok !== 'yes') { console.log('中止しました。'); process.exit(0); }
}

// src/lib/auth.ts と同一形式: pbkdf2$反復$salt(b64)$hash(b64)  ※Workersの上限に合わせ 100000 回
const ITER = 100_000;
const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
const stored = `pbkdf2$${ITER}$${salt.toString('base64')}$${hash.toString('base64')}`;
const q = (s) => `'${s.replace(/'/g, "''")}'`;

const sql = `INSERT INTO admins (email, password_hash) VALUES (${q(email)}, ${q(stored)})
ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash;
DELETE FROM sessions WHERE admin_id = (SELECT id FROM admins WHERE email = ${q(email)});
`;

const tmp = path.join(os.tmpdir(), `create-admin-${crypto.randomBytes(6).toString('hex')}.sql`);
fs.writeFileSync(tmp, sql, { mode: 0o600 });
try {
  const persist = !remote && process.env.D1_PERSIST_DIR ? ['--persist-to', process.env.D1_PERSIST_DIR] : [];
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'DB', remote ? '--remote' : '--local', ...persist, '--file', tmp], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); console.error('管理者の登録に失敗しました。マイグレーションを適用済みか確認してください。'); process.exit(1); }
  console.log(`✅ 管理者 ${email} を${remote ? '本番' : 'ローカル'}DBに登録しました（既存の場合はパスワードを更新し、全セッションを失効させました）。`);
} finally {
  fs.rmSync(tmp, { force: true });
}
