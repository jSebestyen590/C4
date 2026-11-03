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
  it('every status may read and book Waren, but only extra permissions manage them', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission([], status, 'waren:lesen')).toBe(true);
      expect(hasPermission([], status, 'bestand:buchen')).toBe(true);
      expect(hasPermission([], status, 'waren:verwalten')).toBe(false);
      expect(hasPermission([], status, 'waren:verwalten', ['waren:verwalten'])).toBe(true);
      expect(hasPermission(['admin'], status, 'waren:verwalten')).toBe(true);
    }
  });
  it('every status may read and rearrange the Inventar, but only extra permissions manage it', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission([], status, 'inventar:lesen')).toBe(true);
      expect(hasPermission([], status, 'inventar:umraeumen')).toBe(true);
      expect(hasPermission([], status, 'inventar:verwalten')).toBe(false);
      expect(hasPermission([], status, 'inventar:verwalten', ['inventar:verwalten'])).toBe(true);
      expect(hasPermission(['admin'], status, 'inventar:verwalten')).toBe(true);
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
  it('every status may read the Kalender, but only extra permissions manage or set it up', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission([], status, 'kalender:lesen')).toBe(true);
      for (const recht of ['events:verwalten', 'kalender:einrichten'] as const) {
        expect(hasPermission([], status, recht)).toBe(false);
        expect(hasPermission([], status, recht, [recht])).toBe(true);
        expect(hasPermission(['admin'], status, recht)).toBe(true);
      }
    }
  });
  it('every status may see and hand over keys, but only extra permissions manage them', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission([], status, 'schluessel:lesen')).toBe(true);
      expect(hasPermission([], status, 'schluessel:verwalten')).toBe(false);
      expect(hasPermission([], status, 'schluessel:verwalten', ['schluessel:verwalten'])).toBe(
        true,
      );
      expect(hasPermission(['admin'], status, 'schluessel:verwalten')).toBe(true);
    }
  });
  it('extern has the same permissions as anwaerter, from its own list', () => {
    expect(STATUS_PERMISSIONS.extern).toEqual(STATUS_PERMISSIONS.anwaerter);
    expect(STATUS_PERMISSIONS.extern).not.toBe(STATUS_PERMISSIONS.anwaerter);
    expect(hasPermission([], 'extern', 'kalender:lesen')).toBe(true);
    expect(hasPermission([], 'extern', 'events:verwalten')).toBe(false);
  });
  it('admins keep the permissions of their status', () => {
    expect(permissionsFor(['admin'], 'em')).toEqual(
      expect.arrayContaining([...STATUS_PERMISSIONS.em, 'users:manage']),
    );
  });
  it('unknown groups grant nothing beyond the status', () => {
    expect(permissionsFor(['whatever'], 'anwaerter')).toEqual([...STATUS_PERMISSIONS.anwaerter]);
  });
  it('every status may run polls, but only extra permissions manage all of them', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission([], status, 'umfragen:lesen')).toBe(true);
      expect(hasPermission([], status, 'umfragen:verwalten')).toBe(false);
      expect(hasPermission([], status, 'umfragen:verwalten', ['umfragen:verwalten'])).toBe(true);
      expect(hasPermission(['admin'], status, 'umfragen:verwalten')).toBe(true);
    }
  });
  it('every status may see Bilder and create folders', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission([], status, 'bilder:lesen')).toBe(true);
    }
  });
  it('every status may read Protokolle, but only extra permissions write them', () => {
    for (const status of MITGLIED_STATI) {
      expect(hasPermission([], status, 'protokolle:lesen')).toBe(true);
      expect(hasPermission([], status, 'protokolle:schreiben')).toBe(false);
      expect(hasPermission([], status, 'protokolle:schreiben', ['protokolle:schreiben'])).toBe(
        true,
      );
      expect(hasPermission(['admin'], status, 'protokolle:schreiben')).toBe(true);
    }
  });
});
