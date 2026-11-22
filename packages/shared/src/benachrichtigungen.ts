import { z } from 'zod';
import type { MitgliedStatus } from './status';

/**
 * Generic notification types. Every feature area adds its types here (key `<bereich>.<name>`);
 * German labels live in the web app's `i18n.ts`. See docs/benachrichtigungen.md.
 */
export interface BenachrichtigungsArt {
  /** Stable key, stored in the database: `<bereich>.<name>`. */
  key: string;
  /** Feature area the type belongs to (groups the settings page). */
  bereich: string;
  /** Default of the on/off switch, optionally per member status. */
  standardAktiv: boolean | Record<MitgliedStatus, boolean>;
  /** Configurable minutes (e.g. "before the Schicht"); null when the type has no such setting. */
  minuten: { standard: number; optionen: readonly number[] } | null;
  /** False for types nobody may switch off (always active); default true. */
  abschaltbar?: boolean;
}

export const BENACHRICHTIGUNGS_ARTEN = [
  {
    key: 'kalender.erinnerung',
    bereich: 'kalender',
    standardAktiv: true,
    minuten: { standard: 30, optionen: [15, 30, 60, 120, 1440] },
  },
  {
    key: 'kalender.fehlende_dienste',
    bereich: 'kalender',
    standardAktiv: { anwaerter: true, mitglied: true, em: false, extern: true },
    minuten: null,
  },
  {
    key: 'kalender.aenderung',
    bereich: 'kalender',
    standardAktiv: true,
    minuten: null,
  },
  {
    key: 'kalender.teilnahme_erinnerung',
    bereich: 'kalender',
    standardAktiv: true,
    minuten: { standard: 60, optionen: [15, 30, 60, 120, 1440] },
  },
  {
    key: 'geburtstag.erinnerung',
    bereich: 'geburtstag',
    standardAktiv: true,
    // Lead time in whole days, stored as minutes; 0 = on the day itself.
    minuten: { standard: 0, optionen: [0, 1440, 2880, 4320, 7200, 10080] },
  },
  {
    key: 'schluessel.uebergabe',
    bereich: 'schluessel',
    standardAktiv: true,
    minuten: null,
    abschaltbar: false,
  },
  {
    key: 'schluessel.bedarf',
    bereich: 'schluessel',
    standardAktiv: true,
    minuten: null,
    abschaltbar: false,
  },
  {
    key: 'schluessel.abgabe',
    bereich: 'schluessel',
    standardAktiv: true,
    minuten: null,
    abschaltbar: false,
  },
  {
    key: 'schluessel.antwort',
    bereich: 'schluessel',
    standardAktiv: true,
    minuten: null,
    abschaltbar: false,
  },
  {
    key: 'schluessel.planung',
    bereich: 'schluessel',
    standardAktiv: true,
    minuten: null,
    abschaltbar: false,
  },
  {
    key: 'umfrage.neu',
    bereich: 'umfrage',
    standardAktiv: true,
    minuten: null,
  },
  {
    // Members of the mandatory circle get reminders regardless of this setting.
    key: 'umfrage.erinnerung',
    bereich: 'umfrage',
    standardAktiv: true,
    minuten: null,
  },
  {
    key: 'umfrage.termin',
    bereich: 'umfrage',
    standardAktiv: true,
    minuten: null,
  },
  {
    key: 'umfrage.erneut_abstimmen',
    bereich: 'umfrage',
    standardAktiv: true,
    minuten: null,
    abschaltbar: false,
  },
  {
    // Two days before the deadline of an open Todo; cannot be switched off.
    key: 'todo.frist',
    bereich: 'todo',
    standardAktiv: true,
    minuten: null,
    abschaltbar: false,
  },
  {
    // After a Buch-Abrechnung to the owner of a page that is below the allowed overdraft.
    key: 'buch.ueberzug',
    bereich: 'buch',
    standardAktiv: true,
    minuten: null,
  },
  {
    // New request for a Privatparty; only holders of `privatpartys:verwalten` receive it.
    key: 'privatpartys.anfrage',
    bereich: 'privatpartys',
    standardAktiv: true,
    minuten: null,
  },
  {
    // Another message to an existing Privatparty.
    key: 'privatpartys.nachricht',
    bereich: 'privatpartys',
    standardAktiv: true,
    minuten: null,
  },
  {
    // A member submitted a Beleg; only holders of `finanzen:buchen` receive it.
    key: 'belege.eingereicht',
    bereich: 'belege',
    standardAktiv: true,
    minuten: null,
  },
  {
    // Status of a submitted Beleg changed (booked, rejected, reimbursed); goes to the submitter.
    key: 'belege.status',
    bereich: 'belege',
    standardAktiv: true,
    minuten: null,
  },
  {
    // A month was closed (Festschreibung); goes to holders of `finanzen:pruefen`.
    key: 'finanzen.festgeschrieben',
    bereich: 'finanzen',
    standardAktiv: true,
    minuten: null,
  },
  {
    // Weekly reminder from the 10th on that a past month is not closed yet; goes to holders of `finanzen:verwalten`.
    key: 'finanzen.festschreibung_faellig',
    bereich: 'finanzen',
    standardAktiv: true,
    minuten: null,
  },
] as const satisfies readonly BenachrichtigungsArt[];

export type BenachrichtigungsArtKey = (typeof BENACHRICHTIGUNGS_ARTEN)[number]['key'];
export const BENACHRICHTIGUNGS_ART_KEYS = BENACHRICHTIGUNGS_ARTEN.map((a) => a.key) as [
  BenachrichtigungsArtKey,
  ...BenachrichtigungsArtKey[],
];

/** Distinct areas in registry order. */
export const BENACHRICHTIGUNGS_BEREICHE = [
  ...new Set(BENACHRICHTIGUNGS_ARTEN.map((a) => a.bereich)),
];

export function benachrichtigungsArt(key: string): BenachrichtigungsArt | undefined {
  return BENACHRICHTIGUNGS_ARTEN.find((a) => a.key === key);
}

/** A stored setting; `minuten` is null for types without minutes. */
/** Whether members may switch the type off. */
export const istAbschaltbar = (art: BenachrichtigungsArt) => art.abschaltbar !== false;

export interface GespeicherteEinstellung {
  aktiv: boolean;
  minuten: number | null;
}

export interface EffektiveEinstellung {
  aktiv: boolean;
  /** Null for types without a minutes setting. */
  minuten: number | null;
}

/** The setting that applies to a member: the stored row, else the default for their status. */
export function effektiveEinstellung(
  art: BenachrichtigungsArt,
  status: MitgliedStatus,
  gespeichert?: GespeicherteEinstellung | null,
): EffektiveEinstellung {
  const standardAktiv =
    typeof art.standardAktiv === 'boolean' ? art.standardAktiv : art.standardAktiv[status];
  // Types that cannot be switched off ignore a stored "off".
  const aktiv = istAbschaltbar(art) ? (gespeichert?.aktiv ?? standardAktiv) : true;
  if (!art.minuten) return { aktiv, minuten: null };
  const gueltig =
    gespeichert?.minuten != null && art.minuten.optionen.includes(gespeichert.minuten)
      ? gespeichert.minuten
      : art.minuten.standard;
  return { aktiv, minuten: gueltig };
}

/** One row of `GET /api/me/benachrichtigungen`. */
export interface EinstellungDto {
  art: string;
  bereich: string;
  aktiv: boolean;
  /** False when the type is always active. */
  abschaltbar: boolean;
  minuten: number | null;
  /** Selectable minutes; null when the type has no minutes setting. */
  minutenOptionen: readonly number[] | null;
}

/** Body of `POST /api/push/abos`: the browser's `PushSubscription.toJSON()`. */
export const pushAboSchema = z.object({
  endpoint: z.url('Ungültiger Endpunkt.').max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});
export type PushAboEingabe = z.infer<typeof pushAboSchema>;

export const pushAboLoeschenSchema = z.object({ endpoint: z.string().min(1).max(2000) });

/** Body of `PUT /api/me/benachrichtigungen`. */
export const einstellungSchema = z
  .object({
    art: z.enum(BENACHRICHTIGUNGS_ART_KEYS, 'Unbekannte Benachrichtigung.'),
    aktiv: z.boolean(),
    minuten: z.number().int().nonnegative().optional(),
  })
  .superRefine((v, ctx) => {
    const art = benachrichtigungsArt(v.art);
    if (!v.aktiv && art && !istAbschaltbar(art)) {
      ctx.addIssue({
        code: 'custom',
        path: ['aktiv'],
        message: 'Diese Benachrichtigung kann nicht ausgeschaltet werden.',
      });
    }
    if (v.minuten === undefined) return;
    if (!art?.minuten) {
      ctx.addIssue({ code: 'custom', path: ['minuten'], message: 'Hier gibt es keine Minuten.' });
    } else if (!art.minuten.optionen.includes(v.minuten)) {
      ctx.addIssue({ code: 'custom', path: ['minuten'], message: 'Ungültige Minutenangabe.' });
    }
  });
export type EinstellungEingabe = z.infer<typeof einstellungSchema>;

/** Payload of a push message as the service worker receives it. */
export interface PushNachricht {
  titel: string;
  text: string;
  /** App-relative path (e.g. `/app/kalender/events/<id>`) opened on click. */
  url: string;
  /** Id of the member's history entry (opened/read marking); absent for test messages. */
  id?: string;
}

/** One entry of the notification history. */
export interface VerlaufEintragDto {
  id: string;
  art: string;
  titel: string;
  text: string;
  /** App-relative path (with `/app` prefix) opened on click. */
  url: string;
  erstellt: string;
  gelesen: boolean;
}

/** `GET /api/me/benachrichtigungen/verlauf`: `weiter` is the `vor` cursor of the next page (null: no more). */
export interface VerlaufSeiteDto {
  eintraege: VerlaufEintragDto[];
  weiter: string | null;
}

/** Query of `GET /api/me/benachrichtigungen/verlauf`. */
export const verlaufFilterSchema = z.object({
  art: z.enum(BENACHRICHTIGUNGS_ART_KEYS, 'Unbekannte Benachrichtigung.').optional(),
  bereich: z
    .string()
    .refine((b) => (BENACHRICHTIGUNGS_BEREICHE as string[]).includes(b), 'Unbekannter Bereich.')
    .optional(),
});

/** Query of `GET /api/me/benachrichtigungen/verlauf`: the filter plus unread-only and the page cursor. */
export const verlaufSeiteQuerySchema = verlaufFilterSchema.extend({
  ungelesen: z.enum(['true', 'false']).optional(),
  vor: z.string().max(200).optional(),
});

/** Body of `POST /api/me/benachrichtigungen/verlauf/gelesen`: marks everything matching the filter. */
export const verlaufAlleGelesenSchema = verlaufFilterSchema;
export type VerlaufFilter = z.infer<typeof verlaufFilterSchema>;

/** Entries older than this many days are deleted. */
export const VERLAUF_AUFBEWAHRUNG_TAGE = 90;
