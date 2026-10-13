# Evidence AI – Development Phases

Five phases. Each phase ends with a gate: don't start the next phase until the gate passes and the slice is deployed (from Phase 1 onward).

Each step is sized for one Claude Code session. Tick steps as they are done.

---

## Phase 1 – Foundation

**Goal:** a secure multi-tenant skeleton running locally and on AWS.

- [x] **1.1 Monorepo.** Turborepo + pnpm with `apps/web`, `apps/api`, `apps/worker`, `packages/db`, `packages/shared`, `packages/ai`, `packages/evals`. Shared tsconfig (strict), ESLint/Prettier or Biome, Vitest config.
- [x] **1.2 Local infrastructure.** Docker Compose: Postgres with pgvector, Redis, MinIO, Langfuse. `.env.example` and env validation with Zod in each app.
- [x] **1.3 Database core.** Drizzle schema for `tenants`, `users`, `memberships` (role), `groups`, `group_members`, `audit_log`. Migrations. RLS policies on tenant tables using `app.tenant_id`.
- [ ] **1.4 Tenant context.** NestJS middleware/interceptor that opens a transaction and sets `app.tenant_id` per request; helper for workers to do the same per job. Integration test: tenant A cannot read tenant B rows even with a raw query that omits `WHERE tenant_id`.
- [ ] **1.5 Auth.** Better Auth with the organizations plugin; sign up, sign in, create workspace, invite by email, accept invite. Session shared between web and API.
- [ ] **1.6 Roles.** `@Roles()` decorator + guard for owner/admin/editor/viewer. Tests for each role boundary.
- [ ] **1.7 Web shell.** Next.js app with auth pages, onboarding (create workspace), app layout with sidebar and workspace switcher, empty pages for Ask, Search, Documents, Settings, Evals.
- [ ] **1.8 CI.** GitHub Actions: install, lint, typecheck, unit + integration tests (Postgres and Redis as services).
- [ ] **1.9 AWS baseline.** Terraform: VPC, ECR, ECS Fargate cluster and services (web, api, worker), RDS Postgres with pgvector, ElastiCache Redis, S3, ALB, CloudFront, Secrets Manager. GitHub OIDC role. Deploy workflow on push to `main` with migrations as a release step.

**Gate:** a user can sign up, create a workspace and invite a teammate on the deployed URL; isolation and role tests pass in CI.

---

## Phase 2 – Ingestion

**Goal:** documents go from upload to searchable chunks reliably.

- [ ] **2.1 Schema.** `collections`, `documents`, `document_versions`, `document_acl`, `chunks` (text, `embedding vector`, `tsv tsvector`, page, heading_path, char offsets, `allowed_principals text[]`). Indexes: HNSW on embedding, GIN on tsv, GIN on allowed_principals. RLS on all.
- [ ] **2.2 Upload.** Presigned S3 upload from the web app; API creates the document with status `queued` and enqueues an ingestion job. Supported: PDF, DOCX, MD, TXT; size and type limits.
- [ ] **2.3 Parsing.** Worker extracts text with structure (pages, headings) using unpdf and mammoth. Clear errors for empty or scanned PDFs.
- [ ] **2.4 Chunking.** Structure-aware chunker (split by heading/paragraph, ~400–800 tokens, small overlap), keeping page, heading path and offsets. Unit tests with fixture documents. Chunk size configurable for later experiments.
- [ ] **2.5 Embedding.** `packages/ai` embedding interface (OpenAI implementation), batching, retries with backoff, cost tracking. Worker writes chunks, embeddings, tsv and ACL copy in one transaction, then sets status `ready`.
- [ ] **2.6 Job reliability and deduplication.** BullMQ retries, dead-letter queue, idempotent jobs (re-running a job doesn't duplicate chunks), progress events. SHA-256 `content_hash` on uploads: an identical file in the workspace is rejected with a link to the existing document. New versions re-embed only chunks whose `text_hash` changed.
- [ ] **2.7 Documents UI.** Collections, upload dropzone with sharing choice (workspace or groups), live status cards (Queued → Parsing → Embedding → Ready / Failed with reason and Retry), document detail page with versions and chunk list.
- [ ] **2.8 Versions.** Re-upload creates a new version; old version chunks are excluded from search but kept.
- [ ] **2.9 Corpus + seed.** Pick a public corpus (~50–200 documents); seed script creates a demo workspace with users Admin, HR, Engineering, and some HR-only documents.

**Gate:** the demo corpus indexes cleanly with no failed jobs; re-running ingestion is idempotent.

---

## Phase 3 – Search and chat

**Goal:** fast, cited answers that never leak restricted content.

- [ ] **3.1 Hybrid retrieval.** One SQL query: vector similarity + full-text rank, both filtered by tenant, `ready` status, current version and `allowed_principals && user_principals`; merged with Reciprocal Rank Fusion. Returns top 30–50 candidates.
- [ ] **3.2 Search page.** Results with highlighted snippets, filters (collection, type, date), click to open the document at the page.
- [ ] **3.3 Reranking.** Cohere Rerank on candidates, keep top 6–10. Behind an interface so it can be toggled for experiments.
- [ ] **3.4 Provider registry.** AI SDK Core registry with OpenAI, Anthropic and Google; workspace setting for the chat model; fallback to a second provider on errors; per-call usage logging to `usage_events` and Langfuse.
- [ ] **3.5 Answer generation.** Query rewriting for follow-ups; prompt with numbered sources; streaming via AI SDK; "not found" behaviour when retrieval is weak.
- [ ] **3.6 Citation verification.** Parse citation numbers, check each exists and that its chunk supports the sentence (LLM check, batched); store `citations` with `supported` flag.
- [ ] **3.7 Ask page.** `useChat` streaming UI, citation chips, side panel showing the source page with the passage highlighted, unsupported-claim flag, feedback (thumbs + reason), conversation history page.
- [ ] **3.8 Rate limits, cost limits and caching.** Per-user and per-workspace rate limits in Redis; monthly cost limit per workspace (`monthly_cost_limit_usd`) checked before every LLM and embedding call, computed from `usage_events`, with a clear error when exceeded; cache embeddings of repeated queries.

**Gate:** every answer in a 30-question manual check has citations that open the right passage; p95 time to first token is measured and shown.

---

## Phase 4 – Access control and evals

**Goal:** provable security and measurable quality.

- [ ] **4.1 Sharing.** Per-document sharing to groups and users; sharing change enqueues ACL re-index; document hidden from search until it finishes.
- [ ] **4.2 Access review.** Admin page: who can see which documents; "view as user" search check; audit log entries for sharing and role changes.
- [ ] **4.3 Leakage test suite.** Automated tests where users ask about documents they can't access, through search and chat; assert zero restricted chunks retrieved or cited. Runs in CI.
- [ ] **4.4 Eval schema and dataset.** `eval_sets`, `eval_cases` (question, expected chunk IDs, reference answer, type: factual, multi-hop, follow-up, unanswerable, restricted), `eval_runs`, `eval_results`. Build 150–300 cases over the demo corpus; import/export as JSON.
- [ ] **4.5 Eval runner.** `packages/evals` CLI and worker job: recall@k, MRR/nDCG, faithfulness, citation precision, answer correctness (LLM judge), abstention rate, leakage, latency and cost. Config per run (chunk size, hybrid on/off, rerank on/off, model).
- [ ] **4.6 Evals UI.** Datasets, runs list with metric trends, run detail (per-question retrieved vs expected chunks, judge reasoning), compare two runs (improved and regressed questions).
- [ ] **4.7 Experiments.** Run and record: vector-only vs hybrid, rerank on/off, chunk sizes, two embedding models, two LLM providers. Save the results table for the README.
- [ ] **4.8 CI quality gate.** Smoke eval set (30–50 cases) on every PR; fail on drops beyond thresholds or any leakage.
- [ ] **4.9 Feedback to evals.** Promote a downvoted answer into the eval set from the UI.

**Gate:** leakage is 0 in CI; a baseline eval run and at least three experiments are recorded.

---

## Phase 5 – Production polish and launch

**Goal:** a product a recruiter can try in one click, and a story you can tell.

- [ ] **5.1 Observability.** Sentry in web/API/worker, OpenTelemetry traces, Langfuse dashboards; structured logs.
- [ ] **5.2 Usage page.** Questions, tokens, cost, p95 latency, top unanswered questions per workspace; cost limit setting and a warning at 80% of the limit.
- [ ] **5.3 Hardening.** Security headers, CSRF, input limits, file scanning limits, backup and restore check for RDS, load test of the chat endpoint (record p50/p95).
- [ ] **5.4 Public demo.** One-click demo login into the seeded workspace (read-only for destructive actions), nightly reset job.
- [ ] **5.5 Landing page.** Value proposition, demo video, eval results table, architecture image, "Try the demo".
- [ ] **5.6 Excalidraw diagrams.** System architecture, ingestion pipeline, query pipeline, permission check, data model, eval loop, AWS deployment. Store `.excalidraw` sources and exported SVGs in `docs/diagrams/`.
- [ ] **5.7 README as a case study.** Problem, architecture, security model, eval results and experiments, tradeoffs, what failed, what's next; links to demo and video.
- [ ] **5.8 Demo video and write-up.** 2–3 minute walkthrough; one technical blog post (for example, "How hybrid search and reranking moved recall@10 from X to Y").

**Gate:** public demo is live, README is complete, video is published.
