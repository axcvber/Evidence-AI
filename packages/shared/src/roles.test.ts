import { describe, expect, it } from 'vitest';
import { hasAtLeastRole, WorkspaceRole, workspaceRoleNames } from './roles.js';

// Highest first, matching the ranking.
const ranked: WorkspaceRole[] = ['owner', 'admin', 'editor', 'viewer'];

describe('hasAtLeastRole', () => {
  it('covers every role', () => {
    expect([...ranked].sort()).toEqual([...workspaceRoleNames].sort());
  });

  it.each(
    ranked.flatMap((role, i) => ranked.map((minimum, j) => [role, minimum, i <= j] as const)),
  )('%s meets minimum %s: %s', (role, minimum, expected) => {
    expect(hasAtLeastRole(role, minimum)).toBe(expected);
  });
});
