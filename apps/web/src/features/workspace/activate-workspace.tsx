'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { authClient } from '@/lib/auth-client';

/**
 * The URL names a workspace that isn't the session's active one. Ask the API to switch:
 * it only succeeds for workspaces the user belongs to, so this never grants anything.
 */
export function ActivateWorkspace({ slug }: { slug: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void authClient.organization.setActive({ organizationSlug: slug }).then(({ error }) => {
      if (error) setFailed(true);
      else router.refresh();
    });
  }, [slug, router]);

  if (failed) {
    return (
      <main className="mx-auto max-w-md p-8">
        <Alert>
          <AlertTitle>Workspace not available</AlertTitle>
          <AlertDescription>
            It doesn&apos;t exist or you aren&apos;t a member.{' '}
            <Link href="/">Go to your workspaces</Link>.
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-md space-y-3 p-8">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-full" />
    </main>
  );
}
