import { z } from 'zod';
import { roleSchema } from './roles';
import { ANREDEN } from './anrede';
import { MITGLIED_STATI } from './status';

export const anredeSchema = z.enum(ANREDEN);

export const meSchema = z.object({
  sub: z.string(),
  /** How the caller wants to be addressed; neutral until they chose. */
  anrede: anredeSchema,
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
  /** Cognito sub; the key of the member row. */
  sub: z.string().optional(),
  vorname: z.string().optional(),
  nachname: z.string().optional(),
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

const pflichtText = (feld: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Bitte gib ${feld} ein.`)
    .max(max, `${feld[0]?.toUpperCase()}${feld.slice(1)} darf höchstens ${max} Zeichen lang sein.`);

const optionalerText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen erlaubt.`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);

export const vornameSchema = pflichtText('deinen Vornamen', 100);
export const nachnameSchema = pflichtText('deinen Nachnamen', 100);

export const mitgliedStatusSchema = z.enum(MITGLIED_STATI);

export const setMitgliedStatusSchema = z.object({ status: mitgliedStatusSchema });
export type SetMitgliedStatusInput = z.infer<typeof setMitgliedStatusSchema>;

export const createUserSchema = z.object({
  email: z.email(),
  groups: z.array(roleSchema).default([]),
  vorname: z.string().trim().max(100).optional(),
  nachname: z.string().trim().max(100).optional(),
  /** Category of the new member; every invited user gets a member row right away. */
  status: mitgliedStatusSchema.default('anwaerter'),
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

/** Members edit these fields themselves; everything except the names is optional. */
export const mitgliedAktualisierenSchema = z.object({
  vorname: vornameSchema,
  nachname: nachnameSchema,
  anrede: anredeSchema.default('neutral'),
  adresse: optionalerText(500),
  telefon: optionalerText(50),
  ueberMich: optionalerText(2000),
  /** Object key returned by POST /api/me/profilbild; null removes the picture. */
  profilbildKey: z.string().max(300).nullable().default(null),
});
export type MitgliedAktualisieren = z.input<typeof mitgliedAktualisierenSchema>;

export const emailAendernSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});
export type EmailAendernInput = z.infer<typeof emailAendernSchema>;

export const emailBestaetigenSchema = z.object({ code: z.string().trim().min(1).max(20) });
export type EmailBestaetigenInput = z.infer<typeof emailBestaetigenSchema>;

export const mitgliedSchema = z.object({
  sub: z.string(),
  vorname: z.string(),
  nachname: z.string(),
  anrede: anredeSchema,
  /** Login name from Cognito (preferred_username); null until the member chose one. */
  username: z.string().nullable(),
  status: mitgliedStatusSchema,
  email: z.string().nullable(),
  /** False while the member has not finished the first login (no password set yet). */
  aktiviert: z.boolean(),
  adresse: z.string().nullable(),
  telefon: z.string().nullable(),
  ueberMich: z.string().nullable(),
  profilbildKey: z.string().nullable(),
  /** Short-lived presigned URL of the small picture (256 px), used everywhere by default. */
  profilbildUrl: z.string().nullable(),
  /** Short-lived presigned URL of the large picture (up to 512 px), shown when opened. */
  profilbildGrossUrl: z.string().nullable(),
  /** Roles of the member; only sent to administrators. */
  rollen: z.array(z.string()).optional(),
});
export type Mitglied = z.infer<typeof mitgliedSchema>;

export const PROFILBILD_TYPEN = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** The large picture keeps the full resolution of the chosen area, so it can be big. */
export const PROFILBILD_MAX_BYTES = 20 * 1024 * 1024;
export const PROFILBILD_KLEIN_MAX_BYTES = 1024 * 1024;

export const profilbildAnfrageSchema = z.object({
  /** Type of the large picture: PNG for PNG sources, JPEG otherwise. */
  contentType: z.enum(PROFILBILD_TYPEN),
  groesse: z
    .number()
    .int()
    .positive()
    .max(PROFILBILD_MAX_BYTES, 'Das Bild darf höchstens 20 MB groß sein.'),
  /** Size of the small variant: always a JPEG of at most 256 px. */
  kleinGroesse: z.number().int().positive().max(PROFILBILD_KLEIN_MAX_BYTES),
});
export type ProfilbildAnfrage = z.infer<typeof profilbildAnfrageSchema>;

export const profilbildUploadSchema = z.object({
  uploadUrl: z.string(),
  /** Presigned PUT for the small variant. */
  kleinUploadUrl: z.string(),
  /** Key of the large variant; the small one is derived from it. */
  key: z.string(),
});
export type ProfilbildUpload = z.infer<typeof profilbildUploadSchema>;
