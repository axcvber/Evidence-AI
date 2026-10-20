import { expect, test } from '@playwright/test';
import { ownerWithWorkspace } from '../support/accounts.ts';

test('groups: create one and add a member', async ({ page }) => {
  const { base } = await ownerWithWorkspace(page, 'grouper');
  await page.goto(`${base}/settings/groups`);
  await page.getByRole('button', { name: 'New group' }).click();
  await page.getByLabel('Name').fill('Legal');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByText('Created Legal')).toBeVisible();

  await page.getByRole('cell', { name: 'Legal' }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: /grouper owner/ }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('grouper owner')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('row', { name: /Legal/ })).toContainText('1');
});

test('rename the workspace, then delete it with typed confirmation', async ({ page }) => {
  const { base } = await ownerWithWorkspace(page, 'doomed');
  const slug = base.replace('/w/', '');
  await page.goto(`${base}/settings/workspace`);

  await page.getByLabel('Name').fill('Renamed workspace');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByText('Workspace renamed')).toBeVisible();

  await page.getByRole('button', { name: 'Delete this workspace' }).click();
  const confirm = page.getByRole('button', { name: 'Delete permanently' });
  await expect(confirm).toBeDisabled();
  await page.getByPlaceholder(slug).fill(slug);
  await confirm.click();

  // That was the only workspace, so onboarding is next.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto(`${base}/ask`);
  await expect(page.getByText('Workspace not available')).toBeVisible();
});
