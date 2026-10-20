# Evidence AI

Multi-tenant enterprise knowledge assistant. Users upload documents, ask questions, and get answers with verifiable citations. Every user only retrieves documents they are allowed to see. Retrieval quality is measured with an eval suite.

This is a portfolio project meant to look and behave like a production product. Favour correctness, security and clarity over speed.

Full context: `docs/ARCHITECTURE.md` (architecture, data model, features, pages, flows, evals). Build order: `docs/PHASES.md`. Always check which phase and step we are on before starting work.

## Stack

- Monorepo: Turborepo + pnpm, TypeScript strict everywhere
- `apps/web`: Next.js (App Router), Tailwind, shadcn/ui, TanStack Query, AI SDK UI (`useChat`) for streaming
- `apps/api`: NestJS (REST), AI SDK Core for LLM calls
- `apps/worker`: NestJS standalone app running BullMQ processors (ingestion, re-indexing, eval runs)
- `packages/db`: Drizzle schema, migrations, RLS policies, typed query helpers
- `packages/shared`: Zod schemas and types shared by web, API and worker
- `packages/ai`: provider registry, embeddings, reranker, prompt templates, citation verification
- `packages/evals`: eval runner, metrics, CLI used locally and in CI
- Data: PostgreSQL + pgvector + built-in full-text search; Redis (BullMQ, cache, rate limits); S3 (MinIO locally)
- Auth: Better Auth with the organizations plugin, running inside `apps/api` at `/api/auth`; the web app proxies `/api/*` so the session cookie is first-party. Server-side sessions (not JWT): opaque signed token in an HttpOnly cookie, session in Redis (`secondaryStorage`) with a copy in Postgres used as fallback; cookie cache off so revocation is immediate. Auth rate limits live in Redis, keyed by client IP (`CLIENT_IP_HEADER` / `TRUSTED_PROXIES`, required in production)
- Email: Resend (official `resend` SDK) behind an `EmailSender` interface; without `RESEND_API_KEY` (local dev only) emails are logged by the API
- Reranker: Cohere Rerank. Embeddings: OpenAI text-embedding-3-small (behind an interface)
- LLM providers: OpenAI, Anthropic, Google through the AI SDK provider registry; model chosen per workspace
- Observability: Langfuse (LLM traces), Sentry, OpenTelemetry
- Tests: Vitest (unit/integration), Playwright (e2e), evals
- Infra: Docker Compose locally; AWS in production (ECS Fargate, RDS, ElastiCache, S3, ALB, CloudFront, Secrets Manager) defined with Terraform; CI/CD on GitHub Actions with OIDC deploys

Use current stable versions. Check official docs for APIs that change often (Next.js, Better Auth, AI SDK, Drizzle, pgvector) instead of relying on memory.

## Non-negotiable rules

1. **Tenant isolation.** Every tenant-owned table has `tenant_id`. RLS is enabled on all of them. The API sets the tenant on the DB session (`set_config('app.tenant_id', ...)` inside a transaction) for every request and job. Never bypass RLS in application code paths.
2. **Permissions are pre-filters.** Document ACLs are copied onto chunks (`allowed_principals`) and applied inside the retrieval SQL. Never filter permissions after retrieval or after the LLM call.
3. **Fail closed.** Documents whose ACL is being re-indexed are excluded from search. Unknown or missing permission data means no access.
4. **Citations are mandatory.** Every answer sentence cites a source number or the assistant says it cannot find the answer. Citations are verified against the cited chunk before being shown as supported.
5. **Every LLM and embedding call goes through `packages/ai`**, which checks the workspace's monthly cost limit before the call (refuse when exceeded) and records model, tokens, cost, latency and a Langfuse trace after it.
6. **Validate at the edges** with Zod schemas from `packages/shared` (API input, job payloads, LLM structured output).
7. **No secrets in code.** Use env vars validated at startup.

## Conventions

- NestJS: one module per domain (auth, tenants, documents, search, chat, evals, usage, audit). Guards for auth and roles; an interceptor or middleware sets tenant context.
- Roles: owner, admin, editor, viewer, ranked in that order. `@Roles('editor')` means "editor or higher" (`hasAtLeastRole` in `packages/shared`); put it on the controller and override per method. Routes without `@Roles` are open to any signed-in user. `RolesGuard` runs after `AuthGuard`.
- Errors: throw subclasses of `DomainError` (`apps/api/src/common/domain-error.ts`) with a status, a stable `code` and a client-safe message; `DomainExceptionFilter` renders `{ statusCode, code, message }`.
- API endpoints: one contract per endpoint in `packages/shared/src/contracts/<domain>.ts` (`defineEndpoint`: method, path, params/query/body/response Zod schemas). Nest handlers use `@Endpoint(contract)` (route, status, OpenAPI) and `@Input()` (validated input typed with `ValidatedInput<typeof contract>`; invalid input is 400 `VALIDATION_FAILED` with `details`); responses are filtered through the contract, so undeclared fields never leave the API. Every error is `{ statusCode, code, message, details?, requestId }`. Lists use `cursorQuerySchema` / `cursorPageSchema`.
- Web: call the API with `serverApi(contract, input)` in Server Components and `browserApi(contract, input)` (or TanStack Query hooks in `src/features/<domain>/`) in Client Components; both go through the same-origin `/api` proxy and throw `ApiError`. Auth and workspace membership calls use `authClient` (Better Auth). Query keys start with the workspace ID. Gate UI with `useCan(capability)` / `<Can>` from the shared `capabilities` list; the API enforces the same minimum roles. shadcn/ui components in `src/components/ui` are vendored (not linted). Until a feature exists, its pages use `/api/dev-mocks/*` (dev only, real `@Roles`).
- DB: migrations only through Drizzle Kit; raw SQL allowed for pgvector, full-text and RLS, kept in `packages/db`.
- Tests: every new endpoint gets an integration test; every security rule gets a test that tries to break it.
- Keep functions small, name things plainly, and write a short comment only where the reason is not obvious.

## Commands

First run: `pnpm install && pnpm env:init && pnpm infra:up && pnpm db:migrate`. Node 24, pnpm 11.

Env files: one per workspace, each with a committed `.env.example`; `pnpm env:init` creates missing ones and never overwrites. Root `.env` is Docker Compose only (no app reads it); `apps/api/.env`, `apps/worker/.env`, `apps/web/.env.local` (loaded natively by Next) and `packages/db/.env` (owner + test DB URLs). Each process loads only its own file and validates it with Zod; CI and AWS inject variables directly. When adding a variable, add it to the right `.env.example` and that app's env schema.

- `pnpm dev` – api (:4000), worker and web (:3000) in watch mode; needs `pnpm infra:up` first
- API docs – Swagger UI at http://localhost:3000/api/docs (through the web proxy, so your session cookie is sent) or :4000/api/docs, OpenAPI JSON at `/api/docs-json` (on by default outside production; `API_DOCS_ENABLED` overrides). Document every endpoint: `@ApiTags`, `@ApiOperation`, and Zod schemas via `standardSchema` on response decorators (`z.toJSONSchema()` for `@ApiBody`)
- `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format` / `pnpm format:check`
- `pnpm test` – unit and integration tests (Vitest, per workspace via turbo). Needs `pnpm infra:up`: DB tests use the `evidence_test` database and API tests use Redis database 1 (`TEST_REDIS_URL`) with a unique key prefix per test app
- `pnpm infra:up` / `pnpm infra:down` – Docker Compose: Postgres+pgvector (:5440), Redis (:6390), MinIO (:9000, console :9001), Langfuse (:3100), ClickHouse (internal)
- `pnpm e2e` – Playwright (not yet created)
- `pnpm eval` – run the eval suite (not yet created)
- `pnpm db:generate` – generate a migration from `packages/db/src/schema` (`pnpm --filter @evidence/db exec drizzle-kit generate --custom --name x` for hand-written SQL)
- `pnpm db:migrate` – apply migrations as `evidence_owner` (`DATABASE_OWNER_URL`)
- `pnpm db:seed:dev` – local test accounts (refuses production): `owner@`, `admin@`, `editor@`, `viewer@acme.test` in "Acme (dev)", plus `owner@globex.test` in "Globex (dev)" where the editor is also a viewer. Password `evidence-dev-password` (`DEV_SEED_PASSWORD` overrides). Idempotent
- `pnpm db:seed` (not yet created; step 2.9)

Notes: pnpm enforces a minimum release age on packages; pin to an older release rather than adding `minimumReleaseAgeExclude` entries. The apps connect to Postgres as `evidence_app` (no superuser, no BYPASSRLS, owns nothing); migrations run as `evidence_owner`. Every new table in `public` needs RLS and a policy (a catalog test enforces this); tenant policies use the helpers in `packages/db/src/schema/rls.ts`. Changes to `infra/docker/postgres/init` need the Postgres volume recreated. Tenant data access: API handlers use `TenantDb.tx` (the request's transaction, set by `TenantTransactionInterceptor` from `request.tenantContext`); worker jobs use `runTenantJob`; both go through `withTenantContext` in `packages/db`. Never query through the raw pool in request or job code. Every API route requires a session (global `AuthGuard`) unless marked `@Public()`; the guard re-checks the active workspace membership on every request. Database roles: `evidence_app` (API/worker, RLS-scoped), `evidence_auth` (Better Auth only: auth tables, nothing else), `evidence_owner` (migrations). Integration tests share `evidence_test`, so each test file creates and deletes only its own fixtures (no `truncate`). Better Auth turns its origin/CSRF checks off when it detects a test run; `advanced.disableOriginCheck: false` in `apps/api/src/auth/auth.ts` keeps them on so tests match production (don't remove it). Errors thrown inside Better Auth email callbacks are only logged, so put checks that must refuse a request in `hooks.before` or `beforeDelete`, not in the callback. Every workspace keeps at least one owner, enforced by a deferred constraint trigger on `memberships` (migration 0004) that locks the workspace row; test fixtures that remove an owner must leave another owner or delete the whole workspace. Better Auth's Drizzle adapter runs with `transaction: true` so multi-step operations (e.g. deleting a workspace) are atomic. Members and invitations go through Better Auth's organization endpoints, which already protect owners (only owners manage owners, the last owner can't leave or be demoted); our extra rules (owner invitations, who sees invitations, name-only rename, typed delete confirmation) are in `apps/api/src/auth/workspace-rules.ts`, wired as hooks in `auth.ts`. Social sign-in: a provider is enabled only when both `GOOGLE_*`/`GITHUB_*` client ID and secret are set in `apps/api/.env` (callback URLs are in its `.env.example`).

## Working style

- Work one step of `docs/PHASES.md` at a time. Before coding, state the plan for the step in a few lines and wait for approval if the step changes the schema or security model.
- After each step: run lint, typecheck and tests; tick the step in `docs/PHASES.md`; summarise what changed and anything left open.
- Ask before adding a dependency that is not in the stack above.
