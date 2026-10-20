import { LoginForm } from '@/features/auth/login-form';
import { safeRedirectPath } from '@/lib/safe-redirect';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={safeRedirectPath(next)} />;
}
