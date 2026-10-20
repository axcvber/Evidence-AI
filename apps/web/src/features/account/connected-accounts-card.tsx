'use client';

import type { SocialProviderId } from '@evidence/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { providerLabels, socialSignInError } from '@/features/auth/social-sign-in';
import { authClient } from '@/lib/auth-client';
import { accountKeys, useLinkedAccounts } from './queries';

export function ConnectedAccountsCard({
  providers,
  linkError,
}: {
  providers: readonly SocialProviderId[];
  linkError?: string;
}) {
  const queryClient = useQueryClient();
  const { data: accounts, isPending } = useLinkedAccounts();
  const [busy, setBusy] = useState<SocialProviderId | null>(null);
  if (providers.length === 0) return null;

  // The last way to sign in can't be removed (Better Auth refuses it too).
  const methodCount = accounts?.length ?? 0;

  async function connect(provider: SocialProviderId) {
    setBusy(provider);
    const { error } = await authClient.linkSocial({
      provider,
      callbackURL: '/account/security',
      errorCallbackURL: '/account/security',
    });
    if (error) {
      setBusy(null);
      toast.error(error.message ?? 'Could not connect');
    }
  }

  async function disconnect(provider: SocialProviderId) {
    const account = accounts?.find((a) => a.providerId === provider);
    if (!account) return;
    setBusy(provider);
    const { error } = await authClient.unlinkAccount({ accountId: account.id });
    setBusy(null);
    if (error) toast.error(error.message ?? 'Could not disconnect');
    else toast.success(`${providerLabels[provider]} disconnected`);
    await queryClient.invalidateQueries({ queryKey: accountKeys.linkedAccounts });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>
          Sign in with these instead of a password. A provider can only be connected when it uses
          the same, verified email address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {linkError && <p className="text-sm text-destructive">{socialSignInError(linkError)}</p>}
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          providers.map((provider) => {
            const linked = accounts?.some((account) => account.providerId === provider);
            return (
              <div key={provider} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {providerLabels[provider]}
                  {linked && <Badge variant="secondary">Connected</Badge>}
                </div>
                {linked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null || methodCount <= 1}
                    title={methodCount <= 1 ? 'Your only way to sign in' : undefined}
                    onClick={() => void disconnect(provider)}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void connect(provider)}
                  >
                    Connect
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
