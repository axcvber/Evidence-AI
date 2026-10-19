import { Page } from '../../components/ui';
import { safeRedirectPath } from '../../lib/safe-redirect';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <Page title="Sign in">
      <LoginForm next={safeRedirectPath(next)} />
    </Page>
  );
}
