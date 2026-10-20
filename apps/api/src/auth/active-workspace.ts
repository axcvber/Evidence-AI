import { Database } from '@evidence/db';
import { sql } from 'drizzle-orm';

/**
 * The workspace a new session starts in. Better Auth creates sessions without one (sign-in,
 * sign-up, password change, OAuth), which would send members to onboarding as if they had no
 * workspace. Preference: the workspace of the session making the request (e.g. a password
 * change replacing it), then the one used most recently, then the oldest membership. Only
 * workspaces the user is still a member of are returned. Runs as evidence_auth.
 */
export async function defaultActiveWorkspace(
  db: Database,
  userId: string,
  preferredTenantId?: string | null,
): Promise<string | null> {
  const result = await db.execute<{ tenant_id: string }>(sql`
    select m.tenant_id
    from memberships m
    left join lateral (
      select max(s.updated_at) as last_used
      from sessions s
      where s.user_id = m.user_id and s.active_tenant_id = m.tenant_id
    ) recent on true
    where m.user_id = ${userId}
    order by
      (m.tenant_id = ${preferredTenantId ?? null}::uuid) desc nulls last,
      recent.last_used desc nulls last,
      m.created_at asc
    limit 1
  `);
  return result.rows[0]?.tenant_id ?? null;
}
