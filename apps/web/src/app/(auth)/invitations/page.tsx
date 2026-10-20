import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/features/auth/auth-card';
import { MyInvitations } from '@/features/invitations/my-invitations';
import { getCurrentUser } from '@/lib/session';

export const metadata = { title: 'Invitations' };

export default async function InvitationsPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/invitations');
  return (
    <AuthCard
      title="Invitations"
      description={
        <>
          Workspaces that invited <strong>{me.user.email}</strong>.
        </>
      }
      footer={<Link href="/">Back</Link>}
    >
      <MyInvitations emptyText="You have no pending invitations." />
    </AuthCard>
  );
}
