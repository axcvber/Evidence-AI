import type { EndpointResponse, ValidatedInput } from '@evidence/shared';
import { capabilities, groupEndpoints } from '@evidence/shared';
import { Controller, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { Roles } from '../auth/roles.decorator.js';
import { Endpoint, Input } from '../contracts/endpoint.decorator.js';
import { MissingTenantContextError } from '../tenancy/tenant-db.js';
import { GroupsService } from './groups.service.js';

type Response<K extends keyof typeof groupEndpoints> = EndpointResponse<(typeof groupEndpoints)[K]>;
type Input<K extends keyof typeof groupEndpoints> = ValidatedInput<(typeof groupEndpoints)[K]>;

const MANAGE = capabilities['groups.manage'].minRole;

function tenantId(request: AuthenticatedRequest): string {
  const id = request.tenantContext?.tenantId;
  if (!id) throw new MissingTenantContextError();
  return id;
}

/** Any member can see groups; admins and owners manage them (the `groups.manage` capability). */
@ApiTags('groups')
@ApiCookieAuth()
@Roles('viewer')
@Controller()
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Endpoint(groupEndpoints.list)
  list(@Input() { query }: Input<'list'>): Promise<Response<'list'>> {
    return this.groups.list(query.limit, query.cursor);
  }

  @Endpoint(groupEndpoints.create)
  @Roles(MANAGE)
  create(
    @Req() request: AuthenticatedRequest,
    @Input() { body }: Input<'create'>,
  ): Promise<Response<'create'>> {
    return this.groups.create(tenantId(request), body);
  }

  @Endpoint(groupEndpoints.get)
  get(@Input() { params }: Input<'get'>): Promise<Response<'get'>> {
    return this.groups.get(params.groupId);
  }

  @Endpoint(groupEndpoints.update)
  @Roles(MANAGE)
  update(@Input() { params, body }: Input<'update'>): Promise<Response<'update'>> {
    return this.groups.update(params.groupId, body);
  }

  @Endpoint(groupEndpoints.delete)
  @Roles(MANAGE)
  async delete(@Input() { params }: Input<'delete'>): Promise<Response<'delete'>> {
    await this.groups.delete(params.groupId);
    return { deleted: true };
  }

  @Endpoint(groupEndpoints.listMembers)
  listMembers(@Input() { params, query }: Input<'listMembers'>): Promise<Response<'listMembers'>> {
    return this.groups.listMembers(params.groupId, query.limit, query.cursor);
  }

  @Endpoint(groupEndpoints.addMember)
  @Roles(MANAGE)
  addMember(
    @Req() request: AuthenticatedRequest,
    @Input() { params }: Input<'addMember'>,
  ): Promise<Response<'addMember'>> {
    return this.groups.addMember(tenantId(request), params.groupId, params.userId);
  }

  @Endpoint(groupEndpoints.removeMember)
  @Roles(MANAGE)
  async removeMember(
    @Input() { params }: Input<'removeMember'>,
  ): Promise<Response<'removeMember'>> {
    await this.groups.removeMember(params.groupId, params.userId);
    return { removed: true };
  }
}
