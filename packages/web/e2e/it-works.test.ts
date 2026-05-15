import { expect, test } from '@playwright/test';

test('user can log in and see backups page', async ({ page }) => {
  await page.goto('http://localhost:36033/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(
    page.getByRole('heading', { name: 'Mock Authentication' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Authorize' }).click();
  await expect(page.getByText('Logged in as Foo (foo@example')).toBeVisible();
  await page.getByRole('link', { name: 'Backups' }).click();
  await expect(page.getByText('Your Backups')).toBeVisible();
});
