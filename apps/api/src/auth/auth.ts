import {
  accounts,
  Database,
  invitations,
  memberships,
  sessions,
  tenants,
  users,
  verifications,
} from '@evidence/db';
import { redisStorage } from '@better-auth/redis-storage';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { openAPI, organization } from 'better-auth/plugins';
import { MIN_PASSWORD_LENGTH, workspaceRoleNames } from '@evidence/shared';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { EmailSender } from '../email/email-sender.js';
import type { SocialProviderCredentials } from '../env.js';
import { accessControl, workspaceRoles } from './access-control.js';
import { defaultActiveWorkspace } from './active-workspace.js';
import {
  assertCanCancelInvitation,
  assertWorkspaceDeletionConfirmed,
  canSeeInvitations,
  normalizeWorkspaceUpdate,
} from './workspace-rules.js';
import {
  assertNotSoleOwner,
  normalizeProfileInput,
  rejectUnverifiedSocialSignUp,
} from './account-rules.js';
import {
  changeEmailApprovalEmail,
  deleteAccountEmail,
  existingAccountEmail,
  invitationEmail,
  passwordChangedEmail,
  resetPasswordEmail,
  verificationEmail,
} from './emails.js';

export interface AuthOptions {
  /** Drizzle client connected as evidence_auth. */
  db: Database;
  secret: string;
  /** Public origin the browser uses (the web app, which proxies /api/* to this API). */
  baseUrl: string;
  emailSender: EmailSender;
  secureCookies: boolean;
  /** Sessions and rate limits are stored here, shared by every API instance. */
  redis: Redis;
  redisKeyPrefix: string;
  rateLimit: boolean;
  /** Serve Better Auth's own API reference at /api/auth/reference (same switch as /api/docs). */
  openApiReference: boolean;
  clientIp: { header: string; trustedProxies?: string[] | undefined };
  /** Google/GitHub OAuth apps; a provider is enabled only when it is listed here. */
  socialProviders: SocialProviderCredentials;
}

export const AUTH_BASE_PATH = '/api/auth';
const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESET_PASSWORD_TTL_SECONDS = 60 * 60;
const DELETE_ACCOUNT_TTL_SECONDS = 60 * 60;

// Same rules as the tenants table checks, reported as a 400 instead of a database error.
const workspaceInput = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens'),
});

// Better Auth also knows its built-in `member` role and comma-separated role lists. Only our
// four single roles may be stored; anything else is a 400 here instead of a database error.
function assertWorkspaceRole(role: string): void {
  if (!(workspaceRoleNames as readonly string[]).includes(role)) {
    throw new APIError('BAD_REQUEST', {
      message: `Role must be one of: ${workspaceRoleNames.join(', ')}`,
    });
  }
}

export function createAuth(options: AuthOptions) {
  const { emailSender, baseUrl, db } = options;

  return betterAuth({
    appName: 'Evidence AI',
    baseURL: baseUrl,
    basePath: AUTH_BASE_PATH,
    secret: options.secret,
    trustedOrigins: [baseUrl],
    telemetry: { enabled: false },

    // Server-side sessions: an opaque signed token in an HttpOnly cookie, the session itself in
    // Redis (read on every request) with a copy in Postgres that survives a Redis restart.
    // The cookie cache stays off so sign-out and revocation apply on the next request.
    secondaryStorage: redisStorage({ client: options.redis, keyPrefix: options.redisKeyPrefix }),
    session: {
      modelName: 'sessions',
      storeSessionInDatabase: true,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: options.rateLimit,
      storage: 'secondary-storage',
      window: 60,
      max: 100,
      // Credential and email-sending endpoints get much tighter limits per client IP.
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/send-verification-email': { window: 60, max: 3 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 10 },
        '/change-password': { window: 60, max: 5 },
        '/change-email': { window: 60, max: 3 },
        '/delete-user': { window: 60, max: 3 },
      },
    },
    // Reset, delete-account and OAuth-state tokens live in Redis; only their hashes are stored,
    // so a Redis dump cannot be used to reset someone's password.
    verification: { modelName: 'verifications', storeIdentifier: 'hashed' },

    database: drizzleAdapter(options.db, {
      provider: 'pg',
      // Multi-step operations (e.g. deleting a workspace: members, invitations, then the
      // workspace) commit or fail as one. The owner guard in migration 0004 relies on it.
      transaction: true,
      schema: { users, sessions, accounts, verifications, tenants, memberships, invitations },
    }),
    user: {
      modelName: 'users',
      // Two steps: the current address approves, then the new address confirms. Only then is
      // the email changed, so a stolen session alone cannot move the account to a new address.
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await emailSender.send(
            changeEmailApprovalEmail({ to: user.email, name: user.name, newEmail, url }),
          );
        },
      },
      // Deletion always needs the link emailed to the account's address, opened while signed in.
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: DELETE_ACCOUNT_TTL_SECONDS,
        sendDeleteAccountVerification: async ({ user, token }) => {
          const url = `${baseUrl}/account/delete?token=${encodeURIComponent(token)}`;
          await emailSender.send(deleteAccountEmail(user.email, user.name, url));
        },
        beforeDelete: async (user) => {
          await assertNotSoleOwner(db, user.id);
        },
      },
      validateUserInfo: ({ user, source }) => rejectUnverifiedSocialSignUp(user, source),
    },
    account: {
      modelName: 'accounts',
      // Defaults kept on purpose: an OAuth identity links to an existing account only when the
      // provider verified the email and the local account is verified too (no trusted
      // providers), the emails must match, and the last sign-in method cannot be unlinked.
      accountLinking: { enabled: true },
    },
    advanced: {
      database: { generateId: 'uuid' },
      cookiePrefix: 'evidence',
      useSecureCookies: options.secureCookies,
      // Better Auth skips origin and CSRF checks when it detects a test run; keep them on so
      // the integration tests exercise the same checks as production.
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: [options.clientIp.header],
        ...(options.clientIp.trustedProxies && { trustedProxies: options.clientIp.trustedProxies }),
      },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL_SECONDS,
      // A reset signs out every device, in case the old password was known to someone else.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await emailSender.send(resetPasswordEmail(user.email, user.name, url));
      },
      onPasswordReset: async ({ user }) => {
        await emailSender.send(passwordChangedEmail(user.email, user.name));
      },
      // Sign-up answers the same for new and existing emails (no account enumeration); the
      // owner of an existing account is told instead.
      onExistingUserSignUp: async ({ user }) => {
        await emailSender.send(existingAccountEmail(user.email, user.name, `${baseUrl}/login`));
      },
    },
    socialProviders: options.socialProviders,
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await emailSender.send(verificationEmail(user.email, user.name, url));
      },
    },

    databaseHooks: {
      session: {
        create: {
          // New sessions start in one of the user's workspaces instead of none (see
          // defaultActiveWorkspace). AuthGuard still re-checks the membership on every request.
          before: async (session, ctx) => {
            const current = ctx?.context.session?.session as
              { userId: string; activeOrganizationId?: string | null } | undefined;
            const existing = (session as { activeOrganizationId?: string | null })
              .activeOrganizationId;
            if (existing) return undefined;
            const preferred =
              current?.userId === session.userId ? current.activeOrganizationId : null;
            const activeOrganizationId = await defaultActiveWorkspace(
              db,
              session.userId,
              preferred,
            );
            return activeOrganizationId
              ? { data: { ...session, activeOrganizationId } }
              : undefined;
          },
        },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-up/email' || ctx.path === '/update-user') {
          return { context: { body: normalizeProfileInput(ctx.body as object) } };
        }
        if (ctx.path === '/organization/delete') {
          await assertWorkspaceDeletionConfirmed(db, ctx.body);
        }
        if (ctx.path === '/organization/update') {
          return { context: { body: normalizeWorkspaceUpdate(ctx.body as object) } };
        }
        if (ctx.path === '/organization/list-invitations') {
          const session = await getSessionFromCtx(ctx);
          const query = ctx.query as { organizationId?: string } | undefined;
          const active = session?.session as { activeOrganizationId?: string | null } | undefined;
          const tenantId = query?.organizationId ?? active?.activeOrganizationId;
          if (session && tenantId && !(await canSeeInvitations(db, tenantId, session.user.id))) {
            throw new APIError('FORBIDDEN', {
              code: 'INSUFFICIENT_ROLE',
              message: 'Only admins and owners can see pending invitations.',
            });
          }
        }
        // Refuse a deletion request up front (errors inside the email callback are only
        // logged); beforeDelete checks again when the emailed link is confirmed.
        if (ctx.path === '/delete-user' && !(ctx.body as { token?: string } | undefined)?.token) {
          const session = await getSessionFromCtx(ctx);
          if (session) await assertNotSoleOwner(db, session.user.id);
        }
        return undefined;
      }),
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        if (!returned || isAPIError(returned)) return undefined;
        if (ctx.path === '/change-password') {
          const { user } = returned as { user: { email: string; name: string } };
          await emailSender.send(passwordChangedEmail(user.email, user.name));
        }
        // The full workspace includes pending invitations; strip them for editors and viewers.
        if (ctx.path === '/organization/get-full-organization') {
          const workspace = returned as { id: string };
          const session = await getSessionFromCtx(ctx);
          const allowed = session && (await canSeeInvitations(db, workspace.id, session.user.id));
          if (!allowed) return ctx.json({ ...workspace, invitations: [] });
        }
        return undefined;
      }),
    },

    plugins: [
      organization({
        ac: accessControl,
        roles: workspaceRoles,
        creatorRole: 'owner',
        invitationExpiresIn: INVITATION_TTL_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        // An invitation can only be accepted by someone who proved they own its email address.
        requireEmailVerificationOnInvitation: true,
        sendInvitationEmail: async (data) => {
          await emailSender.send(
            invitationEmail({
              to: data.email,
              inviterName: data.inviter.user.name,
              workspaceName: data.organization.name,
              role: data.role,
              url: `${baseUrl}/invite/${data.id}`,
            }),
          );
        },
        organizationHooks: {
          beforeCreateOrganization: ({ organization: input }) => {
            const result = workspaceInput.safeParse(input);
            if (!result.success) {
              throw new APIError('BAD_REQUEST', {
                message: result.error.issues.map((issue) => issue.message).join('; '),
              });
            }
            return Promise.resolve();
          },
          beforeCreateInvitation: ({ invitation }) => {
            assertWorkspaceRole(invitation.role);
            return Promise.resolve();
          },
          beforeAddMember: ({ member }) => {
            assertWorkspaceRole(member.role);
            return Promise.resolve();
          },
          beforeCancelInvitation: async ({ invitation, cancelledBy }) => {
            await assertCanCancelInvitation(db, invitation, cancelledBy.id);
          },
          beforeUpdateMemberRole: ({ newRole }) => {
            assertWorkspaceRole(newRole);
            return Promise.resolve();
          },
        },
        schema: {
          session: { fields: { activeOrganizationId: 'activeTenantId' } },
          organization: { modelName: 'tenants' },
          member: { modelName: 'memberships', fields: { organizationId: 'tenantId' } },
          invitation: { modelName: 'invitations', fields: { organizationId: 'tenantId' } },
        },
      }),
      // Listed after organization() so its inferred session fields stay typed.
      ...(options.openApiReference ? [openAPI()] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
