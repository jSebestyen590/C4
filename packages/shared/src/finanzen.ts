import { z } from 'zod';
import type { Anrede } from './anrede';
import { name } from './bausteine';
import type { MitgliedStatus } from './status';

// Finanzen: chart of accounts and the append-only journal with double-entry bookkeeping, a gapless
// `seq` and a SHA-256 hash chain (see docs/finanzen.md). Money is always whole cents; a line's
// `betragCent` is signed and the lines of an entry add up to 0. Pure functions only (no `node:`
// imports): this module also runs in the browser, hashing uses `globalThis.crypto.subtle`.

export const KONTO_ARTEN = [
  'bargeld',
  'bank',
  'durchlauf',
  'erloes',
  'aufwand',
  'neutral',
] as const;
export type KontoArt = (typeof KONTO_ARTEN)[number];

export const STEUER_ARTEN = ['ust', 'vorsteuer', 'keine'] as const;
export type SteuerArt = (typeof STEUER_ARTEN)[number];

/** Where an entry comes from. Later slices add their own types. */
export const QUELLE_TYPEN = ['manuell', 'umbuchung', 'storno', 'eroeffnung', 'zaehlung'] as const;
export type QuelleTyp = (typeof QUELLE_TYPEN)[number];
/** The types a user may choose when booking by hand (`storno` has its own route). */
export const MANUELLE_QUELLE_TYPEN = ['manuell', 'umbuchung'] as const;

/** Coin and note denominations in cent (1 ct ... 100 EUR). */
export const NENNWERTE_CENT = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
] as const;
export type NennwertCent = (typeof NENNWERTE_CENT)[number];

/** `prev_hash` of the first entry (and `fin_zaehler.letzter_hash` before the first booking). */
export const GENESIS_HASH = '0'.repeat(64);

/** Largest amount of one line: 10 million EUR. */
export const BETRAG_MAX_CENT = 1_000_000_000;
/** Largest number of lines of one entry. */
export const ZEILEN_MAX = 50;
/** Largest count of one denomination in a line. */
export const ANZAHL_MAX = 1_000_000;
/** The journal list returns at most this many bookings (the newest ones). */
export const JOURNAL_MAX = 2000;

export const KONTO_ART_LABELS: Record<KontoArt, string> = {
  bargeld: 'Bargeld',
  bank: 'Bank',
  durchlauf: 'Durchlauf',
  erloes: 'Erlöse',
  aufwand: 'Aufwand',
  neutral: 'Neutral',
};

export const STEUER_ART_LABELS: Record<SteuerArt, string> = {
  keine: 'Keine Steuer',
  ust: 'Umsatzsteuer',
  vorsteuer: 'Vorsteuer',
};

export const QUELLE_TYP_LABELS: Record<QuelleTyp, string> = {
  manuell: 'Freie Buchung',
  umbuchung: 'Umbuchung',
  storno: 'Storno',
  eroeffnung: 'Eröffnung',
  zaehlung: 'Zählung',
};

// ----- Schemas

export const finanzDatumSchema = z
  .string('Bitte gib ein Datum an.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte gib ein gültiges Datum an.')
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, 'Bitte gib ein gültiges Datum an.');

const buchungstext = z
  .string('Bitte gib einen Buchungstext ein.')
  .trim()
  .min(1, 'Bitte gib einen Buchungstext ein.')
  .max(500, 'Höchstens 500 Zeichen erlaubt.');

const cent = (meldung: string) =>
  z.number(meldung).int('Beträge müssen ganze Cent sein.').safe('Der Betrag ist zu groß.');

const nullish = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v): z.output<T> | null => v ?? null);

const steuersatzFeld = z
  .number('Bitte gib einen Steuersatz an.')
  .int('Der Steuersatz muss in ganzen Basispunkten angegeben werden.')
  .min(0, 'Der Steuersatz darf nicht negativ sein.')
  .max(10000, 'Der Steuersatz darf höchstens 100 % betragen.');
const kontoArtFeld = z.enum(KONTO_ARTEN, 'Bitte wähle eine Kontoart.');
const parentFeld = z.string().min(1);

export const kontoEingabeSchema = z.object({
  name: name('einen Namen'),
  art: kontoArtFeld,
  parentId: nullish(parentFeld),
  stueckelung: z.boolean('Bitte gib an, ob das Konto eine Stückelung hat.').default(false),
  /** Default tax rate in basis points (1900 = 19 %). */
  steuersatzStandard: nullish(steuersatzFeld),
});
export type KontoEingabe = z.input<typeof kontoEingabeSchema>;
export type KontoDaten = z.output<typeof kontoEingabeSchema>;

/** Body of `PUT /api/finanzen/konten/:id`: any of the fields (`null` clears parent / tax rate). */
export const kontoAendernSchema = z
  .object({
    name: name('einen Namen').optional(),
    art: kontoArtFeld.optional(),
    parentId: parentFeld.nullable().optional(),
    stueckelung: z.boolean('Bitte gib an, ob das Konto eine Stückelung hat.').optional(),
    steuersatzStandard: steuersatzFeld.nullable().optional(),
  })
  .refine(
    (v) => Object.values(v).some((x) => x !== undefined),
    'Bitte gib mindestens eine Änderung an.',
  );
export type KontoAendern = z.input<typeof kontoAendernSchema>;

/** Body of `PUT /api/finanzen/konten/:id/archiv`. */
export const kontoArchivSchema = z.object({
  archiviert: z.boolean('Bitte gib an, ob das Konto archiviert werden soll.'),
});

export const stueckelungZeileSchema = z.object({
  nennwertCent: z
    .number('Bitte gib einen Nennwert an.')
    .refine((n) => (NENNWERTE_CENT as readonly number[]).includes(n), 'Unzulässiger Nennwert.'),
  anzahl: cent('Bitte gib eine Anzahl an.'),
});
export type StueckelungZeileEingabe = z.output<typeof stueckelungZeileSchema>;

export const buchungZeileSchema = z.object({
  kontoId: z.string('Bitte wähle ein Konto.').min(1, 'Bitte wähle ein Konto.'),
  /** Signed: positive = Soll (Zugang), negative = Haben (Abgang). */
  betragCent: cent('Bitte gib einen Betrag an.'),
  stueckelung: nullish(z.array(stueckelungZeileSchema).max(NENNWERTE_CENT.length)),
  nettoCent: nullish(cent('Bitte gib einen Nettobetrag an.')),
  steuerCent: nullish(cent('Bitte gib einen Steuerbetrag an.')),
  /** Tax rate in basis points. */
  steuersatz: nullish(z.number().int('Der Steuersatz muss ganz sein.').min(0).max(10000)),
  steuerArt: z.enum(STEUER_ARTEN, 'Ungültige Steuerart.').default('keine'),
});
export type BuchungZeileEingabe = z.output<typeof buchungZeileSchema>;

/**
 * Technical key of one entry attempt (a UUID the client generates per Erfassung). Posting the same
 * key again returns the existing booking instead of booking twice. Not part of the hash.
 */
export const idempotenzSchluessel = z
  .string('Der Idempotenz-Schlüssel fehlt.')
  .uuid('Der Idempotenz-Schlüssel muss eine UUID sein.');

export const buchungEingabeSchema = z.object({
  idempotenzSchluessel,
  datum: finanzDatumSchema,
  text: buchungstext,
  quelleTyp: z.enum(MANUELLE_QUELLE_TYPEN, 'Ungültige Buchungsart.').default('manuell'),
  eventId: nullish(z.string().min(1)),
  zeilen: z
    .array(buchungZeileSchema, 'Bitte gib die Buchungszeilen an.')
    .min(2, 'Eine Buchung braucht mindestens zwei Zeilen.')
    .max(ZEILEN_MAX, `Höchstens ${ZEILEN_MAX} Zeilen erlaubt.`),
});
export type BuchungEingabe = z.output<typeof buchungEingabeSchema>;
export type BuchungEingabeInput = z.input<typeof buchungEingabeSchema>;

/** Body of `POST /api/finanzen/buchungen/:id/storno`. */
export const stornoEingabeSchema = z.object({
  idempotenzSchluessel,
  datum: finanzDatumSchema,
  /** Reason of the reversal; required. */
  text: z
    .string('Bitte gib eine Begründung für das Storno an.')
    .trim()
    .min(1, 'Bitte gib eine Begründung für das Storno an.')
    .max(500, 'Höchstens 500 Zeichen erlaubt.'),
});
export type StornoEingabe = z.output<typeof stornoEingabeSchema>;
export type StornoEingabeInput = z.input<typeof stornoEingabeSchema>;

/** Query of `GET /api/finanzen/buchungen`. */
export const journalAbfrageSchema = z.object({
  von: finanzDatumSchema.optional(),
  bis: finanzDatumSchema.optional(),
  kontoId: z.string().min(1).optional(),
  /** `1`: only reversals and the originals they reversed. */
  storno: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v === '1'),
});
export type JournalAbfrage = z.output<typeof journalAbfrageSchema>;

// ----- Validation of an entry

export interface PruefKonto {
  id: string;
  name: string;
  stueckelung: boolean;
  archiviert: boolean;
  /** The account has sub accounts (it is a group) and takes no lines itself. */
  hatUnterkonten?: boolean;
}

/** `1250` -> `12,50 €` (plain space), for error messages. */
export const formatEuro = (c: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    .format(c / 100)
    .replaceAll(String.fromCharCode(160), ' ');
const eur = formatEuro;

/**
 * Group rule: an account with sub accounts takes no lines (also not in a reversal). Returns one
 * German message per such account.
 */
export function pruefeGruppenregel(
  zeilen: readonly { kontoId: string }[],
  konten: readonly PruefKonto[],
): string[] {
  const nachId = new Map(konten.map((k) => [k.id, k]));
  const gesehen = new Set<string>();
  const fehler: string[] = [];
  for (const z of zeilen) {
    const k = nachId.get(z.kontoId);
    if (!k?.hatUnterkonten || gesehen.has(k.id)) continue;
    gesehen.add(k.id);
    fehler.push(
      `Auf das Konto „${k.name}“ kann nicht gebucht werden, weil es Unterkonten hat. Buche auf ein Fach/Unterkonto.`,
    );
  }
  return fehler;
}

/**
 * Business checks of a new entry against the accounts; returns German messages, empty = valid.
 * Zero lines or fewer than two lines, unknown or archived accounts, denominations (required on
 * Stückelung accounts, forbidden elsewhere, sum = amount), tax fields, amount limit and sum = 0.
 */
export function pruefeBuchung(
  eingabe: { zeilen: readonly BuchungZeileEingabe[] },
  konten: readonly PruefKonto[],
): string[] {
  const fehler: string[] = [];
  const nachId = new Map(konten.map((k) => [k.id, k]));
  if (eingabe.zeilen.length < 2) fehler.push('Eine Buchung braucht mindestens zwei Zeilen.');
  let summe = 0;
  eingabe.zeilen.forEach((z, i) => {
    const praefix = `Zeile ${i + 1}: `;
    const f = (text: string) => fehler.push(praefix + text);
    summe += z.betragCent;
    if (!Number.isSafeInteger(z.betragCent))
      return f('Der Betrag muss in ganzen Cent angegeben werden.');
    if (Math.abs(z.betragCent) > BETRAG_MAX_CENT)
      f(`Der Betrag darf höchstens ${eur(BETRAG_MAX_CENT)} betragen.`);
    const konto = nachId.get(z.kontoId);
    if (!konto) f('Das Konto gibt es nicht.');
    else if (konto.archiviert) f(`Das Konto „${konto.name}“ ist archiviert.`);

    const stueck = z.stueckelung ?? [];
    if (z.betragCent === 0 && stueck.length === 0)
      f('Der Betrag darf nur bei einer Stückelung (Wechseln) 0 sein.');
    if (konto) {
      if (konto.stueckelung && stueck.length === 0)
        f(`Für das Konto „${konto.name}“ brauchst du eine Stückelung.`);
      if (!konto.stueckelung && stueck.length > 0)
        f(`Das Konto „${konto.name}“ hat keine Stückelung.`);
    }
    if (stueck.length > 0 && (!konto || konto.stueckelung)) {
      const gesehen = new Set<number>();
      let wert = 0;
      for (const s of stueck) {
        if (!(NENNWERTE_CENT as readonly number[]).includes(s.nennwertCent))
          f(`Der Nennwert ${s.nennwertCent} ct ist nicht erlaubt.`);
        if (gesehen.has(s.nennwertCent))
          f(`Der Nennwert ${eur(s.nennwertCent)} kommt doppelt vor.`);
        gesehen.add(s.nennwertCent);
        if (s.anzahl === 0 || Math.abs(s.anzahl) > ANZAHL_MAX)
          f('Die Anzahl muss ungleich 0 und höchstens 1.000.000 sein.');
        wert += s.nennwertCent * s.anzahl;
      }
      if (wert !== z.betragCent)
        f(`Die Stückelung (${eur(wert)}) passt nicht zum Betrag (${eur(z.betragCent)}).`);
    }

    if (z.steuerArt === 'keine') {
      if (z.nettoCent !== null || z.steuerCent !== null || z.steuersatz !== null)
        f('Ohne Steuerart dürfen keine Steuerwerte angegeben sein.');
    } else {
      if (z.nettoCent === null || z.steuerCent === null || z.steuersatz === null)
        f('Bei Umsatzsteuer und Vorsteuer brauchst du Netto, Steuer und Steuersatz.');
      else if (z.nettoCent + z.steuerCent !== z.betragCent)
        f('Netto und Steuer ergeben nicht den Betrag.');
    }
  });
  fehler.push(...pruefeGruppenregel(eingabe.zeilen, konten));
  if (summe !== 0)
    fehler.push(
      `Die Buchung geht nicht auf: Die Zeilen ergeben ${eur(summe)}, sie müssen zusammen 0 ergeben.`,
    );
  return fehler;
}

// ----- Plausibility warnings per account kind

/** An account with its current balance, for `saldoWarnungen`. */
export interface SaldoKonto {
  id: string;
  name: string;
  art: KontoArt;
  /** Sum of the account's own lines (Soll/Zugang positive). */
  saldoCent: number;
}

/**
 * Non-blocking warnings about the balances after a booking (lines of one account are summed first):
 * Bank below 0; Aufwand with a credit balance the booking made larger; Erlöse in the minus (Soll
 * balance) the booking made larger. Bargeld is a hard server rule, Durchlauf and Neutral never warn.
 */
export function saldoWarnungen(
  zeilen: readonly { kontoId: string; betragCent: number }[],
  konten: readonly SaldoKonto[],
): string[] {
  const aenderung = new Map<string, number>();
  for (const z of zeilen) aenderung.set(z.kontoId, (aenderung.get(z.kontoId) ?? 0) + z.betragCent);
  const warnungen: string[] = [];
  for (const [id, delta] of aenderung) {
    const k = konten.find((x) => x.id === id);
    if (!k) continue;
    const neu = k.saldoCent + delta;
    if (k.art === 'bank' && neu < 0)
      warnungen.push(`Der Kontostand von „${k.name}“ wäre danach negativ (${formatEuro(neu)}).`);
    else if (k.art === 'aufwand' && neu < 0 && delta < 0)
      warnungen.push(
        `„${k.name}“ (Aufwand) hätte danach ein Guthaben von ${formatEuro(-neu)} – das ist ungewöhnlich (z. B. Erstattung höher als die Ausgaben).`,
      );
    else if (k.art === 'erloes' && neu > 0 && delta > 0)
      warnungen.push(
        `„${k.name}“ (Erlöse) wäre danach im Minus (${formatEuro(neu)}) – das ist ungewöhnlich (z. B. Rückzahlung höher als die Einnahmen).`,
      );
  }
  return warnungen;
}

// ----- Storno

export type StornoQuelleZeile = HashZeile;

const negiert = (n: number): number => (n === 0 ? 0 : -n);
const negiertOderNull = (n: number | null): number | null => (n === null ? null : negiert(n));

/** The lines of a reversal: every amount and denomination count negated, same `pos`. */
export function stornoZeilen<Z extends StornoQuelleZeile>(original: readonly Z[]): Z[] {
  return original.map((z) => ({
    ...z,
    betragCent: negiert(z.betragCent),
    nettoCent: negiertOderNull(z.nettoCent),
    steuerCent: negiertOderNull(z.steuerCent),
    stueckelung: z.stueckelung.map((s) => ({ ...s, anzahl: negiert(s.anzahl) })),
  }));
}

// ----- Canonical form and hash chain

export interface HashZeile {
  pos: number;
  kontoId: string;
  betragCent: number;
  nettoCent: number | null;
  steuerCent: number | null;
  steuersatz: number | null;
  steuerArt: SteuerArt;
  stueckelung: readonly { nennwertCent: number; anzahl: number }[];
}

/** Everything the hash of an entry covers (without `prev_hash` and `hash` themselves). */
export interface HashBuchung {
  seq: number;
  id: string;
  datum: string;
  text: string;
  quelleTyp: string;
  quelleId: string | null;
  eventId: string | null;
  stornoVon: string | null;
  erstelltVon: string;
  /** Instant of creation; serialised as ISO UTC with milliseconds. */
  erstelltAm: string | Date;
  zeilen: readonly HashZeile[];
}

/** An entry as stored, for verifying the chain. */
export interface KettenBuchung extends HashBuchung {
  prevHash: string;
  hash: string;
}

type Kanonisch = string | number | boolean | null | Kanonisch[] | { [k: string]: Kanonisch };

/**
 * JCS-like serialisation (RFC 8785 in spirit): object keys sorted by UTF-16 code units, no
 * whitespace, strings NFC-normalised and escaped like `JSON.stringify`. Only strings, safe
 * integers, booleans, null, arrays and objects are allowed; anything else throws.
 */
export function kanonischJson(wert: unknown): string {
  if (wert === null) return 'null';
  switch (typeof wert) {
    case 'string':
      return JSON.stringify(wert.normalize('NFC'));
    case 'boolean':
      return wert ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(wert)) throw new Error(`Nicht kanonisierbare Zahl: ${wert}`);
      return String(wert === 0 ? 0 : wert);
    case 'object': {
      if (Array.isArray(wert)) return `[${wert.map(kanonischJson).join(',')}]`;
      const objekt = wert as Record<string, unknown>;
      const schluessel = Object.keys(objekt).sort();
      return `{${schluessel
        .map((k) => `${JSON.stringify(k.normalize('NFC'))}:${kanonischJson(objekt[k])}`)
        .join(',')}}`;
    }
    default:
      throw new Error(`Nicht kanonisierbarer Wert vom Typ ${typeof wert}`);
  }
}

const zeitpunkt = (t: string | Date): string => new Date(t).toISOString();

/**
 * The canonical JSON an entry is hashed with (format version 1): snake_case keys as in the
 * database, lines by `pos`, denominations by `nennwert_cent`, `belege` reserved for later slices.
 */
export function kanonisch(buchung: HashBuchung): string {
  const zeilen: Kanonisch[] = [...buchung.zeilen]
    .sort((a, b) => a.pos - b.pos)
    .map((z) => ({
      pos: z.pos,
      konto_id: z.kontoId,
      betrag_cent: z.betragCent,
      netto_cent: z.nettoCent,
      steuer_cent: z.steuerCent,
      steuersatz: z.steuersatz,
      steuer_art: z.steuerArt,
      stueckelung: [...z.stueckelung]
        .sort((a, b) => a.nennwertCent - b.nennwertCent)
        .map((s) => ({ nennwert_cent: s.nennwertCent, anzahl: s.anzahl })),
    }));
  return kanonischJson({
    v: 1,
    seq: buchung.seq,
    id: buchung.id,
    datum: buchung.datum,
    text: buchung.text,
    quelle_typ: buchung.quelleTyp,
    quelle_id: buchung.quelleId,
    event_id: buchung.eventId,
    storno_von: buchung.stornoVon,
    erstellt_von: buchung.erstelltVon,
    erstellt_am: zeitpunkt(buchung.erstelltAm),
    zeilen,
    belege: [],
  });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `SHA-256-hex(prevHash + "\n" + kanonisch(buchung))`. */
export function buchungsHash(prevHash: string, buchung: HashBuchung): Promise<string> {
  return sha256Hex(`${prevHash}\n${kanonisch(buchung)}`);
}

export type KettenFehlerArt = 'luecke' | 'prev_hash' | 'hash' | 'summe' | 'stueckelung';

export interface KettenFehler {
  seq: number;
  art: KettenFehlerArt;
}

export interface KettenErgebnis {
  anzahl: number;
  /** Hash of the last entry (`GENESIS_HASH` when empty). */
  kopfHash: string;
  /** `seq` of the last entry (0 when empty). */
  letzteSeq: number;
  fehler: KettenFehler[];
}

/**
 * Verifies entries ordered by `seq`: gapless numbering from 1 (`luecke`), `prev_hash` = hash of the
 * predecessor (`prev_hash`), the stored hash matches the recomputed one (`hash`), lines add up to 0
 * (`summe`) and the denominations of every line that has some add up to its amount (`stueckelung`).
 * The hash is recomputed with the predecessor's stored hash, so a wrong `prev_hash` is reported once.
 */
export async function pruefeKette(buchungen: readonly KettenBuchung[]): Promise<KettenErgebnis> {
  const fehler: KettenFehler[] = [];
  let erwarteteSeq = 1;
  let vorher = GENESIS_HASH;
  for (const b of buchungen) {
    if (b.seq !== erwarteteSeq) fehler.push({ seq: b.seq, art: 'luecke' });
    erwarteteSeq = b.seq + 1;
    if (b.prevHash !== vorher) fehler.push({ seq: b.seq, art: 'prev_hash' });
    if ((await buchungsHash(vorher, b)) !== b.hash) fehler.push({ seq: b.seq, art: 'hash' });
    if (b.zeilen.reduce((s, z) => s + z.betragCent, 0) !== 0)
      fehler.push({ seq: b.seq, art: 'summe' });
    if (
      b.zeilen.some(
        (z) =>
          z.stueckelung.length > 0 &&
          z.stueckelung.reduce((s, x) => s + x.nennwertCent * x.anzahl, 0) !== z.betragCent,
      )
    )
      fehler.push({ seq: b.seq, art: 'stueckelung' });
    vorher = b.hash;
  }
  const letzte = buchungen.at(-1);
  return {
    anzahl: buchungen.length,
    kopfHash: letzte ? letzte.hash : GENESIS_HASH,
    letzteSeq: letzte ? letzte.seq : 0,
    fehler,
  };
}

export const KETTEN_FEHLER_LABELS: Record<KettenFehlerArt, string> = {
  luecke: 'Nummer fehlt oder ist doppelt',
  prev_hash: 'Verweis auf die vorige Buchung stimmt nicht',
  hash: 'Inhalt passt nicht zum Hash (nachträglich verändert)',
  summe: 'Zeilen ergeben nicht 0',
  stueckelung: 'Stückelung passt nicht zum Betrag',
};

// ----- Euro input

/**
 * Parses an euro amount typed by a user into whole cent: `12,5` -> 1250, `1.234,56` -> 123456,
 * `-3` -> -300, `12.50` -> 1250; a plain number is rounded to cent. `null` when it is not a valid
 * amount with at most two decimals. A dot without comma followed by exactly three digits counts as
 * thousands separator (`1.234` = 1234 EUR).
 */
export function euroZuCent(eingabe: string | number): number | null {
  if (typeof eingabe === 'number') {
    return Number.isFinite(eingabe) ? Math.round(eingabe * 100) : null;
  }
  let t = eingabe.replaceAll('€', '').replace(/\s+/g, '');
  if (t.includes(',')) t = t.replaceAll('.', '').replace(',', '.');
  else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replaceAll('.', '');
  const m = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const betrag = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(betrag)) return null;
  return m[1] === '-' && betrag !== 0 ? -betrag : betrag;
}

/** `1250` -> `12,50`, `-5` -> `-0,05`: plain text for an input field (display: `centAnzeigen`). */
export function centZuEuroText(cent: number): string {
  const vorzeichen = cent < 0 ? '-' : '';
  const betrag = Math.abs(cent);
  return `${vorzeichen}${Math.floor(betrag / 100)},${String(betrag % 100).padStart(2, '0')}`;
}

// ----- DTOs

/** A member with the display data of `StatusName`. */
export interface FinanzMitgliedDto {
  sub: string;
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
  anrede: Anrede;
}

export interface KontoDto {
  id: string;
  name: string;
  art: KontoArt;
  parentId: string | null;
  stueckelung: boolean;
  /** Basis points, 1900 = 19 %. */
  steuersatzStandard: number | null;
  archiviert: boolean;
  /** Sum of all lines on this account (without sub accounts). */
  saldoCent: number;
  /** Own balance plus the balances of all sub accounts (equals `saldoCent` without any). */
  saldoGesamtCent: number;
}

/** Own balance plus the balances of all sub accounts, per account id. */
export function saldoGesamt(
  konten: readonly { id: string; parentId: string | null; saldoCent: number }[],
): Map<string, number> {
  const kinder = new Map<string, string[]>();
  for (const k of konten) {
    if (k.parentId) kinder.set(k.parentId, [...(kinder.get(k.parentId) ?? []), k.id]);
  }
  const eigene = new Map(konten.map((k) => [k.id, k.saldoCent]));
  const summe = (id: string, besucht: Set<string>): number => {
    if (besucht.has(id)) return 0;
    besucht.add(id);
    return (
      (eigene.get(id) ?? 0) + (kinder.get(id) ?? []).reduce((s, c) => s + summe(c, besucht), 0)
    );
  };
  return new Map(konten.map((k) => [k.id, summe(k.id, new Set())]));
}

export interface StueckelungDto {
  nennwertCent: number;
  anzahl: number;
}

export interface BuchungZeileDto {
  id: string;
  pos: number;
  kontoId: string;
  kontoName: string;
  betragCent: number;
  nettoCent: number | null;
  steuerCent: number | null;
  steuersatz: number | null;
  steuerArt: SteuerArt;
  stueckelung: StueckelungDto[];
}

export interface BuchungVerweisDto {
  id: string;
  seq: number;
}

/** An entry as the store returns it (creator still a Cognito sub). */
export interface BuchungListeEintrag {
  id: string;
  seq: number;
  datum: string;
  text: string;
  quelleTyp: string;
  eventId: string | null;
  /** The original this entry reverses. */
  stornoVon: BuchungVerweisDto | null;
  /** The reversal of this entry. */
  storniertDurch: BuchungVerweisDto | null;
  /** Sum of the positive lines, i.e. the volume of the entry. */
  betragCent: number;
  erstelltVon: string;
  erstelltAm: string;
}

export interface BuchungDetailEintrag extends BuchungListeEintrag {
  quelleId: string | null;
  prevHash: string;
  hash: string;
  zeilen: BuchungZeileDto[];
}

/** One side of a booking: the lines of one account on that side, as positive amounts. */
export interface BuchungRichtungDto {
  kontoId: string;
  kontoName: string;
  betragCent: number;
}

/** Effect of a booking on the filtered account (account statement view). */
export interface BuchungKontoDto {
  /** Signed sum of the account's lines in this booking. */
  betragCent: number;
  /** Running balance of the account after this booking, by journal order (`seq`). */
  saldoNachCent: number;
}

/** A journal list entry as the store returns it: with direction of money. */
export interface JournalEintrag extends BuchungListeEintrag {
  /** Accounts the money leaves (negative lines), per account. */
  abgang: BuchungRichtungDto[];
  /** Accounts the money enters (positive lines), per account. */
  zugang: BuchungRichtungDto[];
  /** Only set when the query filters by account. */
  konto: BuchungKontoDto | null;
}

export interface BuchungListeDto extends Omit<JournalEintrag, 'erstelltVon'> {
  /** Null if the creator's account no longer exists. */
  erstelltVon: FinanzMitgliedDto | null;
}

export interface BuchungDetailDto extends Omit<BuchungDetailEintrag, 'erstelltVon'> {
  erstelltVon: FinanzMitgliedDto | null;
}

/** `GET /api/finanzen/buchungen`: all matches, newest first, at most `JOURNAL_MAX`. */
export interface BuchungenSeiteDto {
  buchungen: BuchungListeDto[];
  /** More bookings matched than returned: only the newest `JOURNAL_MAX` are in the list. */
  gekappt: boolean;
}

/** `GET /api/finanzen/kette`. */
export interface KettenErgebnisDto extends KettenErgebnis {
  /** `fin_zaehler` 'journal': last `seq` and hash; must match the last entry. */
  zaehlerWert: number;
  zaehlerHash: string;
  zaehlerPasst: boolean;
  /** No errors and the counter matches. */
  ok: boolean;
  geprueftAm: string;
}
