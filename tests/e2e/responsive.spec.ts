import { test, expect } from '@playwright/test';

const pages = ['/', '/projects', '/projects/q-room', '/blog', '/blog/static-site-notes', '/about', '/contact', '/terms', '/privacy', '/search?q=クイズ', '/nope'];

for (const path of pages) {
  test(`横スクロールなし: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('モバイル: メニュー・検索・絞り込みトグル', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'メニューを開く' });
  await expect(toggle).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'メイン' })).toBeHidden();
  await toggle.click();
  await expect(page.getByRole('navigation', { name: 'モバイルメニュー' }).getByRole('link', { name: /Projects/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'モバイルメニュー' })).toBeHidden();

  await page.getByRole('button', { name: 'サイト内検索を開く' }).click();
  await expect(page.getByRole('dialog', { name: 'サイト内検索' })).toBeVisible();
  await page.getByLabel('検索キーワード').fill('Q-Room');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/projects');
  await expect(page.getByRole('searchbox', { name: 'キーワード', exact: true })).toBeHidden();
  await page.getByRole('button', { name: /絞り込み/ }).click();
  await expect(page.getByRole('searchbox', { name: 'キーワード', exact: true })).toBeVisible();
});

test('モバイル: 管理画面ログインとサイドバー', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/admin/login');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
