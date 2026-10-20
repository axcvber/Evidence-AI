import { Database } from '@evidence/db';
import { userNameSchema } from '@evidence/shared';
import { APIError } from 'better-auth/api';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Names of the workspaces where this user is the only owner. Deleting the account would leave
 * them without anyone able to manage them, so it is refused until ownership moves or the
 * workspace is deleted. Runs as evidence_auth, which may read memberships and tenants.
 */
export async function soleOwnedWorkspaces(db: Database, userId: string): Promise<string[]> {
  const result = await db.execute<{ name: string }>(sql`
    select t.name
    from memberships m
    join tenants t on t.id = m.tenant_id
    where m.user_id = ${userId}
      and m.role = 'owner'
      and not exists (
        select 1 from memberships other
        where other.tenant_id = m.tenant_id and other.role = 'owner' and other.user_id <> m.user_id
      )
    order by t.name
  `);
  return result.rows.map((row) => row.name);
}

export async function assertNotSoleOwner(db: Database, userId: string): Promise<void> {
  const workspaces = await soleOwnedWorkspaces(db, userId);
  if (workspaces.length > 0) {
    throw new APIError('BAD_REQUEST', {
      code: 'SOLE_WORKSPACE_OWNER',
      message: `You are the only owner of ${workspaces.join(', ')}. Make someone else an owner or delete the workspace first.`,
    });
  }
}

// Avatars are only ever shown from https URLs (provider pictures); anything else is refused
// so a profile cannot point other members' browsers at arbitrary schemes.
const profileInput = z.object({
  name: userNameSchema.optional(),
  image: z
    .url({ protocol: /^https$/ })
    .nullable()
    .optional(),
});

/**
 * Checks the name and image on sign-up and profile updates, as a 400 before Better Auth runs,
 * and returns the body with the name trimmed.
 */
export function normalizeProfileInput<T>(body: T): T {
  const result = profileInput.safeParse(body ?? {});
  if (!result.success) {
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_PROFILE',
      message: result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    });
  }
  return result.data.name === undefined ? body : { ...body, name: result.data.name };
}

/**
 * A new account created through Google or GitHub must come with an email the provider has
 * verified. Otherwise anyone could pre-register a victim's address through a provider that
 * does not check it, and keep access after the victim later claims the account.
 */
export function rejectUnverifiedSocialSignUp(
  user: { emailVerified?: boolean | undefined },
  source: { action: string; method: string },
): { error: string; errorDescription: string } | undefined {
  if (source.action === 'create-user' && source.method === 'oauth' && user.emailVerified !== true) {
    return {
      error: 'email_not_verified',
      errorDescription: 'Verify your email address with the provider first.',
    };
  }
  return undefined;
}
