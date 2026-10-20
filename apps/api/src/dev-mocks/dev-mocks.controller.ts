import type { DevMockName, EndpointResponse, ValidatedInput } from '@evidence/shared';
import { capabilities, devMockCapabilities, devMocks, WorkspaceRole } from '@evidence/shared';
import { Controller, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { Roles } from '../auth/roles.decorator.js';
import { Endpoint, Input } from '../contracts/endpoint.decorator.js';

/** The minimum role comes from the shared capability list, so UI and API can't drift apart. */
const minRole = (name: DevMockName): WorkspaceRole =>
  capabilities[devMockCapabilities[name]].minRole;

type Response<N extends DevMockName> = EndpointResponse<(typeof devMocks)[N]>;

const documentSeeds: [string, Response<'listDocuments'>['items'][number]['type']][] = [
  ['Employee handbook 2026', 'pdf'],
  ['Salary bands 2026', 'docx'],
  ['Security policy', 'md'],
  ['Onboarding checklist', 'txt'],
  ['Travel and expenses policy', 'pdf'],
];

const documents: Response<'listDocuments'>['items'] = documentSeeds.map(([title, type], i) => ({
  id: `00000000-0000-4000-8000-00000000d0c${i}`,
  title,
  type,
  status: i === 4 ? 'processing' : 'ready',
  updatedAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
}));

const evalRuns: Response<'listEvalRuns'>['items'] = [
  { name: 'Baseline: vector only', recallAt10: 0.71 },
  { name: 'Hybrid search', recallAt10: 0.82 },
  { name: 'Hybrid + rerank', recallAt10: 0.89 },
].map((run, i) => ({
  id: `00000000-0000-4000-8000-0000000e7a1${i}`,
  name: run.name,
  status: 'completed',
  recallAt10: run.recallAt10,
  startedAt: new Date(Date.UTC(2026, 9, 10 + i)).toISOString(),
}));

/**
 * Canned stand-ins for features from later phases, protected by the real @Roles so each role's
 * pages can be tried now. Only registered outside production (see DEV_MOCKS_ENABLED).
 */
@ApiTags('dev-mocks')
@ApiCookieAuth()
@Controller()
export class DevMocksController {
  @Endpoint(devMocks.listDocuments)
  @Roles(minRole('listDocuments'))
  listDocuments(
    @Input() { query }: ValidatedInput<typeof devMocks.listDocuments>,
  ): Response<'listDocuments'> {
    return { items: documents.slice(0, query.limit), nextCursor: null };
  }

  @Endpoint(devMocks.uploadDocument)
  @Roles(minRole('uploadDocument'))
  uploadDocument(
    @Input() { body }: ValidatedInput<typeof devMocks.uploadDocument>,
  ): Response<'uploadDocument'> {
    return {
      id: crypto.randomUUID(),
      title: body.title,
      type: 'pdf',
      status: 'processing',
      updatedAt: new Date().toISOString(),
    };
  }

  @Endpoint(devMocks.deleteDocument)
  @Roles(minRole('deleteDocument'))
  deleteDocument(): Response<'deleteDocument'> {
    return { deleted: true };
  }

  @Endpoint(devMocks.ask)
  @Roles(minRole('ask'))
  ask(@Input() { body }: ValidatedInput<typeof devMocks.ask>): Response<'ask'> {
    return {
      answer: `This is a canned answer to "${body.question}" [1]. Real retrieval arrives in Phase 3 [2].`,
      citations: [
        {
          number: 1,
          documentTitle: 'Employee handbook 2026',
          page: 4,
          snippet: 'Employees accrue 25 days of paid leave per year.',
        },
        {
          number: 2,
          documentTitle: 'Security policy',
          page: 2,
          snippet: 'Access to documents follows workspace roles and group sharing.',
        },
      ],
    };
  }

  @Endpoint(devMocks.search)
  @Roles(minRole('search'))
  search(@Input() { query }: ValidatedInput<typeof devMocks.search>): Response<'search'> {
    return {
      items: documents.slice(0, 3).map((doc, i) => ({
        number: i + 1,
        documentTitle: doc.title,
        page: i + 1,
        snippet: `…a passage from "${doc.title}" that mentions ${query.q}…`,
      })),
      nextCursor: null,
    };
  }

  @Endpoint(devMocks.inviteMember)
  @Roles(minRole('inviteMember'))
  inviteMember(
    @Input() { body }: ValidatedInput<typeof devMocks.inviteMember>,
  ): Response<'inviteMember'> {
    return { wouldInvite: body.email };
  }

  @Endpoint(devMocks.createGroup)
  @Roles(minRole('createGroup'))
  createGroup(
    @Input() { body }: ValidatedInput<typeof devMocks.createGroup>,
  ): Response<'createGroup'> {
    return { id: crypto.randomUUID(), name: body.name };
  }

  @Endpoint(devMocks.listEvalRuns)
  @Roles(minRole('listEvalRuns'))
  listEvalRuns(): Response<'listEvalRuns'> {
    return { items: evalRuns };
  }

  @Endpoint(devMocks.startEvalRun)
  @Roles(minRole('startEvalRun'))
  startEvalRun(): Response<'startEvalRun'> {
    return {
      id: crypto.randomUUID(),
      name: 'Manual run',
      status: 'running',
      recallAt10: null,
      startedAt: new Date().toISOString(),
    };
  }

  @Endpoint(devMocks.usage)
  @Roles(minRole('usage'))
  usage(): Response<'usage'> {
    return { questions: 1284, tokens: 2_310_455, costUsd: 18.42, monthlyLimitUsd: 50 };
  }

  @Endpoint(devMocks.deleteWorkspace)
  @Roles(minRole('deleteWorkspace'))
  deleteWorkspace(@Req() request: AuthenticatedRequest): Response<'deleteWorkspace'> {
    return { wouldDelete: request.tenantContext?.tenantId ?? 'unknown' };
  }
}
