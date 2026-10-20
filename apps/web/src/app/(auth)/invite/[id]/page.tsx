import Link from 'next/link';
import { AcceptInvitation } from '@/features/auth/accept-invitation';
import { AuthCard } from '@/features/auth/auth-card';
import { getCurrentUser } from '@/lib/session';

export const metadata = { title: 'Join a workspace' };

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  const next = encodeURIComponent(`/invite/${id}`);

  if (!me) {
    return (
      <AuthCard
        title="Join a workspace"
        description="Use the email address the invitation was sent to."
      >
        <div className="flex gap-4 text-sm">
          <Link href={`/signup?next=${next}`}>Create an account</Link>
          <Link href={`/login?next=${next}`}>Sign in</Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Join a workspace"
      description={
        <>
          Signed in as <strong>{me.user.email}</strong>. The invitation must be for this address.
        </>
      }
    >
      <AcceptInvitation invitationId={id} />
    </AuthCard>
  );
}
