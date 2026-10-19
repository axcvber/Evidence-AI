import { Logger } from '@nestjs/common';
import { EmailMessage, EmailSender } from './email-sender.js';

/**
 * Local development without a Resend key: logs the plain-text body, which contains the
 * verification or invitation link. The env schema forbids this in production.
 */
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger('Email');

  send(message: EmailMessage): Promise<void> {
    this.logger.log(`To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
    return Promise.resolve();
  }
}
