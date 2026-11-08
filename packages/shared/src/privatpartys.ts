import { z } from 'zod';
import { beschreibung, eindeutig, name } from './bausteine';
import type { Anrede } from './anrede';
import { datumAnzeigen } from './datum';
import type { MitgliedStatus } from './status';
import { datumSchema } from './schemas';

// Private party requests (see docs/privatpartys.md): external people rent the club; requests are
// managed by holders of `privatpartys:verwalten`.

export const PRIVATPARTY_STATI = ['offen', 'zugesagt', 'abgesagt'] as const;
export const privatpartyStatusSchema = z.enum(PRIVATPARTY_STATI);
export type PrivatpartyStatus = z.infer<typeof privatpartyStatusSchema>;

/** How much a wish date is wanted, best first. */
export const PRIVATPARTY_STUFEN = ['bevorzugt', 'moeglich', 'notfalls'] as const;
export const privatpartyStufeSchema = z.enum(PRIVATPARTY_STUFEN);
export type PrivatpartyStufe = z.infer<typeof privatpartyStufeSchema>;

/** German names; used in the options of the poll the API builds, the web app shows the same. */
export const PRIVATPARTY_STUFEN_NAMEN: Record<PrivatpartyStufe, string> = {
  bevorzugt: 'Bevorzugt',
  moeglich: 'Möglich',
  notfalls: 'Nur notfalls',
};

export const PRIVATPARTY_TERMINE_MAX = 20;
export const PRIVATPARTY_ANLASS_MAX = 100;
export const PRIVATPARTY_NOTIZEN_MAX = 4000;

const uhrzeitSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte gib eine Uhrzeit an (HH:MM).');

const kurzerText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen erlaubt.`)
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null);

export const privatpartyTerminSchema = z
  .object({
    /** Set for dates that already exist (editing); new ones have none. */
    id: z.string().min(1).optional(),
    datum: datumSchema,
    /** Berlin wall time; an end before the begin means the next day. */
    beginn: uhrzeitSchema,
    ende: uhrzeitSchema,
    stufe: privatpartyStufeSchema,
  })
  .refine((t) => t.beginn !== t.ende, {
    message: 'Beginn und Ende dürfen nicht gleich sein.',
    path: ['ende'],
  });
export type PrivatpartyTerminEingabe = z.input<typeof privatpartyTerminSchema>;

const termineSchema = z
  .array(privatpartyTerminSchema)
  .max(PRIVATPARTY_TERMINE_MAX, 'Zu viele Termine.')
  .superRefine((termine, ctx) => {
    if (!eindeutig(termine.map((t) => `${t.datum} ${t.beginn} ${t.ende}`))) {
      ctx.addIssue({ code: 'custom', message: 'Ein Termin ist doppelt.' });
    }
  });

/** Body of `POST` and `PUT /api/privatpartys`: the person and at least one wish date are required. */
export const privatpartyEingabeSchema = z.object({
  personId: z.string('Bitte wähle eine Person.').min(1, 'Bitte wähle eine Person.'),
  anlass: kurzerText(PRIVATPARTY_ANLASS_MAX),
  notizen: z
    .string()
    .trim()
    .max(PRIVATPARTY_NOTIZEN_MAX, `Höchstens ${PRIVATPARTY_NOTIZEN_MAX} Zeichen erlaubt.`)
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null),
  termine: termineSchema.refine((t) => t.length > 0, {
    message: 'Lege mindestens einen Termin an.',
  }),
});
export type PrivatpartyEingabe = z.input<typeof privatpartyEingabeSchema>;
export type PrivatpartyEingabeDaten = z.output<typeof privatpartyEingabeSchema>;

/** Body of `POST` and `PUT /api/privatpartys/personen`. */
export const privatpartyPersonEingabeSchema = z.object({
  name: name('einen Namen'),
  email: z
    .string()
    .trim()
    .max(200, 'Höchstens 200 Zeichen erlaubt.')
    .refine((v) => v === '' || z.email().safeParse(v).success, {
      message: 'Bitte gib eine gültige E-Mail-Adresse ein.',
    })
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null),
  kontakt: kurzerText(300),
  notizen: beschreibung,
});
export type PrivatpartyPersonEingabe = z.input<typeof privatpartyPersonEingabeSchema>;

/** Body of `POST /api/privatpartys/:id/umfrage`: a scheduling poll over all wish dates. */
export const privatpartyUmfrageSchema = z.object({
  vorlageId: z.string('Bitte wähle eine Vorlage.').min(1, 'Bitte wähle eine Vorlage.'),
  endetAm: datumSchema,
  /** Everybody has to vote (otherwise voting is optional for everybody). */
  pflicht: z.boolean(),
});
export type PrivatpartyUmfrageEingabe = z.infer<typeof privatpartyUmfrageSchema>;

/** Body of `POST /api/privatpartys/:id/zusage`. */
export const privatpartyZusageSchema = z.object({
  terminId: z.string('Bitte wähle einen Termin.').min(1, 'Bitte wähle einen Termin.'),
  vorlageId: z.string('Bitte wähle eine Vorlage.').min(1, 'Bitte wähle eine Vorlage.'),
});
export type PrivatpartyZusageEingabe = z.infer<typeof privatpartyZusageSchema>;

/** Body of `PUT /api/privatpartys/:id/status`; `zugesagt` needs the Termin and Vorlage like `/zusage`. */
export const privatpartyStatusEingabeSchema = z.object({
  status: privatpartyStatusSchema,
  terminId: z.string().min(1).nullish(),
  vorlageId: z.string().min(1).nullish(),
});
export type PrivatpartyStatusEingabe = z.infer<typeof privatpartyStatusEingabeSchema>;

export interface PrivatpartyTerminDto {
  id: string;
  datum: string;
  beginn: string;
  ende: string;
  stufe: PrivatpartyStufe;
}

export interface PrivatpartyPersonKurzDto {
  id: string;
  name: string;
}

export interface PrivatpartyListeDto {
  id: string;
  status: PrivatpartyStatus;
  anlass: string | null;
  person: PrivatpartyPersonKurzDto | null;
  /** Reply address of the last incoming mail. */
  mailAdresse: string | null;
  termine: PrivatpartyTerminDto[];
  /** The accepted wish date (status `zugesagt`). */
  terminId: string | null;
  /** The last message is an incoming one. */
  unbeantwortet: boolean;
  letzteNachrichtAm: string | null;
  angelegtAm: string;
}

export interface PrivatpartyUmfrageKurzDto {
  id: string;
  titel: string;
  laeuft: boolean;
}

export interface PrivatpartyEventKurzDto {
  id: string;
  titel: string;
  beginn: string;
}

/** The member who sent an outgoing mail (shown with `StatusName`). */
export interface PrivatpartySenderDto {
  sub: string;
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
  anrede: Anrede;
}

export interface PrivatpartyNachrichtDto {
  id: string;
  richtung: 'ein' | 'aus';
  /** Incoming: the sender (reply address); outgoing: the Party-Mail. */
  vonAdresse: string | null;
  vonName: string | null;
  anAdresse: string | null;
  betreff: string | null;
  text: string;
  /** File names only; attachments are not stored. */
  anhaenge: string[];
  zeitpunkt: string;
  /** Outgoing mails: the member who wrote it; null if unknown. */
  gesendetVon: PrivatpartySenderDto | null;
}

export interface PrivatpartyDetailDto extends PrivatpartyListeDto {
  notizen: string | null;
  /** Oldest first. */
  nachrichten: PrivatpartyNachrichtDto[];
  /** False without the Party-Mail secret: no replies possible. */
  mailEingerichtet: boolean;
  /** Where a reply goes: the reply address of the mails, else the person's email; null = none. */
  antwortAn: string | null;
  /** The poll built from the wish dates; null = none. */
  umfrage: PrivatpartyUmfrageKurzDto | null;
  /** The event of the accepted date; null = none (or deleted in the calendar). */
  event: PrivatpartyEventKurzDto | null;
  aktualisiertAm: string;
}

export interface PrivatpartyPersonDto {
  id: string;
  name: string;
  email: string | null;
  kontakt: string | null;
  notizen: string | null;
  anzahlPrivatpartys: number;
}

export interface PrivatpartyPersonDetailDto extends PrivatpartyPersonDto {
  privatpartys: PrivatpartyListeDto[];
}

/** Wish times as "19:00–02:00". */
export const privatpartyZeitText = (t: Pick<PrivatpartyTerminDto, 'beginn' | 'ende'>) =>
  `${t.beginn}–${t.ende}`;

/** Name of the poll option for a wish date; the API matches the chosen option back to the date by it. */
export const privatpartyOptionName = (t: Pick<PrivatpartyTerminDto, 'beginn' | 'ende' | 'stufe'>) =>
  `${privatpartyZeitText(t)} · ${PRIVATPARTY_STUFEN_NAMEN[t.stufe]}`;

/** Title of the poll built for a request. */
export const privatpartyUmfrageTitel = (anlass: string | null) =>
  anlass ? `Privatparty: ${anlass}`.slice(0, 200) : 'Privatparty';

/** "Sa, 12.12.2026, 19:00–02:00 (Bevorzugt)" without the weekday. */
export const privatpartyTerminText = (t: Omit<PrivatpartyTerminDto, 'id'>) =>
  `${datumAnzeigen(t.datum)}, ${privatpartyZeitText(t)} (${PRIVATPARTY_STUFEN_NAMEN[t.stufe]})`;

/** Body of `POST /api/privatpartys/:id/nachrichten`. */
export const privatpartyNachrichtSchema = z.object({
  text: z.string().trim().min(1, 'Bitte gib einen Text ein.').max(20000, 'Der Text ist zu lang.'),
});

/** Body of `POST /api/privatpartys/nachrichten/:id/zuordnen`. */
export const privatpartyZuordnenSchema = z.object({
  privatpartyId: z.string('Bitte wähle eine Anfrage.').min(1, 'Bitte wähle eine Anfrage.'),
});

/** `GET /api/privatpartys/mail-status`. */
export interface PrivatpartyMailStatusDto {
  eingerichtet: boolean;
  letzterAbruf: string | null;
  fehler: string | null;
}

const ZITAT_KOPF = /^\s*(am|on)\s.+\b(schrieb|wrote)\b.*:?\s*$/i;

/**
 * Splits a mail text into the new part and the quoted rest: everything from "Am … schrieb …:" /
 * "On … wrote:" on, plus lines starting with ">" (kept in order in `zitat`).
 */
export function zitatTrennen(text: string): { neu: string; zitat: string } {
  const zeilen = text.replace(/\r\n?/g, '\n').split('\n');
  let ende = zeilen.length;
  for (const [i, z] of zeilen.entries()) {
    // The header may wrap onto a second line.
    const zweizeilig =
      i + 1 < zeilen.length && /^\s*(am|on)\s/i.test(z) && !/:\s*$/.test(z)
        ? `${z} ${zeilen[i + 1]}`
        : z;
    if (ZITAT_KOPF.test(zweizeilig) && /:\s*$/.test(zweizeilig)) {
      ende = i;
      break;
    }
  }
  const neu: string[] = [];
  const zitat: string[] = [];
  for (const [i, z] of zeilen.entries()) {
    if (i >= ende || z.startsWith('>')) zitat.push(z);
    else neu.push(z);
  }
  return { neu: neu.join('\n').trim(), zitat: zitat.join('\n').trim() };
}
