import { z } from 'zod';
import { roleSchema } from './roles';

export const meSchema = z.object({
  sub: z.string(),
  /** Login name chosen by the user; undefined until they picked one. */
  preferredUsername: z.string().optional(),
  groups: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type Me = z.infer<typeof meSchema>;

export const adminUserSchema = z.object({
  /** Internal Cognito username (UUID); the key for admin operations. */
  username: z.string(),
  preferredUsername: z.string().optional(),
  email: z.string().optional(),
  status: z.string(),
  enabled: z.boolean(),
  groups: z.array(z.string()),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** Login name (Cognito preferred_username alias): must not look like an email address. */
export const usernameSchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]{3,64}$/, 'Verwende 3–64 Zeichen: Buchstaben, Ziffern, . _ -');

export const setUsernameSchema = z.object({ username: usernameSchema });
export type SetUsernameInput = z.infer<typeof setUsernameSchema>;

export const createUserSchema = z.object({
  email: z.email(),
  groups: z.array(roleSchema).default([]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const setGroupsSchema = z.object({ groups: z.array(roleSchema) });
export type SetGroupsInput = z.infer<typeof setGroupsSchema>;

export const healthSchema = z.object({ status: z.literal('ok'), db: z.enum(['ok', 'error']) });
export type Health = z.infer<typeof healthSchema>;

export const appConfigSchema = z.object({
  region: z.string(),
  userPoolId: z.string(),
  clientId: z.string(),
  cognitoDomain: z.string(),
});
export type AppConfig = z.infer<typeof appConfigSchema>;
