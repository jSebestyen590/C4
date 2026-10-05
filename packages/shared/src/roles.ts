import { z } from 'zod';

export const ROLES = ['admin', 'reader'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const PERMISSIONS = ['users:manage', 'content:read'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ['users:manage', 'content:read'],
  reader: ['content:read'],
};

export function permissionsFor(groups: readonly string[]): Permission[] {
  const result = new Set<Permission>();
  for (const group of groups) {
    const perms = ROLE_PERMISSIONS[group as Role];
    perms?.forEach((p) => result.add(p));
  }
  return [...result];
}

export function hasPermission(groups: readonly string[], permission: Permission): boolean {
  return permissionsFor(groups).includes(permission);
}
