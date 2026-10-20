import { LoginForm } from '@/features/auth/login-form';
import { getSocialProviders } from '@/lib/auth-providers';
import { safeRedirectPath } from '@/lib/safe-redirect';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <LoginForm
      next={safeRedirectPath(next)}
      providers={await getSocialProviders()}
      socialError={error}
    />
  );
}
