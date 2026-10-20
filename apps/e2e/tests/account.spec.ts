import { expect, test } from '@playwright/test';
import { PASSWORD, signIn, signUp, uniqueEmail } from '../support/accounts.ts';
import { emailLink } from '../support/outbox.ts';

test('change email: the old address approves, the new one confirms', async ({ page }) => {
  const email = uniqueEmail('mover');
  const newEmail = uniqueEmail('moved');
  await signUp(page, email);

  await page.goto('/account/security');
  await page.getByLabel('New email').fill(newEmail);
  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByText(`approve the change to ${newEmail}`)).toBeVisible();

  await page.goto(await emailLink(email, /approve your new/i));
  await page.goto(await emailLink(newEmail, /confirm your email/i));
  await expect(page).toHaveURL(/\/account\/security\?email-change=continued/);
  await expect(page.getByText(`Your sign-in email is now ${newEmail}`)).toBeVisible();
});

test('profile: rename yourself', async ({ page }) => {
  await signUp(page, uniqueEmail('renamer'), 'Old Name');
  await page.goto('/account/profile');
  await page.getByLabel('Name').fill('New Name');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Name')).toHaveValue('New Name');
});

test('sessions: sign out another device', async ({ page, browser }) => {
  const email = uniqueEmail('devices');
  await signUp(page, email);
  const phone = await (await browser.newContext()).newPage();
  await signIn(phone, email);

  await page.goto('/account/sessions');
  await expect(page.getByText('This device')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Device signed out')).toBeVisible();

  await phone.goto('/account/profile');
  await expect(phone).toHaveURL(/\/login/);
});

test('delete account: confirmed through the emailed link', async ({ page }) => {
  const email = uniqueEmail('leaver');
  await signUp(page, email);

  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('button', { name: 'Email me the link' }).click();
  await expect(page.getByText('We sent a confirmation link')).toBeVisible();

  await page.goto(await emailLink(email, /confirm deleting/i));
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Your account was deleted')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
});
