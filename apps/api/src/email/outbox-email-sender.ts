import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EmailMessage, EmailSender } from './email-sender.js';

/**
 * Writes each email as a JSON file instead of sending it, so end-to-end tests can read the
 * links. Development and test only: the env schema refuses it in production.
 */
export class OutboxEmailSender implements EmailSender {
  constructor(private readonly dir: string) {}

  async send(message: EmailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const sentAt = new Date().toISOString();
    // Sortable names: the newest email to an address is the last file that matches it.
    const file = path.join(this.dir, `${Date.now()}-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify({ ...message, sentAt }, null, 2));
  }
}
