import Link from 'next/link';
import { SignOutButton } from '../components/sign-out-button';
import { Page } from '../components/ui';
import { getMe } from '../lib/session';

export default async function HomePage() {
  const me = await getMe();

  if (!me) {
    return (
      <Page title="Evidence AI">
        <p className="text-lg text-zinc-600">
          Ask questions about your documents and get answers with verifiable citations.
        </p>
        <div className="flex gap-4">
          <Link href="/signup">Create an account</Link>
          <Link href="/login">Sign in</Link>
        </div>
      </Page>
    );
  }

  return (
    <Page title={`Hi, ${me.user.name}`}>
      {me.activeWorkspace ? (
        <p className="text-zinc-700">
          Workspace <strong>{me.activeWorkspace.name}</strong> · role {me.activeWorkspace.role}
        </p>
      ) : (
        <Link href="/onboarding">Create a workspace</Link>
      )}
      {me.activeWorkspace && <Link href="/onboarding">Invite teammates</Link>}
      <SignOutButton />
    </Page>
  );
}
