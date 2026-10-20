import { expect, test } from '@playwright/test';
import { ownerWithWorkspace, signUp, uniqueEmail } from '../support/accounts.ts';
import { emailLink } from '../support/outbox.ts';

test('sign up, create a workspace, invite someone who joins with the invited role', async ({
  page,
  browser,
}) => {
  const { base } = await ownerWithWorkspace(page, 'founder');
  await expect(page.getByRole('heading', { name: 'Ask' })).toBeVisible();

  // Invite an editor from the members page.
  const editorEmail = uniqueEmail('editor');
  await page.goto(`${base}/settings/members`);
  await page.getByPlaceholder('teammate@company.com').fill(editorEmail);
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Editor' }).click();
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByText(`Invitation sent to ${editorEmail}`)).toBeVisible();
  await expect(page.getByRole('cell', { name: editorEmail })).toBeVisible();

  // The invitee, in their own browser, follows the link, signs up and accepts.
  const invitee = await (await browser.newContext()).newPage();
  const inviteLink = await emailLink(editorEmail, /join .* on evidence ai/i);
  await invitee.goto(inviteLink);
  await expect(invitee.getByText('Join a workspace')).toBeVisible();
  await signUp(invitee, editorEmail, 'Eddie Editor', inviteLink);
  await expect(invitee).toHaveURL(new RegExp(`${inviteLink}$`));
  await invitee.getByRole('button', { name: 'Accept invitation' }).click();

  await expect(invitee).toHaveURL(new RegExp(`${base}/ask$`));
  // Editors don't see admin-only navigation.
  await expect(invitee.getByRole('link', { name: 'Evals' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('row', { name: /Eddie Editor/ })).toContainText('editor');
});
