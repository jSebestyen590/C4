import { z } from 'zod';
import type { Anrede } from './anrede';
import { beschreibung, eindeutig } from './bausteine';
import { datumAnzeigen, heuteBerlin, tagNachher } from './datum';
import { bedarfEingabeSchema, eventSpanne, type EventDauer } from './kalender';
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

const uhrzeitSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte gib eine Uhrzeit an (HH:MM).');

export const UMFRAGE_TERMIN_NAME_MAX = 60;

/** A date to pick in a scheduling poll; the times only when they are set per date. */
export const optionTerminSchema = z
  .object({
    datum: datumSchema,
    /** Last day for multi-day and whole-day Kategorien; null for one-day ones and Vorlagen. */
    bis: datumSchema.nullish().transform((v) => v ?? null),
    beginn: uhrzeitSchema.nullable(),
    ende: uhrzeitSchema.nullable(),
    /** Optional name shown with the date, e.g. "StuK". */
    name: z
      .string()
      .trim()
      .max(UMFRAGE_TERMIN_NAME_MAX, `Höchstens ${UMFRAGE_TERMIN_NAME_MAX} Zeichen erlaubt.`)
      .nullish()
      .transform((v) => v || null),
  })
  .refine((t) => t.bis === null || t.bis >= t.datum, {
    message: 'Das Ende liegt vor dem Beginn.',
    path: ['bis'],
  });
export type OptionTermin = z.infer<typeof optionTerminSchema>;

const optionSchema = z
  .object({
    /** Set for options that already exist (editing); new options have none. */
    id: z.string().min(1).optional(),
    /** Generated from `termin` in scheduling polls. */
    text: z.string().trim().max(200, 'Höchstens 200 Zeichen erlaubt.'),
    termin: optionTerminSchema.nullish().transform((v) => v ?? null),
  })
  .refine((o) => o.text !== '' || o.termin !== null, {
    message: 'Bitte gib eine Antwort ein.',
    path: ['text'],
  });

/**
 * Scheduling poll: the answers are dates, and the creator turns one of them into an event, either
 * from a Vorlage (times, Schichten and Bedarf from there; the answers are start dates) or of
 * `kategorieId`. Times are the same for all dates unless `jeTermin`; whole-day Kategorien have none.
 * Dienste Kategorien without a Vorlage need a `bedarf`: one Betrieb Schicht with that Dienstform.
 * What depends on the Kategorie is checked by `terminDauerFehler`.
 */
export const umfrageTerminSchema = z.object({
  kategorieId: z.string('Bitte wähle eine Kategorie.').min(1, 'Bitte wähle eine Kategorie.'),
  vorlageId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  jeTermin: z.boolean(),
  beginn: uhrzeitSchema.nullable(),
  ende: uhrzeitSchema.nullable(),
  bedarf: bedarfEingabeSchema.nullable(),
});
export type UmfrageTermin = z.infer<typeof umfrageTerminSchema>;

/**
 * Drops what the Kategorie (or Vorlage) decides itself: with a Vorlage times, end dates and Bedarf
 * come from it; whole days have no times; one-day Kategorien no end dates.
 */
export function terminNormalisieren<O extends { termin: OptionTermin | null }>(
  termin: UmfrageTermin,
  optionen: readonly O[],
  dauer: EventDauer,
): { termin: UmfrageTermin; optionen: O[] } {
  const vorlage = termin.vorlageId !== null;
  const ohneZeiten = vorlage || dauer === 'ganztaegig';
  const ohneBis = vorlage || dauer === 'eintaegig';
  return {
    termin: {
      ...termin,
      jeTermin: ohneZeiten ? false : termin.jeTermin,
      beginn: ohneZeiten ? null : termin.beginn,
      ende: ohneZeiten ? null : termin.ende,
      bedarf: vorlage ? null : termin.bedarf,
    },
    optionen: optionen.map((o) =>
      o.termin
        ? {
            ...o,
            termin: {
              datum: o.termin.datum,
              bis: ohneBis ? null : o.termin.bis,
              beginn: ohneZeiten ? null : o.termin.beginn,
              ende: ohneZeiten ? null : o.termin.ende,
              name: o.termin.name,
            },
          }
        : o,
    ),
  };
}

/** German error when the (normalized) dates do not fit the Kategorie's `dauer`, else null. */
export function terminDauerFehler(
  termin: UmfrageTermin,
  optionen: readonly { termin: OptionTermin | null }[],
  dauer: EventDauer,
): string | null {
  if (termin.vorlageId !== null) return null;
  if (dauer !== 'ganztaegig') {
    const fehlt = termin.jeTermin
      ? optionen.some((o) => !o.termin?.beginn || !o.termin.ende)
      : !termin.beginn || !termin.ende;
    if (fehlt) {
      return termin.jeTermin
        ? 'Bitte gib bei jedem Termin Beginn und Ende an.'
        : 'Bitte gib Beginn und Ende an.';
    }
  }
  if (dauer !== 'eintaegig' && optionen.some((o) => !o.termin?.bis)) {
    return 'Bitte gib bei jedem Termin das Ende an.';
  }
  return null;
}

/** Begin and end of the event for a date (without a Vorlage). */
export function terminSpanne(
  termin: Pick<UmfrageTermin, 'jeTermin' | 'beginn' | 'ende'>,
  option: OptionTermin,
  dauer: EventDauer,
): { beginn: string; ende: string } {
  const zeiten = terminZeiten(termin, option);
  return eventSpanne(dauer, {
    datum: option.datum,
    bis: option.bis ?? option.datum,
    beginnZeit: zeiten.beginn,
    endeZeit: zeiten.ende,
  });
}

/** One place to enter people: a Dienstform with its Bedarf in a Betrieb Schicht. */
export interface DienstPlatz {
  schichtId: string;
  dienstformId: string;
  minimum: number;
  wunsch: number;
}

/** The Bedarf of several Dienstformen (and Schichten) as one: summed Minimum and Wunsch. */
export const bedarfZusammen = (plaetze: readonly Omit<DienstPlatz, 'schichtId'>[]) => ({
  minimum: plaetze.reduce((n, p) => n + p.minimum, 0),
  wunsch: plaetze.reduce((n, p) => n + p.wunsch, 0),
  dienstformIds: [...new Set(plaetze.map((p) => p.dienstformId))],
});

/**
 * Distributes members over the places in order: first up to every Minimum, then up to every
 * Wunsch, the rest one after the other (more than the Wunsch is always fine).
 */
export function dienstVerteilung(
  plaetze: readonly DienstPlatz[],
  subs: readonly string[],
): { sub: string; platz: DienstPlatz }[] {
  if (plaetze.length === 0) return [];
  const belegt = plaetze.map(() => 0);
  const ergebnis: { sub: string; platz: DienstPlatz }[] = [];
  const naechster = (grenze: (p: DienstPlatz) => number) =>
    plaetze.findIndex((p, i) => belegt[i]! < grenze(p));
  for (const sub of subs) {
    let i = naechster((p) => p.minimum);
    if (i < 0) i = naechster((p) => p.wunsch);
    if (i < 0) i = ergebnis.length % plaetze.length;
    belegt[i]!++;
    ergebnis.push({ sub, platz: plaetze[i]! });
  }
  return ergebnis;
}

/** Question of a scheduling poll when none is given. */
export const TERMIN_FRAGE = 'Welche Termine passen dir?';

const wochentagFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });

/**
 * "Di, 11.11.2026", "Di, 11.11.2026, 19:00–21:00", "Fr, 10.07.2026 – So, 12.07.2026" or
 * "Fr, 10.07.2026 18:00 – So, 12.07.2026 14:00", followed by the name ("Di, 11.11.2026 · StuK").
 */
export function terminText(t: OptionTermin): string {
  const datum = terminDatumText(t);
  return t.name ? `${datum} · ${t.name}` : datum;
}

function terminDatumText(t: OptionTermin): string {
  const tag = (datum: string) =>
    `${wochentagFormat.format(new Date(`${datum}T12:00:00Z`)).replace('.', '')}, ${datumAnzeigen(datum)}`;
  const zeiten = t.beginn !== null && t.ende !== null;
  if (t.bis !== null && t.bis !== t.datum) {
    return zeiten
      ? `${tag(t.datum)} ${t.beginn} – ${tag(t.bis)} ${t.ende}`
      : `${tag(t.datum)} – ${tag(t.bis)}`;
  }
  return `${tag(t.datum)}${zeiten ? `, ${t.beginn}–${t.ende}` : ''}`;
}

/** Wall times of a date: its own ones, else those of the poll. */
export const terminZeiten = (
  termin: Pick<UmfrageTermin, 'jeTermin' | 'beginn' | 'ende'>,
  option: OptionTermin,
): { beginn: string; ende: string } => ({
  beginn: (termin.jeTermin ? option.beginn : termin.beginn) ?? '00:00',
  ende: (termin.jeTermin ? option.ende : termin.ende) ?? '00:00',
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
    const texte = f.optionen.filter((o) => o.text !== '').map((o) => o.text.toLowerCase());
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
    /** Set for scheduling polls (see `umfrageTerminSchema`). */
    termin: umfrageTerminSchema.nullish().transform((v) => v ?? null),
    /**
     * Scheduling without an event: one question whose answers are dates (optionally with times
     * and a name), any number can be picked or "an keinem der Termine"; nothing becomes an event.
     */
    terminFrei: z
      .boolean()
      .optional()
      .transform((v) => v ?? false),
    /** Editing: confirms that votes become invalid (otherwise 409). */
    bestaetigt: z.boolean().optional(),
  })
  .superRefine((u, ctx) => {
    if (u.anonym && (u.termin || u.terminFrei)) {
      ctx.addIssue({
        code: 'custom',
        path: ['anonym'],
        message: 'Eine Terminumfrage kann nicht anonym sein.',
      });
    }
    if (u.termin) {
      if (u.terminFrei) {
        ctx.addIssue({
          code: 'custom',
          path: ['terminFrei'],
          message: 'Eine freie Terminfindung hat keine Kategorie und keine Vorlage.',
        });
      }
      terminFehler(u, u.termin).forEach((issue) => ctx.addIssue({ code: 'custom', ...issue }));
      return;
    }
    if (u.terminFrei) {
      if (u.titel === '') {
        ctx.addIssue({ code: 'custom', path: ['titel'], message: 'Bitte gib einen Titel ein.' });
      }
      if (u.fragen.length !== 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['fragen'],
          message: 'Eine Terminfindung hat genau eine Frage.',
        });
      } else {
        freieTerminFehler(u.fragen[0]!.optionen).forEach((issue) =>
          ctx.addIssue({ code: 'custom', ...issue }),
        );
      }
    }
    if (!u.terminFrei && u.fragen.some((f) => f.optionen.some((o) => o.termin !== null))) {
      ctx.addIssue({
        code: 'custom',
        path: ['fragen'],
        message: 'Termine gibt es nur bei Terminumfragen.',
      });
    }
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
    if (u.terminFrei) {
      const [frage] = u.fragen;
      // Like scheduling with an event: dates in order, the text is generated from them.
      const optionen = [...frage!.optionen]
        .map((o) => ({ ...o, termin: { ...o.termin!, bis: null } }))
        .sort((a, b) => terminSchluessel(a.termin).localeCompare(terminSchluessel(b.termin)))
        .map((o) => ({ ...o, text: terminText(o.termin) }));
      return {
        ...u,
        fragen: [
          {
            ...frage!,
            text: frage!.text || TERMIN_FRAGE,
            freitext: false,
            maxAntworten: null,
            optionen,
          },
        ],
      };
    }
    if (u.termin) {
      const termin = u.termin;
      const [frage] = u.fragen;
      // Dates in order; the answer text is generated, so it always matches the date.
      const optionen = [...frage!.optionen]
        .map((o) => ({ ...o, termin: zeitenNachModus(o.termin!, termin) }))
        .sort((a, b) => terminSchluessel(a.termin).localeCompare(terminSchluessel(b.termin)))
        .map((o) => ({ ...o, text: terminText(o.termin) }));
      return {
        ...u,
        fragen: [
          {
            ...frage!,
            text: frage!.text || TERMIN_FRAGE,
            freitext: false,
            maxAntworten: null,
            optionen,
          },
        ],
      };
    }
    if (u.fragen.length !== 1) return u;
    const [frage] = u.fragen;
    return {
      ...u,
      titel: u.titel || titelAus(frage!.text),
      fragen: [{ ...frage!, text: frage!.text || u.titel }],
    };
  });
export type UmfrageEingabe = z.input<typeof umfrageEingabeSchema>;

/** Dates of a scheduling poll without an event: a date each, times optional but both or none. */
function freieTerminFehler(
  optionen: readonly { termin: OptionTermin | null }[],
): { path: (string | number)[]; message: string }[] {
  const pfad = ['fragen', 0, 'optionen'];
  if (optionen.length === 0) return [{ path: pfad, message: 'Lege mindestens einen Termin an.' }];
  const fehler: { path: (string | number)[]; message: string }[] = [];
  for (const [i, o] of optionen.entries()) {
    if (!o.termin) fehler.push({ path: [...pfad, i], message: 'Bitte gib ein Datum an.' });
    else if ((o.termin.beginn === null) !== (o.termin.ende === null)) {
      fehler.push({
        path: [...pfad, i],
        message: `Gib bei Termin ${i + 1} Beginn und Ende an oder keine Uhrzeit.`,
      });
    }
  }
  const schluessel = optionen.flatMap((o) =>
    o.termin ? [terminSchluessel({ ...o.termin, bis: null })] : [],
  );
  if (!eindeutig(schluessel)) fehler.push({ path: pfad, message: 'Ein Termin ist doppelt.' });
  return fehler;
}

/** Times per date only with `jeTermin`; otherwise those of the poll apply. */
const zeitenNachModus = (o: OptionTermin, t: UmfrageTermin): OptionTermin =>
  t.jeTermin ? o : { datum: o.datum, bis: o.bis, beginn: null, ende: null, name: o.name };

const terminSchluessel = (o: OptionTermin) =>
  `${o.datum} ${o.beginn ?? ''} ${o.bis ?? ''} ${(o.name ?? '').toLowerCase()}`;

/** Rules of a scheduling poll: one question of dates, not anonymous, a title for the event. */
function terminFehler(
  u: {
    titel: string;
    anonym: boolean;
    fragen: readonly { optionen: readonly { termin: OptionTermin | null }[] }[];
  },
  t: UmfrageTermin,
): { path: (string | number)[]; message: string }[] {
  const fehler: { path: (string | number)[]; message: string }[] = [];
  if (u.anonym) {
    fehler.push({
      path: ['anonym'],
      message: 'Eine Terminumfrage kann nicht anonym sein, sonst lässt sich niemand eintragen.',
    });
  }
  if (u.fragen.length !== 1) {
    fehler.push({ path: ['fragen'], message: 'Eine Terminumfrage hat genau eine Frage.' });
    return fehler;
  }
  const optionen = u.fragen[0]!.optionen;
  if (optionen.length === 0) {
    fehler.push({ path: ['fragen', 0, 'optionen'], message: 'Lege mindestens einen Termin an.' });
  }
  for (const [i, o] of optionen.entries()) {
    if (!o.termin) {
      fehler.push({ path: ['fragen', 0, 'optionen', i], message: 'Bitte gib ein Datum an.' });
    }
  }
  const schluessel = optionen.flatMap((o) =>
    o.termin ? [terminSchluessel(zeitenNachModus(o.termin, t))] : [],
  );
  if (!eindeutig(schluessel)) {
    fehler.push({ path: ['fragen', 0, 'optionen'], message: 'Ein Termin ist doppelt.' });
  }
  return fehler;
}

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
  /** No answer is an answer too ("an keinem Termin" in scheduling polls). */
  leerErlaubt?: boolean;
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
    if (anzahl === 0) {
      if (f.leerErlaubt) continue;
      return `Bitte beantworte Frage ${i + 1}.`;
    }
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
      } else if (ungueltig.length > 0 || (zuFrage.length === 0 && !f.leerErlaubt)) {
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
  /** The caller may vote: in a circle, or holder of `privatpartys:verwalten` on a Privatparty poll. */
  darfAbstimmen: boolean;
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
  /** Scheduling poll (see `umfrageTerminSchema`). */
  terminumfrage: boolean;
  /** Scheduling without an event (free-text dates). */
  terminFrei: boolean;
}

export interface UmfrageOptionDto {
  id: string;
  text: string;
  /** The date in scheduling polls, else null. */
  termin: OptionTermin | null;
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
  /** Scheduling polls: members who can make none of the dates (count, names if public); else null. */
  keiner: { anzahl: number; personen: UmfragePerson[] | null } | null;
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
  /** Scheduling polls only, else null. */
  termin: UmfrageTermin | null;
  /** Scheduling polls: how the event's dates work (from its Kategorie). */
  terminDauer: EventDauer | null;
  /** Scheduling polls with Dienste: the Bedarf of all Dienstformen together (names for display). */
  terminBedarf: { minimum: number; wunsch: number; dienstformen: string[] } | null;
  /** The event created from the poll and the date it was created for. */
  eventId: string | null;
  eventOptionId: string | null;
  /** Ended scheduling poll without an event, and the caller is the creator or Verwaltung. */
  darfEventAnlegen: boolean;
  /** Members of the circles with their vote state; null in anonymous polls. */
  teilnehmende: { person: UmfragePerson; rolle: KreisRolle; abgestimmt: boolean }[] | null;
}

/** Body of `POST /api/umfragen/:id/event`: the date that becomes the event. */
export const terminWahlSchema = z.object({
  optionId: z.string().min(1, 'Bitte wähle einen Termin.'),
});
