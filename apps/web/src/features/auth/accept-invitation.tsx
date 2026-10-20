'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { FormError } from './auth-card';

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
    <div className="space-y-4">
      <FormError>{error}</FormError>
      <Button className="w-full" onClick={() => void accept()} disabled={pending}>
        Accept invitation
      </Button>
    </div>
  );
}
