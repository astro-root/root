// E2E専用のローカルD1（.e2e/state）を毎回作り直す。開発用DB（.wrangler）には触れない。
// playwright.config.ts の webServer コマンドから、サーバー起動前に実行される。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

fs.rmSync('.e2e', { recursive: true, force: true });
const env = { ...process.env, D1_PERSIST_DIR: '.e2e/state' };
const run = (cmd, args, extra = {}) => execFileSync(cmd, args, { env: { ...env, ...extra }, stdio: 'pipe' });
run('node', ['scripts/build-seed.mjs']);
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', '.e2e/state']);
run('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', '.e2e/state', '--file', 'db/seed.sql']);
run('node', ['scripts/create-admin.mjs'], { ADMIN_EMAIL: 'e2e-admin@example.test', ADMIN_PASSWORD: 'e2e-password-123456' });
console.log('e2e database ready');
