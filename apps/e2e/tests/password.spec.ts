import { expect, test } from '@playwright/test';
import { PASSWORD, signIn, signUp, uniqueEmail } from '../support/accounts.ts';
import { emailLink, waitForEmail } from '../support/outbox.ts';

const NEW_PASSWORD = 'a different long passphrase';

test('forgot password: reset through the emailed link, then sign in with the new one', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('forgetful');
  await signUp(page, email);

  const anon = await (await browser.newContext()).newPage();
  await anon.goto('/login');
  await anon.getByRole('link', { name: 'Forgot password?' }).click();
  // The login page has an Email field too: wait until the navigation has replaced it.
  await expect(anon.getByText('Forgot your password?')).toBeVisible();
  await anon.getByLabel('Email').fill(email);
  await anon.getByRole('button', { name: 'Send reset link' }).click();
  await expect(anon.getByText('Check your email')).toBeVisible();

  await anon.goto(await emailLink(email, /reset your/i));
  await expect(anon).toHaveURL(/\/reset-password\?token=/);
  await anon.getByLabel('New password').fill(NEW_PASSWORD);
  await anon.getByLabel('Repeat it').fill(NEW_PASSWORD);
  await anon.getByRole('button', { name: 'Change password' }).click();
  await expect(anon.getByText('Password changed')).toBeVisible();
  await waitForEmail(email, /password was changed/i);

  // The reset signed out every device, including the one that signed up.
  await page.goto('/account/profile');
  await expect(page).toHaveURL(/\/login/);
  await signIn(anon, email, NEW_PASSWORD);
});

test('an expired or used reset link explains itself', async ({ page }) => {
  await page.goto('/reset-password?error=INVALID_TOKEN');
  await expect(page.getByText('This link no longer works')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send a new link' })).toBeVisible();
});

test('change password from Security and sign out the other devices', async ({ page, browser }) => {
  const email = uniqueEmail('changer');
  await signUp(page, email);
  const laptop = await (await browser.newContext()).newPage();
  await signIn(laptop, email);

  await page.goto('/account/security');
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Repeat the new password').fill(NEW_PASSWORD);
  await expect(page.getByLabel('Sign out my other devices')).toBeChecked();
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();

  await laptop.goto('/account/profile');
  await expect(laptop).toHaveURL(/\/login/);
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
});
