import { z } from 'zod';
import type { Anrede } from './anrede';
import { beschreibung, eindeutig } from './bausteine';
import { heuteBerlin, tagNachher } from './datum';
import { datumSchema } from './schemas';
import { MITGLIED_STATI, type MitgliedStatus } from './status';

// Polls with questions, a mandatory and an optional circle and morning reminders (see docs/umfragen.md).

/** When the results are visible to voters (the creator and Verwaltung always see them). */
export const UMFRAGE_ERGEBNISSE = ['sofort', 'nach_abstimmung', 'nach_ende'] as const;
export type UmfrageErgebnisse = (typeof UMFRAGE_ERGEBNISSE)[number];

/** Selectable reminder days before the poll ends (0 = on the last day). */
export const UMFRAGE_ERINNERUNG_TAGE = [0, 1, 2, 3, 5, 7, 14] as const;
export const UMFRAGE_ERINNERUNG_STANDARD = { pflicht: [7, 3, 1], optional: [3] } as const;

export const UMFRAGE_FRAGEN_MAX = 20;
export const UMFRAGE_OPTIONEN_MAX = 30;
export const UMFRAGE_TITEL_MAX = 200;
export const UMFRAGE_FRAGE_MAX = 500;

/** A title taken over from a long question is cut to the allowed length. */
const titelAus = (frage: string) =>
  frage.length <= UMFRAGE_TITEL_MAX ? frage : `${frage.slice(0, UMFRAGE_TITEL_MAX - 1)}…`;

/** A circle: statuses, holders of Posten and individual members (subs). */
export interface UmfrageKreis {
  status: MitgliedStatus[];
  posten: string[];
  personen: string[];
}

export const leererKreis = (): UmfrageKreis => ({ status: [], posten: [], personen: [] });

const idListe = z
  .array(z.string().min(1))
  .refine((a) => eindeutig(a), { message: 'Doppelte Einträge.' });

export const umfrageKreisSchema = z.object({
  status: z
    .array(z.enum(MITGLIED_STATI))
    .refine((a) => eindeutig(a), { message: 'Doppelte Einträge.' }),
  posten: idListe,
  personen: idListe,
});

/** Who votes either has to or may, never both. */
const KREIS_DOPPELT = {
  status: 'Ein Status kann nur verpflichtend oder optional abstimmen, nicht beides.',
  posten: 'Ein Posten kann nur verpflichtend oder optional abstimmen, nicht beides.',
  personen: 'Eine Person kann nur verpflichtend oder optional abstimmen, nicht beides.',
} as const;

const kreisLeer = (k: UmfrageKreis) =>
  k.status.length === 0 && k.posten.length === 0 && k.personen.length === 0;

const erinnerungenSchema = z
  .array(
    z
      .number()
      .int()
      .refine((n) => (UMFRAGE_ERINNERUNG_TAGE as readonly number[]).includes(n), {
        message: 'Ungültige Erinnerung.',
      }),
  )
  .refine((a) => eindeutig(a.map(String)), { message: 'Doppelte Einträge.' });

const optionSchema = z.object({
  /** Set for options that already exist (editing); new options have none. */
  id: z.string().min(1).optional(),
  text: z
    .string()
    .trim()
    .min(1, 'Bitte gib eine Antwort ein.')
    .max(200, 'Höchstens 200 Zeichen erlaubt.'),
});

export const umfrageFrageSchema = z
  .object({
    id: z.string().min(1).optional(),
    /** May be empty in a poll with a single question; then the title is the question. */
    text: z.string().trim().max(UMFRAGE_FRAGE_MAX, 'Höchstens 500 Zeichen erlaubt.'),
    freitext: z.boolean(),
    /** How many answers a member may pick (a free text counts as one); null = all. */
    maxAntworten: z.number().int().min(1, 'Mindestens 1.').nullable(),
    optionen: z.array(optionSchema).max(UMFRAGE_OPTIONEN_MAX, 'Zu viele Antworten.'),
  })
  .superRefine((f, ctx) => {
    if (f.optionen.length === 0 && !f.freitext) {
      ctx.addIssue({
        code: 'custom',
        path: ['optionen'],
        message: 'Lege mindestens eine Antwort an oder erlaube Freitext.',
      });
    }
    const texte = f.optionen.map((o) => o.text.toLowerCase());
    if (!eindeutig(texte)) {
      ctx.addIssue({ code: 'custom', path: ['optionen'], message: 'Antworten doppelt.' });
    }
    const ids = f.optionen.flatMap((o) => (o.id ? [o.id] : []));
    if (!eindeutig(ids)) {
      ctx.addIssue({ code: 'custom', path: ['optionen'], message: 'Doppelte Einträge.' });
    }
    if (f.maxAntworten !== null && f.maxAntworten > moeglicheAntworten(f)) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxAntworten'],
        message: 'Mehr als es Antworten gibt.',
      });
    }
  });
export type UmfrageFrageEingabe = z.input<typeof umfrageFrageSchema>;

/** Number of answers a question offers; a free text counts as one. */
export const moeglicheAntworten = (f: { optionen: readonly unknown[]; freitext: boolean }) =>
  f.optionen.length + (f.freitext ? 1 : 0);

/**
 * Body of `POST /api/umfragen` and `PUT /api/umfragen/:id`. With a single question, either the
 * title or the question may be left empty; the other one is used for both.
 */
export const umfrageEingabeSchema = z
  .object({
    titel: z
      .string()
      .trim()
      .max(UMFRAGE_TITEL_MAX, `Höchstens ${UMFRAGE_TITEL_MAX} Zeichen erlaubt.`),
    beschreibung,
    endetAm: datumSchema,
    anonym: z.boolean(),
    ergebnisse: z.enum(UMFRAGE_ERGEBNISSE, 'Bitte wähle, wann Ergebnisse sichtbar sind.'),
    pflicht: umfrageKreisSchema,
    optional: umfrageKreisSchema,
    erinnerungenPflicht: erinnerungenSchema,
    erinnerungenOptional: erinnerungenSchema,
    fragen: z
      .array(umfrageFrageSchema)
      .min(1, 'Lege mindestens eine Frage an.')
      .max(UMFRAGE_FRAGEN_MAX, 'Zu viele Fragen.'),
    /** Editing: confirms that votes become invalid (otherwise 409). */
    bestaetigt: z.boolean().optional(),
  })
  .superRefine((u, ctx) => {
    const einzeln = u.fragen.length === 1;
    if (u.titel === '' && !(einzeln && u.fragen[0]!.text !== '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['titel'],
        message: einzeln
          ? 'Bitte gib einen Titel oder die Frage ein.'
          : 'Bitte gib einen Titel ein.',
      });
    }
    for (const [i, f] of u.fragen.entries()) {
      if (f.text === '' && !(einzeln && u.titel !== '')) {
        ctx.addIssue({
          code: 'custom',
          path: ['fragen', i, 'text'],
          message: 'Bitte gib eine Frage ein.',
        });
      }
    }
    for (const teil of ['status', 'posten', 'personen'] as const) {
      const pflicht: readonly string[] = u.pflicht[teil];
      if (u.optional[teil].some((x) => pflicht.includes(x))) {
        ctx.addIssue({
          code: 'custom',
          path: ['optional', teil],
          message: KREIS_DOPPELT[teil],
        });
      }
    }
    if (kreisLeer(u.pflicht) && kreisLeer(u.optional)) {
      ctx.addIssue({
        code: 'custom',
        path: ['pflicht'],
        message: 'Wähle aus, wer abstimmen soll.',
      });
    }
    const ids = u.fragen.flatMap((f) => (f.id ? [f.id] : []));
    if (!eindeutig(ids)) {
      ctx.addIssue({ code: 'custom', path: ['fragen'], message: 'Doppelte Einträge.' });
    }
  })
  .transform((u) => {
    if (u.fragen.length !== 1) return u;
    const [frage] = u.fragen;
    return {
      ...u,
      titel: u.titel || titelAus(frage!.text),
      fragen: [{ ...frage!, text: frage!.text || u.titel }],
    };
  });
export type UmfrageEingabe = z.input<typeof umfrageEingabeSchema>;

/** Body of `PUT /api/umfragen/:id/stimme`: one answer per question. */
export const stimmzettelSchema = z.object({
  antworten: z.array(
    z.object({
      frageId: z.string().min(1),
      optionIds: idListe,
      freitext: z
        .string()
        .trim()
        .max(1000, 'Höchstens 1000 Zeichen erlaubt.')
        .transform((v) => (v === '' ? null : v))
        .nullish()
        .transform((v) => v ?? null),
    }),
  ),
});
export type StimmzettelEingabe = z.input<typeof stimmzettelSchema>;
export type Stimmzettel = z.output<typeof stimmzettelSchema>;

/** A question as the vote check and the invalidation need it. */
export interface FrageRegeln {
  id: string;
  optionIds: readonly string[];
  freitext: boolean;
  maxAntworten: number | null;
}

/** German error message when the ballot does not fit the questions, else null. */
export function stimmzettelFehler(
  fragen: readonly FrageRegeln[],
  zettel: Stimmzettel,
): string | null {
  const antworten = new Map(zettel.antworten.map((a) => [a.frageId, a]));
  if (antworten.size !== zettel.antworten.length) return 'Eine Frage ist doppelt beantwortet.';
  if (zettel.antworten.some((a) => !fragen.some((f) => f.id === a.frageId))) {
    return 'Die Umfrage hat sich geändert. Bitte lade sie neu.';
  }
  for (const [i, f] of fragen.entries()) {
    const a = antworten.get(f.id);
    const anzahl = (a?.optionIds.length ?? 0) + (a?.freitext ? 1 : 0);
    if (anzahl === 0) return `Bitte beantworte Frage ${i + 1}.`;
    if (a!.optionIds.some((o) => !f.optionIds.includes(o))) {
      return 'Die Umfrage hat sich geändert. Bitte lade sie neu.';
    }
    if (a!.freitext && !f.freitext) return `Bei Frage ${i + 1} ist kein Freitext möglich.`;
    if (f.maxAntworten !== null && anzahl > f.maxAntworten) {
      return `Bei Frage ${i + 1} sind höchstens ${f.maxAntworten} Antworten möglich.`;
    }
  }
  return null;
}

/** One stored answer: an option or a free text. */
export interface Stimme {
  id: string;
  frageId: string;
  sub: string;
  optionId: string | null;
  freitext: string | null;
}

/**
 * What an edit does to the votes: answers of removed questions are dropped silently; answers to
 * removed options, free texts no longer allowed and answers beyond a lowered maximum are dropped
 * and their members must vote again, as must everyone who voted when a question is added.
 */
export function ungueltigNachAenderung(
  fragen: readonly FrageRegeln[],
  stimmen: readonly Stimme[],
  abgegeben: readonly string[],
): { loeschen: string[]; erneut: string[] } {
  const loeschen = new Set<string>();
  const erneut = new Set<string>();
  const fragenNachId = new Map(fragen.map((f) => [f.id, f]));
  for (const s of stimmen) if (!fragenNachId.has(s.frageId)) loeschen.add(s.id);
  for (const sub of abgegeben) {
    const eigene = stimmen.filter((s) => s.sub === sub);
    for (const f of fragen) {
      const zuFrage = eigene.filter((s) => s.frageId === f.id);
      const ungueltig = zuFrage.filter((s) =>
        s.optionId === null ? !f.freitext : !f.optionIds.includes(s.optionId),
      );
      ungueltig.forEach((s) => loeschen.add(s.id));
      const rest = zuFrage.length - ungueltig.length;
      if (f.maxAntworten !== null && rest > f.maxAntworten) {
        zuFrage.forEach((s) => loeschen.add(s.id));
        erneut.add(sub);
      } else if (ungueltig.length > 0 || zuFrage.length === 0) {
        erneut.add(sub);
      }
    }
  }
  return { loeschen: [...loeschen], erneut: [...erneut] };
}

export type KreisRolle = 'pflicht' | 'optional';

/**
 * Members in the circles of a poll, evaluated against the current members and the current holders
 * of Posten. Being in the mandatory circle wins over the optional one.
 */
export function kreisVon(
  umfrage: { pflicht: UmfrageKreis; optional: UmfrageKreis },
  mitglieder: readonly { sub: string; status: MitgliedStatus }[],
  postenInhaber: ReadonlyMap<string, readonly string[]>,
): Map<string, KreisRolle> {
  const ergebnis = new Map<string, KreisRolle>();
  const bekannt = new Set(mitglieder.map((m) => m.sub));
  const subsVon = (k: UmfrageKreis): Set<string> => {
    const subs = new Set<string>();
    for (const m of mitglieder) if (k.status.includes(m.status)) subs.add(m.sub);
    for (const p of k.posten) for (const s of postenInhaber.get(p) ?? []) subs.add(s);
    for (const s of k.personen) subs.add(s);
    return new Set([...subs].filter((s) => bekannt.has(s)));
  };
  for (const s of subsVon(umfrage.optional)) ergebnis.set(s, 'optional');
  for (const s of subsVon(umfrage.pflicht)) ergebnis.set(s, 'pflicht');
  return ergebnis;
}

/** A poll runs until the end of `endetAm` (Berlin), unless it was ended early. */
export const umfrageLaeuft = (
  u: { endetAm: string; beendetAm: string | Date | null },
  jetzt = new Date(),
): boolean => u.beendetAm === null && heuteBerlin(jetzt) <= u.endetAm;

/** Whether a member sees the results. */
export function ergebnisseSichtbar(p: {
  ergebnisse: UmfrageErgebnisse;
  laeuft: boolean;
  /** Creator or Verwaltung. */
  verwaltet: boolean;
  abgestimmt: boolean;
}): boolean {
  if (p.verwaltet || !p.laeuft) return true;
  if (p.ergebnisse === 'sofort') return true;
  return p.ergebnisse === 'nach_abstimmung' && p.abgestimmt;
}

/**
 * The reminder due today: the number of days before the end whose day is today, or null. Reminders
 * on or before the day the poll was created are skipped (the initial message covers them).
 */
export function erinnerungHeute(
  endetAm: string,
  tage: readonly number[],
  erstelltTag: string,
  heute: string,
): number | null {
  if (heute <= erstelltTag) return null;
  return tage.find((n) => tagNachher(endetAm, -n) === heute) ?? null;
}

/** Stored form of the reminder days: comma-separated, sorted descending. */
export const erinnerungenKodieren = (tage: readonly number[]): string =>
  [...tage].sort((a, b) => b - a).join(',');

export const erinnerungenLesen = (gespeichert: string | null | undefined): number[] =>
  (gespeichert ?? '')
    .split(',')
    .filter((t) => t !== '')
    .map(Number)
    .filter((n) => Number.isInteger(n));

/** A member embedded in a poll DTO. */
export interface UmfragePerson {
  sub: string;
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
  anrede: Anrede;
}

/** One row of `GET /api/umfragen`. */
export interface UmfrageListeDto {
  id: string;
  titel: string;
  endetAm: string;
  beendetAm: string | null;
  laeuft: boolean;
  anonym: boolean;
  ersteller: UmfragePerson | null;
  /** The caller's role in the circles; null outside them. */
  meinKreis: KreisRolle | null;
  /** The caller has a valid vote. */
  abgestimmt: boolean;
  /** The caller's vote became invalid by an edit. */
  erneutNoetig: boolean;
  /** Creator or `umfragen:verwalten`. */
  darfBearbeiten: boolean;
  darfLoeschen: boolean;
  /** Members with a valid vote, and members in the circles. */
  abgaben: number;
  kreisGroesse: number;
}

export interface UmfrageOptionDto {
  id: string;
  text: string;
  /** Null when the results are hidden. */
  stimmen: number | null;
  /** Who picked it; null when hidden or anonymous. */
  personen: UmfragePerson[] | null;
}

export interface UmfrageFrageDto {
  id: string;
  text: string;
  freitext: boolean;
  maxAntworten: number | null;
  optionen: UmfrageOptionDto[];
  /** Free texts; null when hidden. `person` is null in anonymous polls. */
  freitexte: { text: string; person: UmfragePerson | null }[] | null;
}

export interface UmfrageDetailDto extends UmfrageListeDto {
  beschreibung: string | null;
  erstelltAm: string;
  ergebnisse: UmfrageErgebnisse;
  ergebnisseSichtbar: boolean;
  pflicht: UmfrageKreis;
  optional: UmfrageKreis;
  erinnerungenPflicht: number[];
  erinnerungenOptional: number[];
  fragen: UmfrageFrageDto[];
  /** The caller's own answers (also those kept after an edit). */
  meineAntworten: { frageId: string; optionIds: string[]; freitext: string | null }[];
  /** True once anyone voted (then `anonym` cannot change any more). */
  hatStimmen: boolean;
  /** Members of the circles with their vote state; null in anonymous polls. */
  teilnehmende: { person: UmfragePerson; rolle: KreisRolle; abgestimmt: boolean }[] | null;
}
