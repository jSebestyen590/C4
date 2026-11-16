import { z } from 'zod';
import { jahrBerlin } from './trichter';
import { finanzDatumSchema, idempotenzSchluessel, type FinanzMitgliedDto } from './finanzen';
import { MITGLIED_STATI, type MitgliedStatus } from './status';

// Das Buch (Strichliste): a sub-ledger without journal bookings (see docs/buch.md). Every entry
// changes the balance of one page by `betragCent`; a negative balance is debt. Entries are only
// ever inserted, a correction is a Storno entry with negated values.

/** Largest number of pages in one Abrechnung. */
export const BUCH_ZEILEN_MAX = 500;
const STRICHE_MAX = 10_000;
const CENT_MAX = 100_000_00;

// ----- Pure logic

/** A valid-from price list entry of one status. `gueltigAb` and `erstelltAm` order the entries. */
export interface BuchTarif {
  status: MitgliedStatus;
  strichwertCent: number;
  maxUeberzugCent: number;
  /** `YYYY-MM-DD`. */
  gueltigAb: string;
  /** ISO timestamp; breaks ties of equal `gueltigAb`. */
  erstelltAm: string;
}

/** The tarif that applies to `status` on `datum` (`YYYY-MM-DD`): latest `gueltigAb` not after it. */
export function gueltigerTarif<T extends BuchTarif>(
  tarife: readonly T[],
  status: MitgliedStatus,
  datum: string,
): T | null {
  let beste: T | null = null;
  for (const t of tarife) {
    if (t.status !== status || t.gueltigAb > datum) continue;
    if (
      !beste ||
      t.gueltigAb > beste.gueltigAb ||
      (t.gueltigAb === beste.gueltigAb && t.erstelltAm > beste.erstelltAm)
    ) {
      beste = t;
    }
  }
  return beste;
}

export interface BuchWerte {
  striche: number;
  strichwertCent: number;
  barCent: number;
  abzahlungCent: number;
}

/** Effect of an entry on the balance: payments in, Striche and Bar (charged to the book) out. */
export const eintragWirkungCent = (w: BuchWerte): number =>
  w.abzahlungCent - w.striche * w.strichwertCent - w.barCent;

export const saldoCent = (eintraege: readonly { betragCent: number }[]): number =>
  eintraege.reduce((summe, e) => summe + e.betragCent, 0);

/** Whether the balance is below the allowed overdraft. */
export const istUeberzug = (saldo: number, maxUeberzugCent: number): boolean =>
  saldo < -maxUeberzugCent;

/** The entry that reverses `e`: all values negated, same Strichwert. */
export const stornoWerte = (e: BuchWerte): BuchWerte => ({
  striche: -e.striche,
  strichwertCent: e.strichwertCent,
  barCent: -e.barCent,
  abzahlungCent: -e.abzahlungCent,
});

export interface BuchRanglisteEintrag {
  /** Who the row belongs to: `sub:<sub>` of a member or `extern:<seiteId>`. */
  schluessel: string;
  erstelltAm: string | Date;
  striche: number;
  strichwertCent: number;
  barCent: number;
}

export interface BuchRanglisteZeile {
  schluessel: string;
  /** Striche x Strichwert plus Bar in cent (payments do not count). */
  umsatzCent: number;
  striche: number;
}

/** Years that have at least one entry, newest first. */
export const buchJahre = (eintraege: readonly { erstelltAm: string | Date }[]): number[] =>
  [...new Set(eintraege.map((e) => jahrBerlin(e.erstelltAm)))].sort((a, b) => b - a);

/** Turnover per page owner, optionally for one calendar year (Berlin; `null` = all). Highest first. */
export function buchRangliste(
  eintraege: readonly BuchRanglisteEintrag[],
  jahr: number | null,
): BuchRanglisteZeile[] {
  const zeilen = new Map<string, BuchRanglisteZeile>();
  for (const e of eintraege) {
    if (jahr !== null && jahrBerlin(e.erstelltAm) !== jahr) continue;
    const z = zeilen.get(e.schluessel) ?? { schluessel: e.schluessel, umsatzCent: 0, striche: 0 };
    z.umsatzCent += e.striche * e.strichwertCent + e.barCent;
    z.striche += e.striche;
    zeilen.set(e.schluessel, z);
  }
  return [...zeilen.values()]
    .filter((z) => z.umsatzCent !== 0 || z.striche !== 0)
    .sort(
      (a, b) =>
        b.umsatzCent - a.umsatzCent ||
        b.striche - a.striche ||
        a.schluessel.localeCompare(b.schluessel),
    );
}

// ----- Schemas

export const buchSeiteEingabeSchema = z
  .object({
    nummer: z
      .number('Bitte gib eine Nummer an.')
      .int('Die Nummer muss eine ganze Zahl sein.')
      .min(1, 'Die Nummer muss mindestens 1 sein.')
      .max(9999, 'Die Nummer darf höchstens 9999 sein.'),
    mitgliedSub: z.string().min(1).nullish(),
    externName: z
      .string()
      .trim()
      .max(100, 'Höchstens 100 Zeichen erlaubt.')
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .refine((v) => !!v.mitgliedSub !== !!v.externName, {
    message: 'Bitte wähle entweder ein Mitglied oder gib einen externen Namen an.',
    path: ['mitgliedSub'],
  })
  .transform((v) => ({
    nummer: v.nummer,
    mitgliedSub: v.mitgliedSub || null,
    externName: v.externName,
  }));
export type BuchSeiteEingabe = z.output<typeof buchSeiteEingabeSchema>;

export const buchTarifEingabeSchema = z.object({
  status: z.enum(MITGLIED_STATI, 'Bitte wähle einen Status.'),
  strichwertCent: z
    .number('Bitte gib einen Strichwert an.')
    .int('Der Strichwert muss ganze Cent sein.')
    .min(1, 'Der Strichwert muss größer als 0 sein.')
    .max(CENT_MAX, 'Der Strichwert ist zu hoch.'),
  maxUeberzugCent: z
    .number('Bitte gib den maximalen Überzug an.')
    .int('Der Überzug muss ganze Cent sein.')
    .min(0, 'Der maximale Überzug darf nicht negativ sein.')
    .max(CENT_MAX, 'Der maximale Überzug ist zu hoch.'),
  gueltigAb: finanzDatumSchema,
});
export type BuchTarifEingabe = z.output<typeof buchTarifEingabeSchema>;

const zahl = (feld: string, max: number) =>
  z
    .number(`Bitte gib ${feld} an.`)
    .int(`${feld[0]?.toUpperCase()}${feld.slice(1)} muss eine ganze Zahl sein.`)
    .min(0, 'Der Wert darf nicht negativ sein.')
    .max(max, 'Der Wert ist zu hoch.');

export const buchZeileSchema = z.object({
  seiteId: z.string().min(1, 'Die Buchseite fehlt.'),
  striche: zahl('die Striche', STRICHE_MAX),
  barCent: zahl('den Bar-Betrag', CENT_MAX),
  abzahlungCent: zahl('die Abzahlung', CENT_MAX),
});
export type BuchZeile = z.output<typeof buchZeileSchema>;

export const buchAbrechnungEingabeSchema = z.object({
  idempotenzSchluessel,
  zeilen: z
    .array(buchZeileSchema, 'Bitte gib die Zeilen an.')
    .max(BUCH_ZEILEN_MAX, `Höchstens ${BUCH_ZEILEN_MAX} Zeilen erlaubt.`)
    .refine(
      (z) => new Set(z.map((x) => x.seiteId)).size === z.length,
      'Jede Seite darf nur einmal vorkommen.',
    ),
});
export type BuchAbrechnungEingabe = z.output<typeof buchAbrechnungEingabeSchema>;

export const buchStornoSchema = z.object({
  idempotenzSchluessel,
  text: z
    .string('Bitte gib eine Begründung für das Storno an.')
    .trim()
    .min(1, 'Bitte gib eine Begründung für das Storno an.')
    .max(500, 'Höchstens 500 Zeichen erlaubt.'),
});
export type BuchStornoEingabe = z.output<typeof buchStornoSchema>;

/** Whether a row of an Abrechnung has any value (empty rows are ignored). */
export const buchZeileLeer = (z: { striche: number; barCent: number; abzahlungCent: number }) =>
  z.striche === 0 && z.barCent === 0 && z.abzahlungCent === 0;

// ----- DTOs

export interface BuchTarifDto {
  id: string;
  status: MitgliedStatus;
  strichwertCent: number;
  maxUeberzugCent: number;
  gueltigAb: string;
  erstelltAm: string;
}

export interface BuchEintragDto {
  id: string;
  abrechnungId: string | null;
  /** This entry reverses the entry with the given id. */
  stornoVon: string | null;
  /** The entry has been reversed (by another entry). */
  storniert: boolean;
  striche: number;
  strichwertCent: number;
  barCent: number;
  abzahlungCent: number;
  /** Effect on the balance. */
  betragCent: number;
  text: string | null;
  erstelltAm: string;
  erstelltVon: FinanzMitgliedDto | null;
}

export interface BuchSeiteDto {
  id: string;
  nummer: number;
  mitglied: FinanzMitgliedDto | null;
  externName: string | null;
  archiviert: boolean;
  saldoCent: number;
  /** The tarif valid today for the page's status; null when none is set. */
  tarif: { strichwertCent: number; maxUeberzugCent: number } | null;
  ueberzug: boolean;
}

export interface BuchSeiteDetailDto extends BuchSeiteDto {
  /** Newest first. */
  verlauf: BuchEintragDto[];
}

/** `GET /api/buch/meine`. */
export interface BuchMeineDto {
  seiten: BuchSeiteDetailDto[];
}

export interface BuchRanglisteZeileDto {
  mitglied: FinanzMitgliedDto | null;
  externName: string | null;
  umsatzCent: number;
  striche: number;
}

/** `GET /api/buch/rangliste`. */
export interface BuchRanglisteDto {
  aktuellesJahr: number;
  /** Echo of the filter: a year or null for all entries. */
  jahr: number | null;
  rangliste: BuchRanglisteZeileDto[];
  /** Years with entries, newest first. */
  jahre: number[];
}

export interface BuchAbrechnungErgebnisDto {
  id: string;
  eintraege: number;
  /** Pages of this Abrechnung that are over the allowed overdraft now. */
  ueberzug: { seiteId: string; nummer: number; saldoCent: number }[];
  /** True when the idempotency key was already used: the existing Abrechnung is returned. */
  wiederholt?: boolean;
}

/** Open Buch balance of a member, shown in the Deaktivieren preview. */
export interface BuchOffenDto {
  seiteId: string;
  nummer: number;
  saldoCent: number;
}
