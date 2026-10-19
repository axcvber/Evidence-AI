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
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { organization } from 'better-auth/plugins';
import { workspaceRoleNames } from '@evidence/shared';
import { z } from 'zod';
import { EmailSender } from '../email/email-sender.js';
import { accessControl, workspaceRoles } from './access-control.js';
import { invitationEmail, verificationEmail } from './emails.js';

export interface AuthOptions {
  /** Drizzle client connected as evidence_auth. */
  db: Database;
  secret: string;
  /** Public origin the browser uses (the web app, which proxies /api/* to this API). */
  baseUrl: string;
  emailSender: EmailSender;
  secureCookies: boolean;
  rateLimit: boolean;
}

export const AUTH_BASE_PATH = '/api/auth';
const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

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
  const { emailSender, baseUrl } = options;

  return betterAuth({
    appName: 'Evidence AI',
    baseURL: baseUrl,
    basePath: AUTH_BASE_PATH,
    secret: options.secret,
    trustedOrigins: [baseUrl],
    telemetry: { enabled: false },
    rateLimit: { enabled: options.rateLimit, window: 60, max: 100 },

    database: drizzleAdapter(options.db, {
      provider: 'pg',
      schema: { users, sessions, accounts, verifications, tenants, memberships, invitations },
    }),
    user: { modelName: 'users' },
    session: { modelName: 'sessions' },
    account: { modelName: 'accounts' },
    verification: { modelName: 'verifications' },
    advanced: {
      database: { generateId: 'uuid' },
      cookiePrefix: 'evidence',
      useSecureCookies: options.secureCookies,
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await emailSender.send(verificationEmail(user.email, user.name, url));
      },
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
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
