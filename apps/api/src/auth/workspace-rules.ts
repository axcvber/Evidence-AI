import { Database } from '@evidence/db';
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
