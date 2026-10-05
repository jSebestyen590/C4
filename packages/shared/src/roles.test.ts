import { describe, expect, it } from 'vitest';
import { hasPermission, permissionsFor } from './roles';

describe('roles', () => {
  it('admin may manage users', () => {
    expect(hasPermission(['admin'], 'users:manage')).toBe(true);
  });
  it('reader may not manage users', () => {
    expect(hasPermission(['reader'], 'users:manage')).toBe(false);
  });
  it('unknown groups grant nothing', () => {
    expect(permissionsFor(['whatever'])).toEqual([]);
  });
});
