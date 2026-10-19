import type { MembershipRole } from '@evidence/db';
import type { TenantRequest } from '../tenancy/tenant-transaction.interceptor.js';
import type { Auth } from './auth.js';

export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;

/** What AuthGuard attaches to a request it lets through. */
export interface AuthenticatedRequest extends TenantRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthSession;
  /** The caller's role in the active workspace, when one is active. */
  membershipRole?: MembershipRole;
}
