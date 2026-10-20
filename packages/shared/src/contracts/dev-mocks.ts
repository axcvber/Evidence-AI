import { z } from 'zod';
import { Capability } from '../capabilities.js';
import { cursorPageSchema, cursorQuerySchema } from './common.js';
import { defineEndpoint, EndpointDefinition } from './define.js';

// Stand-ins for features that arrive in later phases (documents, chat, search, evals, usage),
// so every role's pages can be exercised now. The API only registers them outside production,
// and each one is protected by the real @Roles for its capability. Responses are canned.

const mockDocument = z.object({
  id: z.uuid(),
  title: z.string(),
  type: z.enum(['pdf', 'docx', 'md', 'txt']),
  status: z.enum(['ready', 'processing']),
  updatedAt: z.iso.datetime(),
});

const mockCitation = z.object({
  number: z.number().int().min(1),
  documentTitle: z.string(),
  page: z.number().int().min(1),
  snippet: z.string(),
});

const mockEvalRun = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(['completed', 'running']),
  recallAt10: z.number().min(0).max(1).nullable(),
  startedAt: z.iso.datetime(),
});

export type MockDocument = z.output<typeof mockDocument>;
export type MockEvalRun = z.output<typeof mockEvalRun>;

export const devMocks = {
  listDocuments: defineEndpoint({
    method: 'GET',
    path: '/dev-mocks/documents',
    summary: '[mock] List documents',
    query: cursorQuerySchema,
    response: cursorPageSchema(mockDocument),
  }),
  uploadDocument: defineEndpoint({
    method: 'POST',
    path: '/dev-mocks/documents',
    summary: '[mock] Upload a document',
    body: z.object({ title: z.string().trim().min(1).max(200) }),
    response: mockDocument,
    status: 201,
  }),
  deleteDocument: defineEndpoint({
    method: 'DELETE',
    path: '/dev-mocks/documents/:documentId',
    summary: '[mock] Delete a document',
    params: z.object({ documentId: z.uuid() }),
    response: z.object({ deleted: z.literal(true) }),
  }),
  ask: defineEndpoint({
    method: 'POST',
    path: '/dev-mocks/ask',
    summary: '[mock] Ask a question',
    body: z.object({ question: z.string().trim().min(1).max(2000) }),
    response: z.object({ answer: z.string(), citations: z.array(mockCitation) }),
  }),
  search: defineEndpoint({
    method: 'GET',
    path: '/dev-mocks/search',
    summary: '[mock] Search documents',
    query: cursorQuerySchema.extend({ q: z.string().trim().min(1).max(500) }),
    response: cursorPageSchema(mockCitation),
  }),
  inviteMember: defineEndpoint({
    method: 'POST',
    path: '/dev-mocks/members/invite',
    summary: '[mock] Check inviting a member (sends nothing)',
    body: z.object({ email: z.email() }),
    response: z.object({ wouldInvite: z.email() }),
  }),
  createGroup: defineEndpoint({
    method: 'POST',
    path: '/dev-mocks/groups',
    summary: '[mock] Create a group',
    body: z.object({ name: z.string().trim().min(1).max(100) }),
    response: z.object({ id: z.uuid(), name: z.string() }),
    status: 201,
  }),
  listEvalRuns: defineEndpoint({
    method: 'GET',
    path: '/dev-mocks/evals/runs',
    summary: '[mock] List evaluation runs',
    response: z.object({ items: z.array(mockEvalRun) }),
  }),
  startEvalRun: defineEndpoint({
    method: 'POST',
    path: '/dev-mocks/evals/runs',
    summary: '[mock] Start an evaluation run',
    response: mockEvalRun,
    status: 201,
  }),
  usage: defineEndpoint({
    method: 'GET',
    path: '/dev-mocks/usage',
    summary: '[mock] Usage and costs this month',
    response: z.object({
      questions: z.number().int(),
      tokens: z.number().int(),
      costUsd: z.number(),
      monthlyLimitUsd: z.number(),
    }),
  }),
  deleteWorkspace: defineEndpoint({
    method: 'DELETE',
    path: '/dev-mocks/workspace',
    summary: '[mock] Delete the workspace (nothing is deleted)',
    response: z.object({ wouldDelete: z.string() }),
  }),
} satisfies Record<string, EndpointDefinition>;

export type DevMockName = keyof typeof devMocks;

/** Which capability each mock endpoint exercises (and so which minimum role it requires). */
export const devMockCapabilities: Record<DevMockName, Capability> = {
  listDocuments: 'documents.read',
  uploadDocument: 'documents.upload',
  deleteDocument: 'documents.delete',
  ask: 'ask',
  search: 'search',
  inviteMember: 'members.invite',
  createGroup: 'groups.manage',
  listEvalRuns: 'evals.run',
  startEvalRun: 'evals.run',
  usage: 'usage.view',
  deleteWorkspace: 'workspace.delete',
};
