import { expect, test, type Page } from '@playwright/test';
import { signIn } from '../support/accounts.ts';
import { SEED_PASSWORD } from '../support/env.ts';

// The seeded "Acme (dev)" workspace has one account per role (pnpm db:seed:dev).
const roles = ['owner', 'admin', 'editor', 'viewer'] as const;
type Role = (typeof roles)[number];
const atLeast = (role: Role, minimum: Role) => roles.indexOf(role) <= roles.indexOf(minimum);

async function signInAs(page: Page, role: Role) {
  await signIn(page, `${role}@acme.test`, SEED_PASSWORD);
  // A fresh sign-in starts in the user's workspace; the editor also belongs to Globex.
  await page.goto('/w/acme-dev/ask');
  await expect(page.getByRole('heading', { name: 'Ask' })).toBeVisible();
}

/** Clicks "Try it" for a capability on the Access page and returns the API's verdict badge. */
async function tryIt(page: Page, capability: string) {
  const row = page.getByRole('row').filter({ hasText: capability });
  await row.getByRole('button', { name: 'Try it' }).click();
  return row.getByText(/API: /);
}

for (const role of roles) {
  test(`${role}: sees what the role allows, and the API agrees`, async ({ page }) => {
    await signInAs(page, role);

    await expect(page.getByRole('link', { name: 'Evals' })).toHaveCount(
      atLeast(role, 'admin') ? 1 : 0,
    );
    await expect(page.getByRole('link', { name: 'Documents' })).toBeVisible();

    await page.goto('/w/acme-dev/settings/access');
    await expect(await tryIt(page, 'Upload documents')).toHaveText(
      atLeast(role, 'editor') ? 'API: 200 allowed' : 'API: 403 INSUFFICIENT_ROLE',
    );
    await expect(await tryIt(page, 'Run evaluations')).toHaveText(
      atLeast(role, 'admin') ? 'API: 200 allowed' : 'API: 403 INSUFFICIENT_ROLE',
    );

    await page.goto('/w/acme-dev/settings/members');
    await expect(page.getByRole('button', { name: 'Invite' })).toHaveCount(
      atLeast(role, 'admin') ? 1 : 0,
    );

    await page.goto('/w/acme-dev/settings/workspace');
    await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(
      atLeast(role, 'admin') ? 1 : 0,
    );
    await expect(page.getByRole('button', { name: 'Delete this workspace' })).toHaveCount(
      role === 'owner' ? 1 : 0,
    );

    await page.goto('/w/acme-dev/settings/groups');
    await expect(page.getByRole('button', { name: 'New group' })).toHaveCount(
      atLeast(role, 'admin') ? 1 : 0,
    );
  });
}
