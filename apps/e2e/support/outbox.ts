import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { OUTBOX_DIR } from './env.ts';

interface OutboxEmail {
  to: string;
  subject: string;
  text: string;
  sentAt: string;
}

async function emailsTo(address: string): Promise<OutboxEmail[]> {
  const files = (await readdir(OUTBOX_DIR).catch(() => [])).sort();
  const emails = await Promise.all(
    files.map(
      async (file) =>
        JSON.parse(await readFile(path.join(OUTBOX_DIR, file), 'utf8')) as OutboxEmail,
    ),
  );
  return emails.filter((email) => email.to === address);
}

/** Waits for the newest email to `address` whose subject matches, and returns it. */
export async function waitForEmail(address: string, subject: RegExp): Promise<OutboxEmail> {
  let found: OutboxEmail | undefined;
  await expect
    .poll(
      async () => {
        found = (await emailsTo(address)).findLast((email) => subject.test(email.subject));
        return found !== undefined;
      },
      { message: `email to ${address} matching ${String(subject)}`, timeout: 15_000 },
    )
    .toBe(true);
  if (!found) throw new Error('unreachable');
  return found;
}

/** The first link in the email, as a path the browser can open on the e2e web origin. */
export function linkIn(email: OutboxEmail): string {
  const url = /https?:\/\/\S+/.exec(email.text)?.[0];
  if (!url) throw new Error(`No link in "${email.subject}"`);
  const { pathname, search } = new URL(url);
  return pathname + search;
}

export async function emailLink(address: string, subject: RegExp): Promise<string> {
  return linkIn(await waitForEmail(address, subject));
}
