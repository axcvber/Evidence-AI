'use client';

import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';

/** Account data isn't tied to a workspace, so its query keys start with 'account'. */
export const accountKeys = {
  linkedAccounts: ['account', 'linked-accounts'] as const,
  sessions: ['account', 'sessions'] as const,
};

/** Throws Better Auth's `{ error }` result so TanStack Query treats it as a failure. */
async function unwrap<T>(
  result: Promise<{ data: T | null; error: { message?: string; code?: string } | null }>,
): Promise<T> {
  const { data, error } = await result;
  if (error || data === null) {
    throw Object.assign(new Error(error?.message ?? 'Request failed'), { code: error?.code });
  }
  return data;
}

/** Sign-in methods on this account: 'credential' (password), 'google', 'github'. */
export function useLinkedAccounts() {
  return useQuery({
    queryKey: accountKeys.linkedAccounts,
    queryFn: () => unwrap(authClient.listAccounts()),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: accountKeys.sessions,
    queryFn: () => unwrap(authClient.listSessions()),
    retry: false,
  });
}

export function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}
