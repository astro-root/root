import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const ADMIN = { email: 'e2e-admin@example.test', password: 'e2e-password-123456' };
test.describe.configure({ mode: 'serial' });

let cookies: Awaited<ReturnType<BrowserContext['cookies']>> = [];

async function ui(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('メールアドレス').fill(ADMIN.email);
  await page.getByLabel('パスワード').fill(ADMIN.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('管理画面: 認証', () => {
  test('未ログインは /admin からログインへ、管理APIは401', async ({ page, request }) => {
    await page.goto('/admin/projects');
    await expect(page).toHaveURL(/\/admin\/login$/);
    for (const [method, url] of [['get', '/api/admin/contacts'], ['post', '/api/admin/settings'], ['post', '/api/admin/preview'], ['delete', '/api/admin/posts?slug=x']] as const) {
      const r = await request[method](url, { headers: { Origin: 'http://localhost:4322' }, data: method === 'post' ? {} : undefined });
      expect(r.status(), `${method} ${url}`).toBe(401);
    }
    expect((await request.get('/media/nonexistent')).status()).toBe(404);
  });

  test('誤ったパスワードは同一メッセージで拒否、正しければ入れる', async ({ page, context }) => {
    await page.goto('/admin/login');
    await page.getByLabel('メールアドレス').fill(ADMIN.email);
    await page.getByLabel('パスワード').fill('wrong-password-xyz');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByRole('alert')).toContainText('メールアドレスまたはパスワードが正しくありません');
    await page.getByLabel('メールアドレス').fill('nobody@example.test');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByRole('alert')).toContainText('メールアドレスまたはパスワードが正しくありません');

    await ui(page);
    await expect(page.getByRole('heading', { level: 1, name: 'ダッシュボード' })).toBeVisible();
    cookies = await context.cookies();
    const c = cookies.find((x) => x.name === 'rl_session')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Lax');
  });

  test('CSRFトークンなし・不正トークンの変更APIは403', async ({ page, context }) => {
    await context.addCookies(cookies);
    await page.goto('/admin');
    for (const headers of [{} as Record<string, string>, { 'X-CSRF-Token': 'forged' }]) {
      const r = await page.request.post('/api/admin/preview', { headers: { Origin: 'http://localhost:4322', ...headers }, data: { md: 'x' } });
      expect(r.status()).toBe(403);
    }
    const bad = await page.request.post('/api/admin/preview', { headers: { Origin: 'https://evil.example' }, data: { md: 'x' } });
    expect(bad.status()).toBe(403);
  });
});

test.describe('管理画面: CMS', () => {
  test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });

  test('ブログ: 下書き作成→Markdownプレビュー(無害化)→公開→非公開→削除', async ({ page, browser }) => {
    await page.goto('/admin/blog/edit');
    await page.locator('#f-title').fill('E2E記事');
    await page.locator('#f-slug').fill('e2e-post');
    await page.locator('#f-excerpt').fill('E2Eの要約');
    const body = page.locator('textarea[name=body_md]');
    await body.fill('## 見出しA\n\n本文 **太字**\n\n<script>alert(1)</script>\n\n[危険](javascript:alert(1))');
    const preview = page.locator('.md__preview');
    await expect(preview.locator('h2')).toHaveText('見出しA');
    await expect(preview.locator('strong')).toHaveText('太字');
    await expect(preview.locator('script')).toHaveCount(0);
    await expect(preview.locator('a[href^="javascript"]')).toHaveCount(0);
    await expect(preview).toContainText('<script>alert(1)</script>');

    // 下書き保存 → 編集URLへ遷移
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page).toHaveURL(/\/admin\/blog\/edit\?slug=e2e-post/);

    const anon = await browser.newContext();
    const pub = await anon.newPage();
    expect((await pub.goto('http://localhost:4322/blog/e2e-post'))?.status()).toBe(404);

    // 公開
    await page.locator('#f-state').selectOption('published');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText(/保存しました/).first()).toBeVisible();
    expect((await pub.goto('http://localhost:4322/blog/e2e-post'))?.status()).toBe(200);
    await expect(pub.getByRole('heading', { level: 1 })).toHaveText('E2E記事');
    await expect(pub.locator('.prose script')).toHaveCount(0);
    await pub.goto('http://localhost:4322/search?q=E2E記事');
    await expect(pub.getByRole('link', { name: /E2E記事/ })).toBeVisible();

    // 非公開に戻すと404・検索から消える
    await page.locator('#f-state').selectOption('private');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText(/保存しました/).first()).toBeVisible();
    expect((await pub.goto('http://localhost:4322/blog/e2e-post'))?.status()).toBe(404);
    await pub.goto('http://localhost:4322/search?q=E2E記事');
    await expect(pub.getByText('に一致する結果はありません')).toBeVisible();

    // 削除
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: '削除' }).click();
    await expect(page).toHaveURL(/\/admin\/blog$/);
    await expect(page.getByText('E2E記事')).toHaveCount(0);
    await anon.close();
  });

  test('バリデーション: 不正スラッグ・重複はサーバー側で拒否され入力は保持される', async ({ page }) => {
    await page.goto('/admin/projects/edit');
    await page.locator('#f-title').fill('不正スラッグ');
    await page.locator('#f-id').fill('Bad Slug!');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('.error-summary')).toContainText('スラッグ');
    await expect(page.locator('#f-title')).toHaveValue('不正スラッグ');
    await page.locator('#f-id').fill('q-room'); // 既存と重複
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('.error-summary')).toContainText('既に使われています');
  });

  test('プロジェクト: 作成→公開→一覧/絞り込みに反映→削除', async ({ page, browser }) => {
    await page.goto('/admin/projects/edit');
    await page.locator('#f-title').fill('E2Eプロジェクト');
    await page.locator('#f-id').fill('e2e-project');
    await page.locator('#f-summary').fill('E2E用の概要です');
    await page.locator('#f-technology').fill('Rust, WebAssembly');
    await page.locator('#f-state').selectOption('published');
    await page.locator('textarea[name=body_md]').fill('### 詳細\n\n- 項目1\n- 項目2');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page).toHaveURL(/edit\?id=e2e-project/);

    const anon = await browser.newContext();
    const pub = await anon.newPage();
    await pub.goto('http://localhost:4322/projects?tech=Rust');
    await expect(pub.locator('#result-count strong')).toHaveText('1');
    await expect(pub.getByRole('link', { name: 'E2Eプロジェクト' })).toBeVisible();
    await pub.goto('http://localhost:4322/projects/e2e-project');
    await expect(pub.locator('.prose li')).toHaveCount(2);

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: '削除' }).click();
    await expect(page).toHaveURL(/\/admin\/projects$/);
    await pub.goto('http://localhost:4322/projects?tech=Rust');
    await expect(pub.getByText('条件に一致するプロジェクトがありません')).toBeVisible();
    await anon.close();
  });

  test('設定: 流れ星の無効化が保存され公開サイトへ反映、再度有効化', async ({ page, browser }) => {
    const anon = await browser.newContext();
    const pub = await anon.newPage();
    await pub.goto('http://localhost:4322/');
    await expect(pub.locator('canvas#meteors')).toHaveCount(1);

    await page.goto('/admin/display');
    const toggle = page.getByLabel('流れ星を表示する');
    await toggle.uncheck();
    await expect(page.locator('[data-savestate]')).toHaveText('未保存の変更があります');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('[data-savestate]')).toContainText('保存しました');
    await pub.reload();
    await expect(pub.locator('canvas#meteors')).toHaveCount(0);
    // 再読み込みしても管理画面に設定が残る
    await page.reload();
    await expect(page.getByLabel('流れ星を表示する')).not.toBeChecked();

    await page.getByLabel('流れ星を表示する').check();
    await page.getByLabel('表示頻度').selectOption('low');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('[data-savestate]')).toContainText('保存しました');
    await pub.reload();
    await expect(pub.locator('body')).toHaveAttribute('data-meteors', 'low');
    await anon.close();
  });

  test('設定: ナビ/サイト名の編集と不正リンクの拒否、繰り返し項目の追加削除', async ({ page, browser }) => {
    await page.goto('/admin/site');
    const navForm = page.locator('form[data-wrap-key="nav"]');
    await navForm.getByRole('button', { name: /ナビ項目を追加/ }).click();
    const rows = navForm.locator('[data-row]');
    await expect(rows).toHaveCount(5);
    await rows.last().getByLabel('表示名').fill('Bad');
    await rows.last().getByLabel('リンク先').fill('javascript:alert(1)');
    await navForm.getByRole('button', { name: '保存する' }).click();
    await expect(navForm.locator('.error-summary')).toBeVisible();

    await rows.last().getByLabel('リンク先').fill('/search');
    await rows.last().getByLabel('表示名').fill('Search');
    await navForm.getByRole('button', { name: '保存する' }).click();
    await expect(navForm.locator('[data-savestate]')).toContainText('保存しました');
    const anon = await browser.newContext();
    const pub = await anon.newPage();
    await pub.goto('http://localhost:4322/');
    await expect(pub.getByRole('navigation', { name: 'メイン' }).getByRole('link', { name: 'Search' })).toBeVisible();

    await page.reload();
    await page.locator('form[data-wrap-key="nav"] [data-row]').last().getByRole('button', { name: 'この行を削除' }).click();
    await page.locator('form[data-wrap-key="nav"]').getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('form[data-wrap-key="nav"] [data-savestate]')).toContainText('保存しました');
    await pub.reload();
    await expect(pub.getByRole('navigation', { name: 'メイン' }).getByRole('link', { name: 'Search' })).toHaveCount(0);
    await anon.close();
  });

  test('編集中の保護: 未保存の下書きは再読み込み後に復元を提案する', async ({ page }) => {
    await page.goto('/admin/legal?page=terms');
    const ta = page.locator('textarea[name=body_md]');
    const original = await ta.inputValue();
    await ta.fill(original + '\n\n未保存の追記テスト');
    await page.waitForTimeout(900); // 退避のデバウンス待ち
    page.on('dialog', (d) => d.accept()); // beforeunload
    await page.reload();
    await expect(page.getByText('保存されていない下書きが見つかりました')).toBeVisible();
    await page.getByRole('button', { name: '破棄する' }).click();
    await expect(page.getByText('保存されていない下書きが見つかりました')).toHaveCount(0);
    await expect(page.locator('textarea[name=body_md]')).toHaveValue(original);
  });

  test('問い合わせ: 公開フォームから送信→管理画面で確認→ステータス更新→削除', async ({ page, browser }) => {
    const anon = await browser.newContext();
    const pub = await anon.newPage();
    await pub.goto('http://localhost:4322/contact');
    await pub.getByLabel(/お名前/).fill('管理確認 太郎');
    await pub.getByLabel(/メールアドレス/).fill('admin-check@example.com');
    await pub.getByLabel(/件名/).fill('管理画面での確認テスト');
    await pub.getByLabel(/お問い合わせ内容/).fill('管理画面に表示されるかを確認するための本文です。');
    await pub.getByRole('checkbox').check();
    await pub.waitForTimeout(2700);
    await pub.getByRole('button', { name: '送信する' }).click();
    await expect(pub.locator('#form-success')).toBeVisible();
    await anon.close();

    await page.goto('/admin/contacts?status=new');
    await expect(page.getByRole('link', { name: '管理画面での確認テスト' })).toBeVisible();
    await page.getByRole('link', { name: '管理画面での確認テスト' }).click();
    await expect(page.getByText('admin-check@example.com').first()).toBeVisible();
    await page.getByLabel('ステータス').selectOption('in_progress');
    await page.getByLabel('管理者メモ').fill('E2Eメモ');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.locator('[data-savestate]')).toContainText('保存しました');
    await page.goto('/admin/contacts?status=in_progress');
    await expect(page.getByRole('link', { name: '管理画面での確認テスト' })).toBeVisible();
    await page.getByRole('link', { name: '管理画面での確認テスト' }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: '削除' }).click();
    await expect(page).toHaveURL(/\/admin\/contacts$/);
    await expect(page.getByText('管理画面での確認テスト')).toHaveCount(0);
  });

  test('ログアウトするとセッションが無効になる', async ({ page, context }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    // 旧Cookieを再利用しても入れない（サーバー側でセッション破棄済み）
    await context.clearCookies();
    await context.addCookies(cookies);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
