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
- Auth: Better Auth with the organizations plugin
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
- Roles: owner, admin, editor, viewer. Enforce with a `@Roles()` decorator + guard.
- DB: migrations only through Drizzle Kit; raw SQL allowed for pgvector, full-text and RLS, kept in `packages/db`.
- Errors: typed domain errors mapped to HTTP responses in one exception filter.
- Tests: every new endpoint gets an integration test; every security rule gets a test that tries to break it.
- Keep functions small, name things plainly, and write a short comment only where the reason is not obvious.

## Commands

First run: `cp .env.example .env && pnpm install && pnpm infra:up`. Node 24, pnpm 11.

- `pnpm dev` – api (:4000), worker and web (:3000) in watch mode; needs `pnpm infra:up` first
- `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format` / `pnpm format:check`
- `pnpm test` – unit and integration tests (Vitest, per workspace via turbo). `packages/db` RLS tests need `pnpm infra:up` and run against the `evidence_test` database
- `pnpm infra:up` / `pnpm infra:down` – Docker Compose: Postgres+pgvector (:5440), Redis (:6390), MinIO (:9000, console :9001), Langfuse (:3100), ClickHouse (internal)
- `pnpm e2e` – Playwright (not yet created)
- `pnpm eval` – run the eval suite (not yet created)
- `pnpm db:generate` – generate a migration from `packages/db/src/schema` (`pnpm --filter @evidence/db exec drizzle-kit generate --custom --name x` for hand-written SQL)
- `pnpm db:migrate` – apply migrations as `evidence_owner` (`DATABASE_OWNER_URL`)
- `pnpm db:seed` (not yet created; step 2.9)

Notes: pnpm enforces a minimum release age on packages; pin to an older release rather than adding `minimumReleaseAgeExclude` entries. The apps connect to Postgres as `evidence_app` (no superuser, no BYPASSRLS, owns nothing); migrations run as `evidence_owner`. Every new table in `public` needs RLS and a policy (a catalog test enforces this); tenant policies use the helpers in `packages/db/src/schema/rls.ts`. Changes to `infra/docker/postgres/init` need the Postgres volume recreated.

## Working style

- Work one step of `docs/PHASES.md` at a time. Before coding, state the plan for the step in a few lines and wait for approval if the step changes the schema or security model.
- After each step: run lint, typecheck and tests; tick the step in `docs/PHASES.md`; summarise what changed and anything left open.
- Ask before adding a dependency that is not in the stack above.
