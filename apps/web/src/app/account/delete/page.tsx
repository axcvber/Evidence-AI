import { redirect } from 'next/navigation';
import { ConfirmDelete } from '@/features/account/confirm-delete';
import { getCurrentUser } from '@/lib/session';

export const metadata = { title: 'Delete account' };

export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect('/account/security');
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/account/delete?token=${token}`)}`);
  return <ConfirmDelete token={token} email={me.user.email} />;
}
