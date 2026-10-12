# Evidence AI — Architecture & Product Plan

Oct 12, 2026 · @Alex

## Overview

Evidence AI is a multi-tenant knowledge assistant. Users upload documents, search them, and ask questions. Every answer cites the exact passages it came from, and a user only ever retrieves documents they are allowed to see.

Design principles:

- **Grounded answers.** Every claim cites a source, or the assistant says it cannot find the answer.
- **Security in the query.** Tenant isolation and document permissions are enforced inside the database query, not after it.
- **Measured quality.** Retrieval quality, answer quality, latency and cost are measured continuously.
- **One core loop done well.** Upload → search → cited answer → evaluation, before any integrations.

## Core capabilities

Six capabilities define the product; the sections below specify each one in detail.

| Capability | Scope |
| --- | --- |
| Document ingestion | Upload PDF, DOCX, MD and TXT; extract text with its structure; track processing status; retry and surface failed jobs |
| Hybrid retrieval | PostgreSQL full-text search combined with pgvector embeddings (Reciprocal Rank Fusion); optional reranking |
| Grounded answers | Answers with numbered source references, passage previews, and links to the original document at the cited page |
| Multi-tenant permissions | Organizations, users, roles and document-level access control, enforced inside every retrieval query |
| Evaluation suite | Retrieval relevance, answer correctness, citation accuracy, and behaviour when evidence is missing |
| Production operations | Background jobs, retries, ingestion deduplication, observability, usage tracking and cost limits |

## Tech stack

One PostgreSQL database holds documents, vectors, permissions and eval results, so a single SQL query enforces access control during retrieval.

| Layer | Choice | Why it fits this project |
| --- | --- | --- |
| Monorepo | Turborepo + pnpm | Shared Zod schemas and types across web, API and workers |
| Frontend | Next.js (App Router), TypeScript, Tailwind, shadcn/ui | Server components for document pages; client components for streaming chat |
| Client state | TanStack Query + AI SDK UI (useChat) | Streaming chat answers with citations rendered as they arrive |
| API | NestJS | Modules, guards and interceptors make tenant scoping and RBAC explicit and testable |
| Background jobs | BullMQ on Redis (NestJS workers) | Parsing and embedding run outside requests, with retries, progress and dead-letter queues |
| Database | PostgreSQL + pgvector + built-in full-text search | Vectors, keyword index and ACLs in one place; hybrid search in one query |
| ORM / migrations | Drizzle | Typed SQL, easy raw queries for pgvector and full-text ranking |
| Tenant isolation | Postgres Row-Level Security + tenant\_id on every table | A missing WHERE clause cannot leak another tenant's data |
| Auth | Better Auth (organizations plugin) | Open source, self-hosted; orgs, roles and invites live in your own Postgres, so the permission model is your code |
| File storage | AWS S3 (MinIO locally) | Original files and versions; presigned uploads |
| Parsing | unpdf + mammoth in Node; optional Docling sidecar for tables and scans | Stays in TypeScript; the sidecar handles tables and scans |
| Embeddings | OpenAI text-embedding-3-small (Cohere or Voyage as a comparison) | Behind an interface so you can benchmark models in evals |
| Reranker | Cohere Rerank | The single biggest quality lift after hybrid search |
| LLM | AI SDK Core with a provider registry: OpenAI, Anthropic, Google and others | Model chosen per workspace in settings; automatic fallback to a second provider on errors; the same eval set compares providers |
| LLM observability | Langfuse (open source, self-hostable) | Traces per question: retrieval, rerank, prompt, tokens, cost, latency |
| Errors / metrics | Sentry + OpenTelemetry | Standard production signals beside the AI traces |
| Testing | Vitest, Playwright, plus the eval runner | Unit, end-to-end and quality regression in CI |
| Infra | Docker Compose locally; all of production on AWS: ECS Fargate (web, API, workers), RDS PostgreSQL with pgvector, ElastiCache Redis, S3, ALB + CloudFront, Secrets Manager | Single cloud, defined as code with Terraform |
| CI/CD | GitHub Actions | Lint, test and run evals on every PR; on main, build images to ECR and deploy to ECS through GitHub OIDC (no stored AWS keys), with migrations as a release step |

## System architecture

The system has three runtime parts (web app, API, workers) around one PostgreSQL database. Postgres is the source of truth for documents, vectors, permissions and evaluation results.

&#91;embedded content: system architecture · web, API, workers, data stores, external AI services\]

The API never queries without a tenant context, and Postgres Row-Level Security enforces it a second time. Heavy work (parsing, embedding, re-indexing) runs in workers so uploads never block a request.

### Ingestion pipeline

1. The user uploads through a presigned S3 URL; the API creates a `document` row with status `queued`.
2. A worker downloads the file and extracts text with its structure (headings, pages, tables).
3. Structure-aware chunking: split by heading and paragraph, about 400–800 tokens, with a small overlap. Each chunk keeps page number, heading path and character offsets, so a citation can highlight the exact span.
4. The worker embeds chunks in batches, builds the full-text vector, and copies the document's ACL onto every chunk.
5. The document becomes `ready`. Progress and failures stream to the UI; a failed file goes to a dead-letter queue with the error shown.
6. Deduplication: the API stores a SHA-256 hash of each file. An identical file already in the workspace is rejected with a link to the existing document. A new version re-embeds only chunks whose text hash changed; old chunks are kept for audit but excluded from search.

### Query pipeline

1. Auth guard resolves the user, tenant, role and group memberships, then checks the rate limit and the workspace's monthly cost limit.
2. Query rewriting: use the chat history to turn a follow-up ("what about 2024?") into a standalone search query.
3. Hybrid retrieval in one SQL query: vector similarity plus keyword rank, both filtered by tenant and ACL, merged with Reciprocal Rank Fusion. Top 30–50 candidates.
4. Rerank the candidates and keep the best 6–10.
5. Build the prompt with numbered sources. The model must cite a source number for every claim, or say it does not know.
6. Citation verification: check that each cited number exists and its chunk supports the sentence. Unsupported claims are flagged in the UI.
7. Stream the answer; save the message, citations, retrieved chunk IDs, tokens, cost and latency; send the trace to Langfuse.

### Multi-tenancy and permissions

- **Tenant isolation:** every table has `tenant_id`. The API sets the tenant on the database session, and RLS policies reject any row from another tenant.
- **Roles:** Owner, Admin, Editor, Viewer at the workspace level (who can upload, manage users, run evals).
- **Document ACL:** each document is visible to everyone in the workspace, or to selected groups and users. The allowed group and user IDs are copied onto each chunk and indexed.
- **Pre-filter, never post-filter:** permissions are applied inside the retrieval SQL. Filtering after retrieval can leak text through the LLM and also leaves too few results.
- **ACL changes:** editing a document's sharing enqueues a job that updates its chunks; until it finishes, the document is hidden from search (fail closed).
- **Proof:** an automated test suite where one user asks about another group's secret documents and must get zero citations to them.

### Data model

| Table | Purpose | Key columns |
| --- | --- | --- |
| tenants | A customer workspace | id, name, plan, settings, monthly\_cost\_limit\_usd |
| users, memberships | People and their role per tenant | user\_id, tenant\_id, role |
| groups, group\_members | Teams used in sharing | group\_id, user\_id |
| collections | Folders of documents | id, tenant\_id, name |
| documents, document\_versions | Files and their history | status, s3\_key, content\_hash, version, uploaded\_by |
| document\_acl | Who can see a document | document\_id, principal\_type, principal\_id |
| chunks | Searchable passages | text, embedding (vector), tsv, page, heading\_path, offsets, text\_hash, allowed\_principals\[\] |
| conversations, messages | Chat history | role, content, model, tokens, cost\_usd, latency\_ms |
| citations | Links from an answer to evidence | message\_id, chunk\_id, source\_number, supported |
| feedback | Thumbs and comments on answers | message\_id, rating, reason |
| eval\_sets, eval\_cases, eval\_runs, eval\_results | Quality measurement | question, expected\_chunk\_ids, expected\_answer, scores |
| audit\_log, usage\_events | Compliance and billing | actor, action, target, created\_at |

## Features

The MVP is the complete core loop: upload, search, cited answer, eval. v1 completes the product; stretch items are optional.

| Area | MVP | v1 | Stretch |
| --- | --- | --- | --- |
| Workspaces | Sign up, create workspace, invite by email, 4 roles | Groups, workspace settings | SAML/OIDC SSO, SCIM user sync |
| Documents | Upload PDF, DOCX, MD, TXT; status, errors and retry; duplicate detection; collections | Versions, re-index, bulk upload, document preview with page view | Connectors: Google Drive, Notion, Confluence with sync |
| Permissions | Workspace-wide or group-restricted documents | Per-user sharing, access-review page, audit log | Inherited permissions from connected sources |
| Search | Hybrid search with filters (collection, type, date) | Reranking, highlighted snippets, search analytics | Semantic "similar documents" |
| Chat | Streaming answers with numbered citations; follow-ups | Citation side panel jumping to the exact page and span; "not found" answers; unsupported-claim flags | Multi-step agentic search for complex questions |
| Models | OpenAI and Anthropic behind one provider interface, chosen in settings | Per-workspace model choice, automatic fallback, side-by-side model evals | Self-hosted or Bedrock models |
| Quality | Eval runner, dataset editor, results page | Experiment comparison, CI quality gate, feedback-to-eval | LLM-judge calibration against human labels |
| Operations | Traces in Langfuse, cost and latency per answer, rate limits, monthly cost limit per workspace | Usage dashboard per workspace, warning at 80% of the cost limit | Per-user quotas and budget alerts by email |

## Pages and screens

The app has 13 screens in four areas. A public demo workspace with sample documents and seeded users (Admin, HR, Engineering) supports one-click demo login.

| Area | Page | Route | What it shows | Who sees it |
| --- | --- | --- | --- | --- |
| Public | Landing | / | Value, 60-second demo video, eval results, "Try the demo" | Everyone |
| Public | Sign in / sign up | /login, /signup | Auth, accept invite | Everyone |
| Onboarding | Create workspace | /onboarding | Name, invite teammates, upload first documents | New owner |
| Workspace | Ask (chat) | /w/\[ws\]/ask | Chat, streaming answer, citation panel with the source page highlighted | All roles |
| Workspace | Conversations | /w/\[ws\]/history | Past chats, search, delete | All roles |
| Workspace | Search | /w/\[ws\]/search | Hybrid search results with snippets and filters | All roles |
| Workspace | Documents | /w/\[ws\]/documents | Collections, upload, status, sharing badge | All roles (upload: Editor+) |
| Workspace | Document detail | /w/\[ws\]/documents/\[id\] | Preview, versions, chunks, who can access, re-index | Editor+ |
| Admin | Members and groups | /w/\[ws\]/settings/members | Invite, roles, groups | Admin+ |
| Admin | Access review | /w/\[ws\]/settings/access | Which groups can see which documents; "view as user" check | Admin+ |
| Admin | Usage and costs | /w/\[ws\]/settings/usage | Questions, tokens, cost, p95 latency, top unanswered questions | Admin+ |
| Quality | Evals | /w/\[ws\]/evals | Datasets, runs, metric trends, run comparison | Admin+ |
| Quality | Eval run detail | /w/\[ws\]/evals/runs/\[id\] | Per-question results, retrieved vs expected chunks, judge reasoning | Admin+ |

## End-to-end flows

Five flows cover the whole product. Each one has a Playwright end-to-end test.

### 1. Onboarding

1. Sign up, then create a workspace (you become Owner).
2. Invite teammates by email and choose their role.
3. Upload a first batch of documents, or load the sample set.
4. Land on the Ask page with suggested starter questions from your documents.

### 2. Upload and indexing

1. An Editor picks a collection and drops files.
2. The Editor chooses sharing: whole workspace, or specific groups.
3. Files upload directly to S3; status cards show Queued → Parsing → Embedding → Ready, with progress.
4. A failed file shows the reason (for example, a scanned PDF with no text) and a retry button.

### 3. Ask a question

1. The user asks a question; the answer streams within about a second.
2. Every sentence carries citation numbers; sources are listed with title, page and snippet.
3. Clicking a citation opens the document at that page with the passage highlighted.
4. If nothing relevant is found, the assistant says so and suggests related documents. It never guesses.
5. The user rates the answer; a thumbs-down asks why (wrong, incomplete, bad source).

### 4. Permission change

1. An Admin restricts "Salary bands 2026" to the HR group.
2. The document is hidden from search until re-indexing finishes (fail closed).
3. An Engineering user asks about salary bands and gets "not found" with no citation.
4. An HR user asks the same question and gets a cited answer.
5. The Admin uses "view as user" on the Access review page to confirm, and the change is recorded in the audit log.

### 5. Improve quality

1. An Admin opens a downvoted answer and adds it to the eval set with the correct source.
2. The Admin changes a setting (for example, enables reranking) and runs the eval.
3. The comparison view shows metric changes and the questions that improved or regressed.
4. In the repo, the same eval runs in CI and blocks a pull request that lowers quality.

## Evaluation strategy

Quality is measured offline with a labelled eval set, in CI with a smoke set, and online with user feedback.

**Eval dataset:** 150–300 questions over a public corpus you can publish (for example, company handbooks, open government policies, or technical docs). Each case stores the question, the chunk IDs that contain the answer, a reference answer, and a type: factual, multi-hop, follow-up, unanswerable, or permission-restricted.

| Metric | What it measures | How it is computed |
| --- | --- | --- |
| Recall@k | Did retrieval find the right passages? | Share of expected chunks in the top k |
| MRR / nDCG | Were the right passages near the top? | Rank-based scores on retrieved chunks |
| Faithfulness | Is every claim supported by a cited source? | LLM judge per sentence against its cited chunk |
| Citation precision | Do citations point to evidence that supports the sentence? | Supported citations divided by all citations |
| Answer correctness | Does it match the reference answer? | LLM judge, spot-checked by hand |
| Abstention rate | Does it say "not found" on unanswerable questions? | Correct refusals on unanswerable cases |
| Permission leakage | Did restricted content appear? | Must be exactly 0 on restricted cases |
| Latency, cost | Is it usable and affordable? | p50 / p95 ms and USD per answer from traces |

**Experiments to run and publish:** vector-only vs hybrid; with and without reranking; chunk size 300 vs 600 vs 1000 tokens; two embedding models; query rewriting on or off. Each experiment is one eval run, stored in the database and shown in the Evals page.

**In CI:** a smaller "smoke" set (30–50 cases) runs on every pull request. The build fails if recall@10 or faithfulness drops by more than an agreed threshold, or if permission leakage is above 0.

**Online signals:** thumbs up/down with reasons, citation clicks, and "no answer" rates per collection. Downvoted answers can be promoted into the eval set with one click.
