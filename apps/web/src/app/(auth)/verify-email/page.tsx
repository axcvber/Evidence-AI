import { redirect } from 'next/navigation';
import { ResendVerificationForm } from '@/features/auth/resend-verification-form';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { getCurrentUser } from '@/lib/session';

export const metadata = { title: 'Confirm your email' };

/**
 * Where confirmation links land. A good link has already signed the user in, so they continue
 * to `next`; an expired or invalid one arrives with `?error=` and can ask for a new link.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; email?: string }>;
}) {
  const { next, error, email } = await searchParams;
  const destination = safeRedirectPath(next);
  if (!error) {
    const me = await getCurrentUser();
    if (me?.user.emailVerified) redirect(destination);
  }
  return <ResendVerificationForm email={email ?? ''} next={destination} linkError={error} />;
}
