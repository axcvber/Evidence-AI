import { Page } from '../../components/ui';
import { safeRedirectPath } from '../../lib/safe-redirect';
import { SignupForm } from './signup-form';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <Page title="Create your account">
      <SignupForm next={safeRedirectPath(next)} />
    </Page>
  );
}
