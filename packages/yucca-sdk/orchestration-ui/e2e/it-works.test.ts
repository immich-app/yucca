import { expect, test } from '@playwright/test';

import * as sdk from '../src/lib/fetch-client';

test.beforeAll(async () => {
  await sdk.resetOrchestrator();
  await sdk.importRecoveryKey({
    recoveryKey: '0'.repeat(64),
  });
});

test('user can log in', async ({ page }) => {
  await page.goto('http://localhost:5174/');
  await expect(page.getByText('Welcome to backups')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('code')).toContainText(
    '0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000',
  );
  await page.getByRole('button', { name: 'Next' }).click();
  await page
    .getByRole('textbox', { name: 'Recovery Key' })
    .fill(
      '0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000',
    );
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByText('$0/TB per month').click();
  await page.getByRole('button', { name: 'Authorize' }).click();
  await expect(
    page.getByRole('button', { name: 'Dashboard', exact: true }),
  ).toBeVisible();
});

test('user can create backup', async ({ page }) => {
  await page.goto('http://localhost:5174/');
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  await page.getByRole('button', { name: 'Create new backup' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('My Backup');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Configure My Backup')).toBeVisible();
});
