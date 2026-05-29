import { expect, test } from '@playwright/test';

test('user can log in and see backups page', async ({ page }) => {
  await page.goto('http://localhost:36033/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('heading', { name: 'Sign-in' })).toBeVisible();
  await page.getByPlaceholder('Enter any login').fill('foo');
  await page.getByPlaceholder('and password').fill('password');
  await page.getByRole('button', { name: 'Sign-in' }).click();

  await expect(page.getByRole('heading', { name: 'Authorize' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Backup Health')).toBeVisible();
  await page.getByRole('link', { name: 'Backups' }).click();
  await expect(page.getByText('Your Backups')).toBeVisible();
});
