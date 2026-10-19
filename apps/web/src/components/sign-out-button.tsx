'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '../lib/auth-client';
import { Button } from './ui';

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      onClick={() => {
        void authClient.signOut().then(() => {
          router.refresh();
        });
      }}
    >
      Sign out
    </Button>
  );
}
