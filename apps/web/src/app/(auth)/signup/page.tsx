import { SignupForm } from '@/features/auth/signup-form';
import { getSocialProviders } from '@/lib/auth-providers';
import { safeRedirectPath } from '@/lib/safe-redirect';

export const metadata = { title: 'Create account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <SignupForm next={safeRedirectPath(next)} providers={await getSocialProviders()} />;
}
