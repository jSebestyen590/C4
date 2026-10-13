import { describe, expect, it } from 'vitest';
import { hasPermission, permissionsFor, STATUS_PERMISSIONS } from './roles';
import { MITGLIED_STATI } from './status';

describe('permissions', () => {
  it('only the admin group may manage users, whatever the status', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission(['admin'], status, 'users:manage')).toBe(true);
      expect(hasPermission([], status, 'users:manage')).toBe(false);
    }
  });
  it('every status may read members and edit its profile', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission([], status, 'mitglieder:lesen')).toBe(true);
      expect(hasPermission([], status, 'profil:bearbeiten')).toBe(true);
    }
  });
  it('every status may read Posten, but only extra permissions allow editing them', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission([], status, 'posten:lesen')).toBe(true);
      expect(hasPermission([], status, 'posten:bearbeiten')).toBe(false);
      expect(hasPermission([], status, 'posten:bearbeiten', ['posten:bearbeiten'])).toBe(true);
    }
  });
  it('admins may always edit Posten, so the first Posten can be set up', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission(['admin'], status, 'posten:bearbeiten')).toBe(true);
    }
  });
  it('admins keep the permissions of their status', () => {
    expect(permissionsFor(['admin'], 'em')).toEqual(
      expect.arrayContaining([...STATUS_PERMISSIONS.em, 'users:manage']),
    );
  });
  it('unknown groups grant nothing beyond the status', () => {
    expect(permissionsFor(['whatever'], 'anwaerter')).toEqual([...STATUS_PERMISSIONS.anwaerter]);
  });
});
