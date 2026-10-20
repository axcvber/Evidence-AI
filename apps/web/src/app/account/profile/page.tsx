import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ProfileForm } from '@/features/account/profile-form';
import { getCurrentUser } from '@/lib/session';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/account/profile');
  return (
    <>
      <PageHeader title="Account" description="Your personal settings, across all workspaces." />
      <ProfileForm name={me.user.name} email={me.user.email} />
    </>
  );
}
