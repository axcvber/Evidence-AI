'use client';

import { devMocks } from '@evidence/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { browserApi } from '@/lib/api/browser-api';

// Query keys start with the workspace ID so switching workspaces never shows cached data
// from another tenant.
function useKey(...parts: string[]): string[] {
  return ['workspace', useWorkspace().workspace.id, 'dev-mocks', ...parts];
}

export function useMockDocuments() {
  return useQuery({
    queryKey: useKey('documents'),
    queryFn: () => browserApi(devMocks.listDocuments, { query: {} }),
  });
}

export function useUploadMockDocument() {
  return useMutation({
    mutationFn: (title: string) => browserApi(devMocks.uploadDocument, { body: { title } }),
  });
}

export function useDeleteMockDocument() {
  return useMutation({
    mutationFn: (documentId: string) =>
      browserApi(devMocks.deleteDocument, { params: { documentId } }),
  });
}

export function useMockAsk() {
  return useMutation({
    mutationFn: (question: string) => browserApi(devMocks.ask, { body: { question } }),
  });
}

export function useMockSearch(q: string) {
  return useQuery({
    queryKey: useKey('search', q),
    queryFn: () => browserApi(devMocks.search, { query: { q } }),
    enabled: q.trim().length > 0,
  });
}

export function useMockEvalRuns(enabled: boolean) {
  return useQuery({
    queryKey: useKey('evals'),
    queryFn: () => browserApi(devMocks.listEvalRuns, {}),
    enabled,
  });
}

export function useStartMockEvalRun() {
  return useMutation({ mutationFn: () => browserApi(devMocks.startEvalRun, {}) });
}
