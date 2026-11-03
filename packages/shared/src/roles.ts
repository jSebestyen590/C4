import { z } from 'zod';
import type { MitgliedStatus } from './status';

/** Cognito groups. Only the administrator lives there; everything else follows the member status. */
export const ROLES = ['admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const PERMISSIONS = [
  'users:manage',
  'content:read',
  'mitglieder:lesen',
  'profil:bearbeiten',
  'posten:lesen',
  'posten:bearbeiten',
  'waren:lesen',
  'bestand:buchen',
  'waren:verwalten',
  'inventar:lesen',
  'inventar:umraeumen',
  'inventar:verwalten',
  'kalender:lesen',
  'events:verwalten',
  'kalender:einrichten',
  'schluessel:lesen',
  'schluessel:verwalten',
  'umfragen:lesen',
  'umfragen:verwalten',
  'trichter:lesen',
  'trichter:verwalten',
  'bilder:lesen',
  'protokolle:lesen',
  'protokolle:schreiben',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permissions an admin may attach to a Posten; whoever currently holds the Posten gets them. */
export const POSTEN_RECHTE = [
  'users:manage',
  'posten:bearbeiten',
  'waren:verwalten',
  'inventar:verwalten',
  'events:verwalten',
  'kalender:einrichten',
  'schluessel:verwalten',
  'umfragen:verwalten',
  'trichter:verwalten',
  'protokolle:schreiben',
] as const satisfies readonly Permission[];
export type PostenRecht = (typeof POSTEN_RECHTE)[number];

/** Extra permissions of a Cognito group, on top of those of the member's status. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [
    'users:manage',
    'posten:bearbeiten',
    'waren:verwalten',
    'inventar:verwalten',
    'events:verwalten',
    'kalender:einrichten',
    'schluessel:verwalten',
    'umfragen:verwalten',
    'trichter:verwalten',
    'protokolle:schreiben',
  ],
};

/** What a member may do, derived from their status (maintained by admins in the member profile). */
export const STATUS_PERMISSIONS: Record<MitgliedStatus, readonly Permission[]> = {
  anwaerter: [
    'content:read',
    'mitglieder:lesen',
    'profil:bearbeiten',
    'posten:lesen',
    'waren:lesen',
    'bestand:buchen',
    'inventar:lesen',
    'inventar:umraeumen',
    'kalender:lesen',
    'schluessel:lesen',
    'umfragen:lesen',
    'trichter:lesen',
    'bilder:lesen',
    'protokolle:lesen',
  ],
  extern: [
    'content:read',
    'mitglieder:lesen',
    'profil:bearbeiten',
    'posten:lesen',
    'waren:lesen',
    'bestand:buchen',
    'inventar:lesen',
    'inventar:umraeumen',
    'kalender:lesen',
    'schluessel:lesen',
    'umfragen:lesen',
    'trichter:lesen',
    'bilder:lesen',
    'protokolle:lesen',
  ],
  mitglied: [
    'content:read',
    'mitglieder:lesen',
    'profil:bearbeiten',
    'posten:lesen',
    'waren:lesen',
    'bestand:buchen',
    'inventar:lesen',
    'inventar:umraeumen',
    'kalender:lesen',
    'schluessel:lesen',
    'umfragen:lesen',
    'trichter:lesen',
    'bilder:lesen',
    'protokolle:lesen',
  ],
  em: [
    'content:read',
    'mitglieder:lesen',
    'profil:bearbeiten',
    'posten:lesen',
    'waren:lesen',
    'bestand:buchen',
    'inventar:lesen',
    'inventar:umraeumen',
    'kalender:lesen',
    'schluessel:lesen',
    'umfragen:lesen',
    'trichter:lesen',
    'bilder:lesen',
    'protokolle:lesen',
  ],
};

/**
 * Effective permissions: those of the member's status plus those of their Cognito groups plus
 * `extra` (the permissions of the Posten the member currently holds).
 */
export function permissionsFor(
  groups: readonly string[],
  status: MitgliedStatus,
  extra: readonly Permission[] = [],
): Permission[] {
  const result = new Set<Permission>([...STATUS_PERMISSIONS[status], ...extra]);
  for (const group of groups) {
    ROLE_PERMISSIONS[group as Role]?.forEach((p) => result.add(p));
  }
  return [...result];
}

export function hasPermission(
  groups: readonly string[],
  status: MitgliedStatus,
  permission: Permission,
  extra: readonly Permission[] = [],
): boolean {
  return permissionsFor(groups, status, extra).includes(permission);
}
