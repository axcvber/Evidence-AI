import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { ConsoleEmailSender } from './console-email-sender.js';
import { EMAIL_SENDER, EmailSender } from './email-sender.js';
import { ResendEmailSender } from './resend-email-sender.js';

export interface EmailModuleOptions {
  resendApiKey?: string | undefined;
  from: string;
  /** Replaces the configured sender, e.g. an in-memory sender in tests. */
  sender?: EmailSender | undefined;
}

@Global()
@Module({})
export class EmailModule {
  static forRoot(options: EmailModuleOptions): DynamicModule {
    const sender: EmailSender =
      options.sender ??
      (options.resendApiKey
        ? new ResendEmailSender(options.resendApiKey, options.from)
        : new ConsoleEmailSender());
    const provider: Provider = { provide: EMAIL_SENDER, useValue: sender };
    return { module: EmailModule, providers: [provider], exports: [provider] };
  }
}
