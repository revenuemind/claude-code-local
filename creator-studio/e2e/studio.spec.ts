/**
 * End-to-end tests against a production build with a fresh database.
 * Run with: npm run build && npm run test:e2e
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'correct horse battery';
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function register(page: Page, name: string): Promise<string> {
  const email = `${name.toLowerCase().replace(/\s/g, '')}${uniq()}@example.test`;
  await page.goto('/register');
  await page.fill('input[autocomplete=name]', name);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return email;
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  return errors;
}

test.describe.serial('AI Creator Studio', () => {
  let projectUrl = '';

  test('first account is the platform admin and system health is green', async ({ page }) => {
    await register(page, 'Admin User');
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'System health' }).click();
    for (const k of ['database', 'ffmpeg', 'storage', 'fonts']) await expect(page.getByText(k, { exact: true })).toBeVisible();
    await expect(page.getByText('FAIL')).toHaveCount(0, { timeout: 30_000 });
  });

  test('template library shows 50 live-preview templates and a detail player', async ({ page }) => {
    const errors = trackErrors(page);
    await register(page, 'Lib User');
    await page.goto('/templates');
    await expect(page.locator('[data-testid^=template-card-]')).toHaveCount(50);
    await page.getByRole('tab', { name: 'YouTube long-form' }).click();
    await expect(page.locator('[data-testid^=template-card-]')).toHaveCount(10);
    await page.click('[data-testid=template-card-documentary]');
    await expect(page.getByRole('dialog')).toContainText('Chapter card');
    expect(errors).toEqual([]);
  });

  test('template → plan → approve → edit → render → manual publish', async ({ page }) => {
    const errors = trackErrors(page);
    await register(page, 'Producer');
    await page.goto('/projects/new?template=three-things');
    await page.fill('[data-testid=project-name]', 'E2E phone tricks');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.selectOption('[data-testid=content-language]', 'he');
    // No AI engine is connected, so Code-only is preselected and explained.
    await expect(page.getByTestId('no-ai-engines')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.click('[data-testid=fill-example]');
    await expect(page.getByTestId('example-english-only')).toHaveCount(0);
    await expect(page.locator('textarea.field').first()).toHaveValue(/[\u0590-\u05FF]/);
    await page.click('[data-testid=create-project]');
    await page.waitForURL(/stage=plan/);
    projectUrl = page.url().split('?')[0];
    await expect(page.locator('[data-testid=plan-scene]')).toHaveCount(5);
    await page.click('[data-testid=approve-plan]');
    await page.waitForURL(/stage=(editor|generate)/);

    await page.goto(`${projectUrl}?stage=editor`);
    await expect(page.locator('[data-testid=timeline]')).toBeVisible();
    const before = await page.locator('[data-testid=clip-text]').count();
    await page.click('[data-testid=add-text]');
    await expect(page.locator('[data-testid=clip-text]')).toHaveCount(before + 1);
    await page.fill('[data-testid=inspector-text]', 'נערך *בעורך*');
    await page.keyboard.press('Escape');
    await page.click('[data-testid=editor-save]');
    await expect(page.getByText('Saved').first()).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-testid=clip-text]')).toHaveCount(before + 1);

    await page.goto(`${projectUrl}?stage=export`);
    await page.click('[data-testid=preset-preview-720]');
    await page.click('[data-testid=render-button]');
    await expect(page.locator('[data-testid=render-video]')).toBeVisible({ timeout: 180_000 });
    const src = await page.locator('[data-testid=render-video]').getAttribute('src');
    const head = await page.request.get(src!, { headers: { range: 'bytes=0-15' } });
    expect(head.status()).toBe(206);
    expect((await head.body()).subarray(4, 8).toString()).toBe('ftyp');

    await page.goto(`${projectUrl}?stage=publish`);
    await page.click('button:has-text("Generate caption")');
    await expect(page.locator('[data-testid=publish-caption]')).not.toHaveValue('');
    await page.click('[data-testid=publish-now]');
    await expect(page.getByText('Ready for manual upload')).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('other organizations cannot open the project; non-admins cannot open admin', async ({ page }) => {
    await register(page, 'Outsider');
    expect((await page.goto(projectUrl))!.status()).toBe(404);
    expect((await page.goto('/admin'))!.status()).toBe(404);
    const api = await page.request.get(`/api/projects/${projectUrl.split('/').pop()}`);
    expect(api.status()).toBe(404);
  });

  test('interface languages: RTL for Hebrew and Arabic, LTR for Russian and Amharic', async ({ page }) => {
    await register(page, 'Polyglot');
    for (const [locale, dir, nav] of [['he', 'rtl', 'תבניות'], ['ar', 'rtl', 'القوالب'], ['ru', 'ltr', 'Шаблоны'], ['am', 'ltr', 'አብነቶች']] as const) {
      await page.selectOption('[data-testid=language-switcher] >> nth=0', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('link', { name: nav }).first()).toBeVisible();
      const box = await page.locator('aside').first().boundingBox();
      if (dir === 'rtl') expect(box!.x).toBeGreaterThan(700); else expect(box!.x).toBeLessThan(10);
    }
  });

  test('mobile layout has no horizontal overflow and a working menu', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await ctx.newPage();
    await register(page, 'Mobile User');
    for (const p of ['/dashboard', '/templates', '/engines', '/projects/new?template=viral-hook']) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), p).toBeLessThanOrEqual(0);
    }
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('link', { name: 'Brands' }).last().click();
    await page.waitForURL('**/brands');
    await ctx.close();
  });
});
