import { expect, test } from '@playwright/test';

test('home page has expected login button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Login')).toBeVisible();
});
