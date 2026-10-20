import { createDb, memberships, tenants, users } from '@evidence/db';
import { MIN_PASSWORD_LENGTH, type WorkspaceRole } from '@evidence/shared';
import { and, eq } from 'drizzle-orm';
import { createAuth } from '../auth/auth.js';
import { loadApiEnv } from '../env.js';
import { createRedisClient } from '../redis/redis.module.js';

// Local test accounts so every role can be tried in the browser. Idempotent: run it again to
// restore anything you changed. Users are created through Better Auth (real password hashes)
// and marked verified; no emails are sent.

const PASSWORD = process.env.DEV_SEED_PASSWORD ?? 'evidence-dev-password';

const people = {
  owner: { email: 'owner@acme.test', name: 'Olivia Owner' },
  admin: { email: 'admin@acme.test', name: 'Adam Admin' },
  editor: { email: 'editor@acme.test', name: 'Eddie Editor' },
  viewer: { email: 'viewer@acme.test', name: 'Vera Viewer' },
  globexOwner: { email: 'owner@globex.test', name: 'Gloria Globex' },
} as const;

const workspaces: {
  slug: string;
  name: string;
  owner: keyof typeof people;
  members: [keyof typeof people, Exclude<WorkspaceRole, 'owner'>][];
}[] = [
  {
    slug: 'acme-dev',
    name: 'Acme (dev)',
    owner: 'owner',
    members: [
      ['admin', 'admin'],
      ['editor', 'editor'],
      ['viewer', 'viewer'],
    ],
  },
  // A second workspace sharing one user: try the workspace switcher and tenant isolation.
  {
    slug: 'globex-dev',
    name: 'Globex (dev)',
    owner: 'globexOwner',
    members: [['editor', 'viewer']],
  },
];

async function main(): Promise<void> {
  const env = loadApiEnv();
  if (env.NODE_ENV === 'production') throw new Error('The dev seed never runs in production');
  if (PASSWORD.length < MIN_PASSWORD_LENGTH)
    throw new Error(`DEV_SEED_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);

  const { db, pool } = createDb(env.AUTH_DATABASE_URL, { max: 2 });
  const redis = createRedisClient(env.REDIS_URL);
  const auth = createAuth({
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: env.BETTER_AUTH_URL,
    emailSender: { send: () => Promise.resolve() },
    secureCookies: false,
    redis,
    redisKeyPrefix: env.AUTH_REDIS_KEY_PREFIX,
    rateLimit: false,
    openApiReference: false,
    clientIp: { header: 'x-forwarded-for' },
    socialProviders: {},
  });

  try {
    const ids: Partial<Record<keyof typeof people, string>> = {};
    for (const [key, person] of Object.entries(people) as [
      keyof typeof people,
      (typeof people)[keyof typeof people],
    ][]) {
      let [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, person.email));
      if (!user) {
        const created = await auth.api.signUpEmail({
          body: { name: person.name, email: person.email, password: PASSWORD },
        });
        user = { id: created.user.id };
      }
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
      ids[key] = user.id;
    }
    const idOf = (key: keyof typeof people) => {
      const id = ids[key];
      if (!id) throw new Error(`Missing user ${key}`);
      return id;
    };

    for (const workspace of workspaces) {
      let [tenant] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, workspace.slug));
      if (!tenant) {
        const created = await auth.api.createOrganization({
          body: { name: workspace.name, slug: workspace.slug, userId: idOf(workspace.owner) },
        });
        tenant = { id: created.id };
      }
      for (const [person, role] of workspace.members) {
        const userId = idOf(person);
        const [existing] = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.tenantId, tenant.id), eq(memberships.userId, userId)));
        if (existing) {
          await db.update(memberships).set({ role }).where(eq(memberships.id, existing.id));
        } else {
          await auth.api.addMember({ body: { userId, role, organizationId: tenant.id } });
        }
      }
    }

    console.log(
      `\nDev seed ready. Sign in at ${env.BETTER_AUTH_URL}/login with password:`,
      PASSWORD,
    );
    console.table([
      { email: people.owner.email, 'Acme (dev)': 'owner', 'Globex (dev)': '' },
      { email: people.admin.email, 'Acme (dev)': 'admin', 'Globex (dev)': '' },
      { email: people.editor.email, 'Acme (dev)': 'editor', 'Globex (dev)': 'viewer' },
      { email: people.viewer.email, 'Acme (dev)': 'viewer', 'Globex (dev)': '' },
      { email: people.globexOwner.email, 'Acme (dev)': '', 'Globex (dev)': 'owner' },
    ]);
  } finally {
    await pool.end();
    redis.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
