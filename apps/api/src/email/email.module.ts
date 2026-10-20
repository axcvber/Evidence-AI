import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { ConsoleEmailSender } from './console-email-sender.js';
import { EMAIL_SENDER, EmailSender } from './email-sender.js';
import { OutboxEmailSender } from './outbox-email-sender.js';
import { ResendEmailSender } from './resend-email-sender.js';

export type EmailTransport = 'resend' | 'console' | 'outbox';

export interface EmailModuleOptions {
  transport: EmailTransport;
  resendApiKey?: string | undefined;
  outboxDir?: string | undefined;
  from: string;
  /** Replaces the configured sender, e.g. an in-memory sender in tests. */
  sender?: EmailSender | undefined;
}

@Global()
@Module({})
export class EmailModule {
  static forRoot(options: EmailModuleOptions): DynamicModule {
    const sender = options.sender ?? createSender(options);
    const provider: Provider = { provide: EMAIL_SENDER, useValue: sender };
    return { module: EmailModule, providers: [provider], exports: [provider] };
  }
}

function createSender(options: EmailModuleOptions): EmailSender {
  switch (options.transport) {
    case 'resend':
      if (!options.resendApiKey) throw new Error('RESEND_API_KEY is required to send email');
      return new ResendEmailSender(options.resendApiKey, options.from);
    case 'outbox':
      if (!options.outboxDir) throw new Error('EMAIL_OUTBOX_DIR is required for the outbox');
      return new OutboxEmailSender(options.outboxDir);
    case 'console':
      return new ConsoleEmailSender();
  }
}
