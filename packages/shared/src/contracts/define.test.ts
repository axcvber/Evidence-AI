import { describe, expect, it } from 'vitest';
import { buildPath } from './define.js';

describe('buildPath', () => {
  it('fills and encodes path parameters', () => {
    expect(buildPath('/groups/:groupId/members/:userId', { groupId: 'a b', userId: 'x/y' })).toBe(
      '/groups/a%20b/members/x%2Fy',
    );
  });

  it('refuses to build a path with a missing parameter', () => {
    expect(() => buildPath('/groups/:groupId', {})).toThrow(/groupId/);
  });
});
