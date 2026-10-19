import Link from 'next/link';
import { Page } from '../../../components/ui';
import { getMe } from '../../../lib/session';
import { AcceptInvitation } from './accept-invitation';

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const next = encodeURIComponent(`/invite/${id}`);

  return (
    <Page title="Join a workspace">
      {me ? (
        <>
          <p className="text-zinc-700">
            Signed in as <strong>{me.user.email}</strong>. The invitation must be for this address.
          </p>
          <AcceptInvitation invitationId={id} />
        </>
      ) : (
        <p className="text-zinc-700">
          <Link href={`/signup?next=${next}`}>Create an account</Link> or{' '}
          <Link href={`/login?next=${next}`}>sign in</Link> with the email address the invitation
          was sent to.
        </p>
      )}
    </Page>
  );
}
