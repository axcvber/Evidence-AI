'use client';

import { groupEndpoints } from '@evidence/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { browserApi } from '@/lib/api/browser-api';

const PAGE_SIZE = 25;

// Keys start with the workspace ID so another workspace's cached groups never show up.
function useGroupKeys() {
  const id = useWorkspace().workspace.id;
  return {
    all: ['workspace', id, 'groups'] as const,
    members: (groupId: string) => ['workspace', id, 'groups', groupId, 'members'] as const,
  };
}

export function useGroups() {
  const keys = useGroupKeys();
  return useInfiniteQuery({
    queryKey: keys.all,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      browserApi(groupEndpoints.list, { query: { limit: PAGE_SIZE, cursor: pageParam } }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useGroupMembers(groupId: string) {
  const keys = useGroupKeys();
  return useInfiniteQuery({
    queryKey: keys.members(groupId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      browserApi(groupEndpoints.listMembers, {
        params: { groupId },
        query: { limit: PAGE_SIZE, cursor: pageParam },
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** Any change to groups refreshes the list (member counts) and that group's members. */
function useInvalidate() {
  const queryClient = useQueryClient();
  const keys = useGroupKeys();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useCreateGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      browserApi(groupEndpoints.create, { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateGroup(groupId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { name?: string; description?: string | null }) =>
      browserApi(groupEndpoints.update, { params: { groupId }, body }),
    onSuccess: invalidate,
  });
}

export function useDeleteGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (groupId: string) => browserApi(groupEndpoints.delete, { params: { groupId } }),
    onSuccess: invalidate,
  });
}

export function useAddGroupMember(groupId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (userId: string) =>
      browserApi(groupEndpoints.addMember, { params: { groupId, userId } }),
    onSuccess: invalidate,
  });
}

export function useRemoveGroupMember(groupId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (userId: string) =>
      browserApi(groupEndpoints.removeMember, { params: { groupId, userId } }),
    onSuccess: invalidate,
  });
}
