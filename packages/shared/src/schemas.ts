import { z } from 'zod';
import { POSTEN_RECHTE, roleSchema } from './roles';
import { ANREDEN } from './anrede';
import { heuteBerlin } from './datum';
import { KONTAKTKANAELE } from './kontakt';
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
  .regex(/^[A-Za-z0-9._-]{3,64}$/, 'Verwende 3–64 Zeichen: Buchstaben, Ziffern, . _ -')
  // Member URLs take a username or a sub (UUID); a username must never be mistaken for a sub.
  .refine((v) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
    message: 'Dieser Benutzername ist nicht erlaubt.',
  });

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

export const setMitgliedAktivSchema = z.object({ aktiv: z.boolean() });
export type SetMitgliedAktivInput = z.infer<typeof setMitgliedAktivSchema>;

/** What an admin still has to sort out before deactivating a member (nothing is changed automatically). */
export interface DeaktivierenVorschau {
  /** Future Dienste (from today, Berlin time). */
  dienste: { eventId: string; titel: string; datum: string }[];
  /** Posten the member currently holds. */
  posten: { id: string; name: string }[];
  /** Keys the member currently holds. */
  schluessel: { id: string; name: string }[];
}

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
  kontaktkanaele: z.array(z.enum(KONTAKTKANAELE)).default([]),
  discordName: optionalerText(64),
  adresse: optionalerText(500),
  telefon: optionalerText(50),
  ueberMich: optionalerText(2000),
  /** Object key returned by POST /api/me/profilbild; null removes the picture. */
  profilbildKey: z.string().max(300).nullable().default(null),
  /** Date of birth `YYYY-MM-DD`; optional, not in the future, not before 1900. */
  geburtsdatum: z.iso
    .date({ error: 'Bitte gib ein gültiges Datum an.' })
    .refine((d) => d >= '1900-01-01', 'Das Geburtsdatum darf nicht vor 1900 liegen.')
    .refine((d) => d <= heuteBerlin(), 'Das Geburtsdatum darf nicht in der Zukunft liegen.')
    .nullable()
    .default(null),
  /** Whether other members see the birthday in the calendar (and get notified about it). */
  geburtstagImKalender: z.boolean().default(true),
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
  /** Channels the member can best be reached on, in a fixed order. */
  kontaktkanaele: z.array(z.enum(KONTAKTKANAELE)),
  /** Discord username; Discord cannot be linked by name, so it is only displayed. */
  discordName: z.string().nullable(),
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
  /** `YYYY-MM-DD`. Other members only get it when the member shows the birthday in the calendar. */
  geburtsdatum: z.string().nullable(),
  /** Whether the birthday is shown in the calendar to other members. */
  geburtstagImKalender: z.boolean(),
  /** True when an admin deactivated the account (no login, hidden from lists and circles). */
  deaktiviert: z.boolean(),
  /** Roles of the member; only sent to administrators. */
  rollen: z.array(z.string()).optional(),
  /** Posten the member currently holds (not archived, started, not ended). */
  posten: z.array(z.object({ id: z.string(), name: z.string(), bezeichnung: z.string() })),
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

export const datumSchema = z.iso.date();

/** The three forms of the holder's title belong together: all set or none. */
export const postenAktualisierenSchema = z
  .object({
    name: pflichtText('einen Namen', 100),
    beschreibung: optionalerText(2000),
    bezeichnungMaennlich: optionalerText(100),
    bezeichnungWeiblich: optionalerText(100),
    bezeichnungNeutral: optionalerText(100),
  })
  .refine(
    (p) => {
      const gesetzt = [p.bezeichnungMaennlich, p.bezeichnungWeiblich, p.bezeichnungNeutral].filter(
        Boolean,
      );
      return gesetzt.length === 0 || gesetzt.length === 3;
    },
    { message: 'Bitte gib die Bezeichnung in allen drei Formen an.', path: ['bezeichnungNeutral'] },
  );
export type PostenAktualisieren = z.input<typeof postenAktualisierenSchema>;

export const postenArchivierenSchema = z.object({ archiviert: z.boolean() });

export const postenRechteSetzenSchema = z.object({ rechte: z.array(z.enum(POSTEN_RECHTE)) });

export const besetzungSchema = z.object({
  id: z.string(),
  mitgliedSub: z.string(),
  /** Display data of the member, so lists need no second request. */
  mitglied: z.object({
    username: z.string().nullable(),
    vorname: z.string(),
    nachname: z.string(),
    status: mitgliedStatusSchema,
    anrede: anredeSchema,
  }),
  start: datumSchema,
  ende: datumSchema.nullable(),
  /** True when today lies within start and ende. */
  aktuell: z.boolean(),
});
export type Besetzung = z.infer<typeof besetzungSchema>;

const besetzungFelder = {
  mitgliedSub: z.string().min(1),
  start: datumSchema,
  ende: datumSchema.nullable().default(null),
};

const besetzungPruefen = (b: { start: string; ende: string | null }, ctx: z.RefinementCtx) => {
  if (b.ende !== null && b.ende < b.start) {
    ctx.addIssue({
      code: 'custom',
      message: 'Das Ende darf nicht vor dem Start liegen.',
      path: ['ende'],
    });
  }
};

export const besetzungEingabeSchema = z.object(besetzungFelder).superRefine(besetzungPruefen);
export type BesetzungEingabe = z.input<typeof besetzungEingabeSchema>;

/**
 * A new Besetzung. `ablosung` lists open-ended Besetzungen of the same Posten that the new one takes
 * over: they end the day before `start`.
 */
export const besetzungAnlegenSchema = z
  .object({ ...besetzungFelder, ablosung: z.array(z.string()).default([]) })
  .superRefine(besetzungPruefen);
export type BesetzungAnlegen = z.input<typeof besetzungAnlegenSchema>;

export const postenSchema = z.object({
  id: z.string(),
  name: z.string(),
  beschreibung: z.string().nullable(),
  bezeichnungMaennlich: z.string().nullable(),
  bezeichnungWeiblich: z.string().nullable(),
  bezeichnungNeutral: z.string().nullable(),
  archiviert: z.boolean(),
  rechte: z.array(z.enum(POSTEN_RECHTE)),
  /** Current holders first, then by start date (newest first). */
  besetzungen: z.array(besetzungSchema),
});
export type Posten = z.infer<typeof postenSchema>;
