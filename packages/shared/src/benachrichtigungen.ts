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
    standardAktiv: { anwaerter: true, mitglied: true, em: false },
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
  if (!art.minuten) return { aktiv: gespeichert?.aktiv ?? standardAktiv, minuten: null };
  const gueltig =
    gespeichert?.minuten != null && art.minuten.optionen.includes(gespeichert.minuten)
      ? gespeichert.minuten
      : art.minuten.standard;
  return { aktiv: gespeichert?.aktiv ?? standardAktiv, minuten: gueltig };
}

/** One row of `GET /api/me/benachrichtigungen`. */
export interface EinstellungDto {
  art: string;
  bereich: string;
  aktiv: boolean;
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
    minuten: z.number().int().positive().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.minuten === undefined) return;
    const art = benachrichtigungsArt(v.art);
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
}
