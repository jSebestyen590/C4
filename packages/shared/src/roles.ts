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
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Extra permissions of a Cognito group, on top of those of the member's status. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ['users:manage'],
};

/** What a member may do, derived from their status (maintained by admins in the member profile). */
export const STATUS_PERMISSIONS: Record<MitgliedStatus, readonly Permission[]> = {
  anwaerter: ['content:read', 'mitglieder:lesen', 'profil:bearbeiten'],
  mitglied: ['content:read', 'mitglieder:lesen', 'profil:bearbeiten'],
  em: ['content:read', 'mitglieder:lesen', 'profil:bearbeiten'],
};

/** Effective permissions: those of the member's status plus those of their Cognito groups. */
export function permissionsFor(groups: readonly string[], status: MitgliedStatus): Permission[] {
  const result = new Set<Permission>(STATUS_PERMISSIONS[status]);
  for (const group of groups) {
    ROLE_PERMISSIONS[group as Role]?.forEach((p) => result.add(p));
  }
  return [...result];
}

export function hasPermission(
  groups: readonly string[],
  status: MitgliedStatus,
  permission: Permission,
): boolean {
  return permissionsFor(groups, status).includes(permission);
}
