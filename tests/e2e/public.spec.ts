import { test, expect } from '@playwright/test';

test.describe('公開サイト', () => {
  test('トップ: サイト名とブランド統一、主要ナビ', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('るーとの研究室');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('るーとの研究室');
    const nav = page.getByRole('navigation', { name: 'メイン' });
    for (const label of ['Projects', 'Blog', 'About', 'Contact']) await expect(nav.getByRole('link', { name: label })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Notes' })).toHaveCount(0);
    // アイコン類
    for (const sel of ['link[rel="icon"][href="/favicon.ico"]', 'link[rel="icon"][href="/favicon.svg"]', 'link[rel="apple-touch-icon"]', 'link[rel="manifest"]', 'link[rel="canonical"]', 'meta[property="og:image"]', 'meta[property="og:site_name"][content="るーとの研究室"]']) {
      await expect(page.locator(sel)).toHaveCount(1);
    }
  });

  test('旧URL /notes は /blog へ301（チェーンなし）', async ({ request }) => {
    for (const [from, to] of [['/notes', '/blog'], ['/notes/cherenkov-blue', '/blog/cherenkov-blue']]) {
      const r = await request.get(from, { maxRedirects: 0 });
      expect(r.status()).toBe(301);
      expect(new URL(r.headers()['location']).pathname).toBe(to);
      expect((await request.get(to, { maxRedirects: 0 })).status()).toBe(200);
    }
  });

  test('サイト内検索: キーボード操作・日本語・結果なし', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('/');
    const dialog = page.getByRole('dialog', { name: 'サイト内検索' });
    await expect(dialog).toBeVisible();
    await page.getByLabel('検索キーワード').fill('チェレンコフ');
    const first = dialog.getByRole('option').first();
    await expect(first).toContainText('チェレンコフ');
    await page.keyboard.press('ArrowDown');
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/blog\/cherenkov-blue$/);

    await page.waitForLoadState('load');
    await page.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    await page.getByLabel('検索キーワード').fill('存在しない語zzzz');
    await expect(dialog.getByText('に一致する結果はありません')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('検索結果ページ /search', async ({ page }) => {
    await page.goto('/search?q=クイズ');
    await expect(page.getByRole('heading', { name: 'サイト内検索' })).toBeVisible();
    await expect(page.getByRole('link', { name: /クイズ/ }).first()).toBeVisible();
    await page.goto('/search?q=zzzzqqqq');
    await expect(page.getByText('に一致する結果はありません')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('/projects 絞り込み: 検索・複数条件・件数・解除・URL反映', async ({ page }) => {
    await page.goto('/projects');
    const count = page.locator('#result-count strong');
    const total = Number(await count.textContent());
    expect(total).toBeGreaterThanOrEqual(10);

    await page.getByRole('searchbox', { name: 'キーワード', exact: true }).fill('クイズ');
    await expect(page).toHaveURL(/q=%E3%82%AF%E3%82%A4%E3%82%BA|q=クイズ/);
    const afterQ = Number(await count.textContent());
    expect(afterQ).toBeGreaterThan(0);
    expect(afterQ).toBeLessThan(total);

    await page.getByRole('checkbox', { name: /^Web Service/ }).check();
    await expect(page).toHaveURL(/category=Web\+Service|category=Web%20Service/);
    const both = Number(await count.textContent());
    expect(both).toBeLessThanOrEqual(afterQ);
    await expect(page.locator('.chip')).toHaveCount(2);

    // チップで1条件ずつ解除
    await page.locator('.chip', { hasText: '検索' }).click();
    await expect(page).not.toHaveURL(/q=/);
    // 再読み込みしても状態が維持される
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /^Web Service/ })).toBeChecked();

    await page.goto('/projects?q=zzzzzqqq');
    await expect(page.getByText('条件に一致するプロジェクトがありません')).toBeVisible();
    await page.getByRole('link', { name: '条件をすべて解除' }).last().click();
    await expect(page).toHaveURL(/\/projects$/);
    expect(Number(await count.textContent())).toBe(total);
  });

  test('プロジェクト詳細・ブログ詳細・パンくず・目次', async ({ page }) => {
    await page.goto('/projects/q-room');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Q-Room');
    await expect(page.getByRole('navigation', { name: 'パンくず' })).toContainText('Projects');
    await page.goto('/blog/cherenkov-blue');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('チェレンコフ');
    await expect(page.getByRole('navigation', { name: '目次' }).getByRole('link').first()).toBeVisible();
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  });

  test('利用規約・プライバシーポリシー・About・404', async ({ page }) => {
    for (const [path, h] of [['/terms', '利用規約'], ['/privacy', 'プライバシーポリシー'], ['/about', 'Root']] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h);
    }
    const res = await page.goto('/this-page-does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
    expect((await page.goto('/blog/none'))?.status()).toBe(404);
  });

  test('お問い合わせ: クライアント検証→送信成功→二重送信防止', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page.locator('#e-name')).toHaveText('お名前を入力してください。');
    await expect(page.locator('#e-consent')).toContainText('同意が必要');
    await expect(page.locator('#c-name')).toBeFocused();

    await page.getByLabel(/お名前/).fill('E2E テスト');
    await page.getByLabel(/メールアドレス/).fill('not-an-email');
    await page.getByLabel(/件名/).fill('E2E件名');
    await page.getByLabel(/お問い合わせ内容/).fill('これはE2Eテストからの問い合わせです。');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '送信する' }).click();
    await expect(page.locator('#e-email')).toContainText('形式が正しくありません');

    await page.getByLabel(/メールアドレス/).fill('e2e@example.com');
    await page.waitForTimeout(2600); // 表示直後の送信はボット扱い
    let posts = 0;
    page.on('request', (r) => { if (r.url().endsWith('/api/contact') && r.method() === 'POST') posts++; });
    const btn = page.getByRole('button', { name: '送信する' });
    await btn.dblclick();
    await expect(page.locator('#form-success')).toBeVisible();
    expect(posts).toBe(1);
    await expect(page.locator('#contact-form')).toBeHidden();
  });

  test('流れ星: 既定で有効、reduced-motionでは描画しない', async ({ page, browser }) => {
    await page.goto('/');
    await expect(page.locator('canvas#meteors')).toHaveCount(1);
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const p2 = await ctx.newPage();
    await p2.goto('http://localhost:4322/');
    await expect(p2.locator('canvas#meteors')).toHaveCount(0);
    await expect(p2.locator('#intro')).toHaveCount(0);
    await ctx.close();
  });

  test('robots / sitemap / 管理画面のnoindex', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /admin');
    const sm = await (await request.get('/sitemap.xml')).text();
    expect(sm).toContain('/projects/q-room');
    expect(sm).toContain('/blog/cherenkov-blue');
    expect(sm).not.toContain('/admin');
    const login = await request.get('/admin/login');
    expect(login.headers()['x-robots-tag']).toContain('noindex');
  });

  test('セキュリティヘッダー', async ({ request }) => {
    const h = (await request.get('/')).headers();
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});
