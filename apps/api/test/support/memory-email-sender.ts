import { EmailMessage, EmailSender } from '../../src/email/email-sender.js';

/** Captures emails so tests can follow verification and invitation links. */
export class MemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** Every email sent to `to`, oldest first. */
  to(address: string): EmailMessage[] {
    return this.sent.filter((m) => m.to === address);
  }

  /** The first link in the latest email to `to`, as a path relative to the web origin. */
  lastLinkTo(to: string): string {
    const message = this.sent.findLast((m) => m.to === to);
    const url = message?.text.match(/https?:\/\/\S+/)?.[0];
    if (!url) throw new Error(`No email with a link was sent to ${to}`);
    const { pathname, search } = new URL(url);
    return pathname + search;
  }
}
