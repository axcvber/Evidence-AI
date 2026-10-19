'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorText } from '../../../components/ui';
import { authClient } from '../../../lib/auth-client';

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    setError('');
    const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) {
      setPending(false);
      setError(error.message ?? 'This invitation cannot be accepted');
      return;
    }
    await authClient.organization.setActive({ organizationId: data.member.organizationId });
    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>
      <Button onClick={() => void accept()} disabled={pending}>
        Accept invitation
      </Button>
    </div>
  );
}
