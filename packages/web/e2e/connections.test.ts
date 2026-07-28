import { expect, test } from '@playwright/test';

const login = async (page: import('@playwright/test').Page) => {
  await page.goto('http://localhost:36033/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('heading', { name: 'Sign-in' })).toBeVisible();
  await page.getByPlaceholder('Enter any login').fill('foo');
  await page.getByPlaceholder('and password').fill('password');
  await page.getByRole('button', { name: 'Sign-in' }).click();

  await expect(page.getByRole('heading', { name: 'Authorize' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Land on the dashboard.
  await expect(page.getByText('Backup Health')).toBeVisible();
};

test('connections page lists the default connection and hides restic without the flag', async ({
  page,
}) => {
  await login(page);

  await page.getByRole('link', { name: 'Connections' }).click();
  await expect(
    page.getByRole('heading', { name: 'Connections' }),
  ).toBeVisible();

  // Every user has a default immich connection.
  await expect(page.getByText('Immich').first()).toBeVisible();

  // Restic self-serve is invisible without the connection-restic flag.
  await expect(
    page.getByRole('button', { name: 'New restic backup' }),
  ).toHaveCount(0);
});
