import { PageHeader } from '@/components/page-header';
import { SessionsList } from '@/features/account/sessions-list';

export const metadata = { title: 'Sessions' };

export default function SessionsPage() {
  return (
    <>
      <PageHeader title="Sessions" description="Where your account is signed in." />
      <SessionsList />
    </>
  );
}
