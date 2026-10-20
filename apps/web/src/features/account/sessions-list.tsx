'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { authClient } from '@/lib/auth-client';
import { accountKeys, errorCode, useSessions } from './queries';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A short label from the user agent; good enough to tell devices apart. */
function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  const browser = /(Edg|Firefox|Chrome|Safari)\/[\d.]+/.exec(userAgent)?.[1];
  const os = /(Windows|Mac OS X|Android|iPhone|iPad|Linux)/.exec(userAgent)?.[1];
  const names: Record<string, string> = { Edg: 'Edge', 'Mac OS X': 'macOS' };
  const parts = [browser && (names[browser] ?? browser), os && (names[os] ?? os)].filter(Boolean);
  return parts.length > 0 ? parts.join(' on ') : userAgent.slice(0, 60);
}

/** Listing sessions needs a recent sign-in; older sessions are asked to sign in again. */
function SignInAgain() {
  const router = useRouter();
  async function signInAgain() {
    await authClient.signOut();
    router.push('/login?next=/account/sessions');
  }
  return (
    <Alert>
      <AlertTitle>Sign in again to see your devices</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>For your security, this page needs a sign-in from the last 24 hours.</p>
        <Button size="sm" onClick={() => void signInAgain()}>
          Sign in again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function SessionsList() {
  const queryClient = useQueryClient();
  const { data: current } = authClient.useSession();
  const { data: sessions, isPending, error } = useSessions();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ error: { message?: string } | null }>, done: string) {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error) toast.error(error.message ?? 'Could not sign out that device');
    else toast.success(done);
    await queryClient.invalidateQueries({ queryKey: accountKeys.sessions });
  }

  if (error) {
    return errorCode(error) === 'SESSION_NOT_FRESH' ? (
      <SignInAgain />
    ) : (
      <Alert variant="destructive">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const others = (sessions ?? []).filter((s) => s.token !== current?.session.token);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed-in devices</CardTitle>
        <CardDescription>
          Sign out anything you don&apos;t recognise, then change your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="divide-y">
            {sessions.map((session) => {
              const isCurrent = session.token === current?.session.token;
              return (
                <li key={session.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      {deviceLabel(session.userAgent)}
                      {isCurrent && <Badge variant="secondary">This device</Badge>}
                    </div>
                    <div className="text-muted-foreground">
                      {session.ipAddress ?? 'Unknown IP'} · signed in{' '}
                      {dateTime.format(new Date(session.createdAt))} · last active{' '}
                      {dateTime.format(new Date(session.updatedAt))}
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => authClient.revokeSession({ token: session.token }),
                          'Device signed out',
                        )
                      }
                    >
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {others.length > 0 && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(() => authClient.revokeOtherSessions(), 'Signed out of every other device')
            }
          >
            Sign out all other devices
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
