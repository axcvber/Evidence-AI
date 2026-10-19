import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Page } from '../../components/ui';
import { getMe } from '../../lib/session';
import { CreateWorkspaceForm, InviteForm } from './onboarding-forms';

export default async function OnboardingPage() {
  const me = await getMe();
  if (!me) redirect('/login?next=/onboarding');

  if (!me.activeWorkspace) {
    return (
      <Page title="Create your workspace">
        <CreateWorkspaceForm />
      </Page>
    );
  }

  const canInvite = me.activeWorkspace.role === 'owner' || me.activeWorkspace.role === 'admin';
  return (
    <Page title={`Invite people to ${me.activeWorkspace.name}`}>
      {canInvite ? (
        <InviteForm />
      ) : (
        <p className="text-zinc-700">Only owners and admins can invite people.</p>
      )}
      <Link href="/" className="text-sm text-zinc-600">
        Continue
      </Link>
    </Page>
  );
}
