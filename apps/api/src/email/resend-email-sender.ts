import { Resend } from 'resend';
import { EmailMessage, EmailSender } from './email-sender.js';

export class ResendEmailSender implements EmailSender {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.resend.emails.send({ from: this.from, ...message });
    // Resend reports failures in the result instead of throwing.
    if (error) throw new Error(`Resend failed to send "${message.subject}": ${error.message}`);
  }
}
