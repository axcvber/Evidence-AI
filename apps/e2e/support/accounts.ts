import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { emailLink } from './outbox.ts';

export const PASSWORD = 'a long enough e2e passphrase';

export function uniqueEmail(label: string): string {
  return `e2e-${label}-${randomUUID().slice(0, 8)}@example.test`;
}

/** Signs up through the form and follows the emailed confirmation link (which signs in). */
export async function signUp(page: Page, email: string, name = 'E2E User', next?: string) {
  await page.goto(next ? `/signup?next=${encodeURIComponent(next)}` : '/signup');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  await page.goto(await emailLink(email, /confirm your email/i));
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** From onboarding: creates a workspace and waits for its Ask page. Returns its URL base. */
export async function createWorkspace(page: Page, name: string): Promise<string> {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(name);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/w\/[a-z0-9-]+\/ask$/);
  return new URL(page.url()).pathname.replace(/\/ask$/, '');
}

/** A new verified user who owns a fresh workspace; returns its URL base (e.g. /w/acme-1a2b3c). */
export async function ownerWithWorkspace(page: Page, label: string) {
  const email = uniqueEmail(label);
  await signUp(page, email, `${label} owner`);
  const base = await createWorkspace(page, `${label} workspace`);
  return { email, base };
}
