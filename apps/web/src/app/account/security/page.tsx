import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ConnectedAccountsCard } from '@/features/account/connected-accounts-card';
import { DeleteAccountCard } from '@/features/account/delete-account-card';
import { EmailCard } from '@/features/account/email-card';
import { PasswordCard } from '@/features/account/password-card';
import { getSocialProviders } from '@/lib/auth-providers';
import { getCurrentUser } from '@/lib/session';

export const metadata = { title: 'Security' };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ 'email-change'?: string; error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/account/security');
  const params = await searchParams;
  // Email-change links and provider connections both come back here; `error` says which failed.
  const emailChange = params['email-change'] === 'continued';
  const emailOutcome = emailChange ? (params.error ? 'link-error' : 'continued') : undefined;

  return (
    <>
      <PageHeader title="Security" description="How you sign in, and how to leave." />
      <PasswordCard email={me.user.email} />
      <EmailCard email={me.user.email} outcome={emailOutcome} />
      <ConnectedAccountsCard
        providers={await getSocialProviders()}
        linkError={emailChange ? undefined : params.error}
      />
      <DeleteAccountCard email={me.user.email} />
    </>
  );
}
