import { z } from 'zod';
import { cursorPageSchema, cursorQuerySchema } from './common.js';
import { defineEndpoint } from './define.js';

// Groups collect workspace members so documents can be shared with many people at once
// (document ACLs arrive in phase 2). Any member can see them; admins and owners manage them.

const groupName = z.string().trim().min(1, 'Enter a name').max(80);
const groupDescription = z.string().trim().max(500);

export const groupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const groupMemberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  addedAt: z.iso.datetime(),
});

export type Group = z.output<typeof groupSchema>;
export type GroupMember = z.output<typeof groupMemberSchema>;

const groupParams = z.object({ groupId: z.uuid() });
const groupMemberParams = z.object({ groupId: z.uuid(), userId: z.uuid() });

export const groupEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/groups',
    summary: 'List the groups in the active workspace, by name',
    query: cursorQuerySchema,
    response: cursorPageSchema(groupSchema),
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/groups',
    summary: 'Create a group',
    body: z.object({ name: groupName, description: groupDescription.optional() }),
    response: groupSchema,
    status: 201,
  }),
  get: defineEndpoint({
    method: 'GET',
    path: '/groups/:groupId',
    summary: 'Get a group',
    params: groupParams,
    response: groupSchema,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/groups/:groupId',
    summary: 'Rename a group or change its description',
    params: groupParams,
    body: z
      .object({ name: groupName.optional(), description: groupDescription.nullable().optional() })
      .refine((body) => body.name !== undefined || body.description !== undefined, {
        message: 'Change the name or the description',
      }),
    response: groupSchema,
  }),
  delete: defineEndpoint({
    method: 'DELETE',
    path: '/groups/:groupId',
    summary: 'Delete a group (its members stay in the workspace)',
    params: groupParams,
    response: z.object({ deleted: z.literal(true) }),
  }),
  listMembers: defineEndpoint({
    method: 'GET',
    path: '/groups/:groupId/members',
    summary: "List a group's members, by name",
    params: groupParams,
    query: cursorQuerySchema,
    response: cursorPageSchema(groupMemberSchema),
  }),
  addMember: defineEndpoint({
    method: 'PUT',
    path: '/groups/:groupId/members/:userId',
    summary: 'Add a workspace member to a group (no-op if already in it)',
    params: groupMemberParams,
    response: groupMemberSchema,
  }),
  removeMember: defineEndpoint({
    method: 'DELETE',
    path: '/groups/:groupId/members/:userId',
    summary: 'Remove someone from a group',
    params: groupMemberParams,
    response: z.object({ removed: z.literal(true) }),
  }),
};
