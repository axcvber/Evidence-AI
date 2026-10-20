import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';

/** Sends signed-in users to their workspace and everyone else to sign in. */
export default async function Home() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  redirect(me.activeWorkspace ? `/w/${me.activeWorkspace.slug}/ask` : '/onboarding');
}
