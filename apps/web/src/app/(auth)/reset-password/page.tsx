import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export const metadata = { title: 'Choose a new password' };

/** The emailed link goes through the API, which checks the token and sends it here. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return <ResetPasswordForm token={!error && token ? token : null} />;
}
