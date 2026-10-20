import { Database } from '@evidence/db';
import { can, type WorkspaceRole } from '@evidence/shared';
import { APIError } from 'better-auth/api';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const deleteWorkspaceBody = z.object({
  organizationId: z.uuid(),
  /** The workspace's slug, typed by the user. */
  confirmSlug: z.string(),
});

/**
 * Deleting a workspace removes everything in it (members, invitations, groups, audit log and,
 * later, documents), so the request must carry the workspace's slug as typed confirmation.
 * Checked before Better Auth's handler runs; its own check that the caller is an owner follows.
 */
export async function assertWorkspaceDeletionConfirmed(db: Database, body: unknown): Promise<void> {
  const parsed = deleteWorkspaceBody.safeParse(body);
  const result = parsed.success
    ? await db.execute<{ slug: string }>(
        sql`select slug from tenants where id = ${parsed.data.organizationId}`,
      )
    : null;
  const slug = result?.rows[0]?.slug;
  if (!parsed.success || !slug || parsed.data.confirmSlug !== slug) {
    throw new APIError('BAD_REQUEST', {
      code: 'DELETE_CONFIRMATION_MISMATCH',
      message: "Type the workspace's URL name exactly to confirm deleting it.",
    });
  }
}

/** The caller's role in a workspace, or null when they aren't a member. Runs as evidence_auth. */
export async function memberRole(
  db: Database,
  tenantId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const result = await db.execute<{ role: WorkspaceRole }>(
    sql`select role from memberships where tenant_id = ${tenantId} and user_id = ${userId}`,
  );
  return result.rows[0]?.role ?? null;
}

/** Pending invitations show invitees' email addresses, so only admins and owners see them. */
export async function canSeeInvitations(
  db: Database,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const role = await memberRole(db, tenantId, userId);
  return role !== null && can(role, 'members.invite');
}

/** Admins manage admins, editors and viewers; only owners manage anything about owners. */
export async function assertCanCancelInvitation(
  db: Database,
  invitation: { organizationId: string; role: string },
  userId: string,
): Promise<void> {
  if (!invitation.role.split(',').includes('owner')) return;
  if ((await memberRole(db, invitation.organizationId, userId)) !== 'owner') {
    throw new APIError('FORBIDDEN', {
      code: 'OWNER_ONLY',
      message: 'Only owners can cancel an invitation to become an owner.',
    });
  }
}

const workspaceUpdateBody = z.object({
  // Only the name can change: the slug is in every workspace URL and shared link.
  data: z.strictObject({ name: z.string().trim().min(1).max(100) }),
  organizationId: z.uuid().optional(),
});

/** Checks a rename and returns the body with the name trimmed. */
export function normalizeWorkspaceUpdate<T>(body: T): T {
  const result = workspaceUpdateBody.safeParse(body);
  if (!result.success) {
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_WORKSPACE_UPDATE',
      message: 'Only the workspace name can be changed, and it must be 1-100 characters.',
    });
  }
  return { ...body, data: result.data.data };
}
