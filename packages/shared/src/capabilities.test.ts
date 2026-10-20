import { describe, expect, it } from 'vitest';
import { can, capabilities } from './capabilities.js';
import { devMockCapabilities, devMocks } from './contracts/dev-mocks.js';

describe('capabilities', () => {
  it('denies everything without a role', () => {
    expect(can(null, 'documents.read')).toBe(false);
    expect(can(undefined, 'ask')).toBe(false);
  });

  it('applies the role ranking', () => {
    expect(can('viewer', 'documents.read')).toBe(true);
    expect(can('viewer', 'documents.upload')).toBe(false);
    expect(can('editor', 'documents.upload')).toBe(true);
    expect(can('admin', 'workspace.delete')).toBe(false);
    expect(can('owner', 'workspace.delete')).toBe(true);
  });

  it('maps every dev mock to a known capability', () => {
    expect(Object.keys(devMockCapabilities).sort()).toEqual(Object.keys(devMocks).sort());
    for (const capability of Object.values(devMockCapabilities)) {
      expect(capabilities).toHaveProperty([capability]);
    }
  });
});
