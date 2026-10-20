import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/domain-error.js';

/** Also returned for groups in other workspaces: RLS hides them, and we don't say they exist. */
export class GroupNotFoundError extends DomainError {
  override readonly name = 'GroupNotFoundError';
  readonly status = HttpStatus.NOT_FOUND;
  readonly code = 'GROUP_NOT_FOUND';

  constructor() {
    super('Group not found');
  }
}

export class GroupNameTakenError extends DomainError {
  override readonly name = 'GroupNameTakenError';
  readonly status = HttpStatus.CONFLICT;
  readonly code = 'GROUP_NAME_TAKEN';

  constructor() {
    super('A group with this name already exists in the workspace');
  }
}

export class NotWorkspaceMemberError extends DomainError {
  override readonly name = 'NotWorkspaceMemberError';
  readonly status = HttpStatus.BAD_REQUEST;
  readonly code = 'NOT_A_WORKSPACE_MEMBER';

  constructor() {
    super('Only members of this workspace can be added to its groups');
  }
}

export class GroupMemberNotFoundError extends DomainError {
  override readonly name = 'GroupMemberNotFoundError';
  readonly status = HttpStatus.NOT_FOUND;
  readonly code = 'GROUP_MEMBER_NOT_FOUND';

  constructor() {
    super('That person is not in this group');
  }
}
