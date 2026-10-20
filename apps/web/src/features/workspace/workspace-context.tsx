'use client';

import type { Capability, MeResponse, WorkspaceRole } from '@evidence/shared';
import { can, hasAtLeastRole } from '@evidence/shared';
import { createContext, useContext, type ReactNode } from 'react';

type ActiveWorkspace = NonNullable<MeResponse['activeWorkspace']>;

interface WorkspaceContextValue {
  user: MeResponse['user'];
  workspace: ActiveWorkspace;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** Provided by the /w/[slug] layout from the server's /api/me answer. */
export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceContextValue;
  children: ReactNode;
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside the workspace layout');
  return value;
}

/**
 * UI-only role checks: they decide what to show, never what is allowed. The API enforces
 * the same rules (see `capabilities` in @evidence/shared) on every request.
 */
export function useCan(capability: Capability): boolean {
  return can(useWorkspace().workspace.role, capability);
}

export function useHasRole(minimum: WorkspaceRole): boolean {
  return hasAtLeastRole(useWorkspace().workspace.role, minimum);
}

/** Renders children only when the current role has the capability. */
export function Can({
  capability,
  children,
  fallback = null,
}: {
  capability: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useCan(capability) ? children : fallback;
}
