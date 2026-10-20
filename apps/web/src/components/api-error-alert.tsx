'use client';

import { capabilities, type Capability } from '@evidence/shared';
import { ShieldAlert, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { isApiError } from '@/lib/api/api-error';

/** Shows an API error; a 403 explains which role is needed instead of a generic failure. */
export function ApiErrorAlert({ error, capability }: { error: unknown; capability?: Capability }) {
  if (isApiError(error, 'INSUFFICIENT_ROLE') || isApiError(error, 'NO_ACTIVE_WORKSPACE')) {
    const needed = capability ? capabilities[capability].minRole : null;
    return (
      <Alert>
        <ShieldAlert />
        <AlertTitle>You don&apos;t have access</AlertTitle>
        <AlertDescription>
          {needed ? `This needs the ${needed} role or higher. ` : ''}
          {error.message}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>
        {error instanceof Error ? error.message : 'Please try again.'}
        {isApiError(error) && error.requestId ? ` (request ${error.requestId})` : ''}
      </AlertDescription>
    </Alert>
  );
}

/** Shown instead of a page whose minimum role the user doesn't have. */
export function RoleRequired({ capability }: { capability: Capability }) {
  return (
    <Alert>
      <ShieldAlert />
      <AlertTitle>{capabilities[capability].label} requires a higher role</AlertTitle>
      <AlertDescription>
        Ask an owner or admin for the {capabilities[capability].minRole} role or higher.
      </AlertDescription>
    </Alert>
  );
}
