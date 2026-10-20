import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/features/auth/auth-card';
import { CreateWorkspaceForm } from '@/features/auth/create-workspace-form';
import { MyInvitations } from '@/features/invitations/my-invitations';
import { YourWorkspaces } from '@/features/workspace/your-workspaces';
import { getCurrentUser } from '@/lib/session';

export const metadata = { title: 'Create a workspace' };

export default async function OnboardingPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/onboarding');

  return (
    <AuthCard
      title="Create a workspace"
      description="A workspace holds your team's documents. You'll be its owner."
      footer={
        me.activeWorkspace && (
          <Link href={`/w/${me.activeWorkspace.slug}/ask`}>Back to {me.activeWorkspace.name}</Link>
        )
      }
    >
      <MyInvitations />
      <YourWorkspaces />
      <CreateWorkspaceForm />
    </AuthCard>
  );
}
