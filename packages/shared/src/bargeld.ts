import { z } from 'zod';
import {
  ANZAHL_MAX,
  finanzDatumSchema,
  formatEuro,
  idempotenzSchluessel,
  NENNWERTE_CENT,
  type BuchungVerweisDto,
  type FinanzMitgliedDto,
  type KontoArt,
  type StueckelungDto,
} from './finanzen';

// Finanzen / Bargeld: Safe with Fächer (sub accounts with a Stückelung), stock rules and the Zählung
// (cash count with a difference booking). Pure functions only, see docs/finanzen.md.

/** Fixed id of the account the differences of a Zählung are booked on (migration 0157). */
export const KASSENDIFFERENZ_KONTO_ID = 'kassendifferenz';
/** Fixed id of the Safe, the parent of the Fächer. */
export const SAFE_KONTO_ID = 'safe';
/** The Zählungen list returns at most this many entries (the newest ones). */
export const ZAEHLUNGEN_MAX = 2000;

/** Count per denomination, keyed by `nennwertCent`; missing = 0. */
export type Anzahlen = ReadonlyMap<number, number>;

/** `[{nennwertCent, anzahl}]` -> map; counts of the same denomination add up. */
export function anzahlenAus(stueckelung: readonly StueckelungDto[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of stueckelung) m.set(s.nennwertCent, (m.get(s.nennwertCent) ?? 0) + s.anzahl);
  return m;
}

/** Value of a Stückelung in cent. */
export const stueckelungSumme = (stueckelung: readonly StueckelungDto[]): number =>
  stueckelung.reduce((s, x) => s + x.nennwertCent * x.anzahl, 0);

/** All 13 denominations, ascending, with the count from `anzahlen` (0 when missing). */
export const stueckelungVollstaendig = (anzahlen: Anzahlen): StueckelungDto[] =>
  NENNWERTE_CENT.map((n) => ({ nennwertCent: n, anzahl: anzahlen.get(n) ?? 0 }));

// ----- Stock rule

/** An account as the stock rule needs it: current balance and count per denomination. */
export interface BestandKonto {
  id: string;
  name: string;
  art: KontoArt;
  stueckelung: boolean;
  saldoCent: number;
  anzahl: Anzahlen;
}

export interface BestandZeile {
  kontoId: string;
  betragCent: number;
  stueckelung?: readonly StueckelungDto[] | null;
}

const kontoWort = (k: BestandKonto) => (k.stueckelung ? 'Fach' : 'Konto');

/**
 * Stock rule: after the lines, no Bargeld account may have a negative balance and no
 * denomination of a Stückelung account a negative count. Lines on the same account are summed
 * first (Wechseln). Returns German messages, empty = fine. Accounts without stock info are skipped.
 */
export function pruefeBestand(
  zeilen: readonly BestandZeile[],
  bestand: readonly BestandKonto[],
): string[] {
  const nachId = new Map(bestand.map((k) => [k.id, k]));
  const betrag = new Map<string, number>();
  const anzahl = new Map<string, Map<number, number>>();
  for (const z of zeilen) {
    betrag.set(z.kontoId, (betrag.get(z.kontoId) ?? 0) + z.betragCent);
    const m = anzahl.get(z.kontoId) ?? new Map<number, number>();
    for (const s of z.stueckelung ?? [])
      m.set(s.nennwertCent, (m.get(s.nennwertCent) ?? 0) + s.anzahl);
    anzahl.set(z.kontoId, m);
  }
  const fehler: string[] = [];
  for (const [kontoId, delta] of betrag) {
    const k = nachId.get(kontoId);
    if (!k || k.art !== 'bargeld') continue;
    let nennwertFehler = false;
    if (k.stueckelung) {
      for (const [nennwert, d] of [...(anzahl.get(kontoId) ?? [])].sort((a, b) => a[0] - b[0])) {
        const vorhanden = k.anzahl.get(nennwert) ?? 0;
        if (vorhanden + d >= 0) continue;
        nennwertFehler = true;
        fehler.push(
          vorhanden <= 0
            ? `Im ${kontoWort(k)} „${k.name}“ gibt es keine ${formatEuro(nennwert)}.`
            : `Im ${kontoWort(k)} „${k.name}“ sind nur ${vorhanden} × ${formatEuro(nennwert)} vorhanden.`,
        );
      }
    }
    if (!nennwertFehler && k.saldoCent + delta < 0)
      fehler.push(`Im ${kontoWort(k)} „${k.name}“ sind nur ${formatEuro(k.saldoCent)} vorhanden.`);
  }
  return fehler;
}

// ----- Zählung

/** One denomination of a Zählung. */
export interface ZaehlPosten {
  nennwertCent: number;
  sollAnzahl: number;
  istAnzahl: number;
  /** `istAnzahl - sollAnzahl`. */
  differenzAnzahl: number;
}

/** A line of the difference booking. */
export interface ZaehlZeile {
  kontoId: string;
  betragCent: number;
  stueckelung: StueckelungDto[];
}

export interface ZaehlErgebnis {
  /** All 13 denominations. */
  posten: ZaehlPosten[];
  sollCent: number;
  istCent: number;
  /** `istCent - sollCent`. */
  differenzCent: number;
  /**
   * The difference booking: surplus denominations on one Fach line, missing ones on another, and
   * `kassendifferenz` with the opposite of the net difference. Empty when nothing differs.
   */
  zeilen: ZaehlZeile[];
}

/** Compares the count (`ist`) with the stock (`soll`) of a Fach and derives the difference booking. */
export function berechneZaehlung(
  fachId: string,
  soll: readonly StueckelungDto[],
  ist: readonly StueckelungDto[],
): ZaehlErgebnis {
  const sollM = anzahlenAus(soll);
  const istM = anzahlenAus(ist);
  const posten: ZaehlPosten[] = NENNWERTE_CENT.map((n) => {
    const s = sollM.get(n) ?? 0;
    const i = istM.get(n) ?? 0;
    return { nennwertCent: n, sollAnzahl: s, istAnzahl: i, differenzAnzahl: i - s };
  });
  const mehr = posten
    .filter((p) => p.differenzAnzahl > 0)
    .map((p) => ({ nennwertCent: p.nennwertCent, anzahl: p.differenzAnzahl }));
  const weniger = posten
    .filter((p) => p.differenzAnzahl < 0)
    .map((p) => ({ nennwertCent: p.nennwertCent, anzahl: p.differenzAnzahl }));
  const sollCent = stueckelungSumme(soll);
  const istCent = stueckelungSumme(ist);
  const differenzCent = istCent - sollCent;
  const zeilen: ZaehlZeile[] = [];
  if (mehr.length > 0)
    zeilen.push({ kontoId: fachId, betragCent: stueckelungSumme(mehr), stueckelung: mehr });
  if (weniger.length > 0)
    zeilen.push({ kontoId: fachId, betragCent: stueckelungSumme(weniger), stueckelung: weniger });
  if (differenzCent !== 0)
    zeilen.push({ kontoId: KASSENDIFFERENZ_KONTO_ID, betragCent: -differenzCent, stueckelung: [] });
  return { posten, sollCent, istCent, differenzCent, zeilen };
}

/** Booking text of a Zählung without a text of the user. */
export const zaehlungBuchungstext = (fachName: string, differenzCent: number): string =>
  differenzCent === 0
    ? `Zählung ${fachName}: Stückelung korrigiert`
    : `Zählung ${fachName}: Differenz ${differenzCent > 0 ? '+' : ''}${formatEuro(differenzCent)}`;

/** Body of `POST /api/finanzen/zaehlungen`. */
export const zaehlungEingabeSchema = z.object({
  idempotenzSchluessel,
  kontoId: z.string('Bitte wähle ein Fach.').min(1, 'Bitte wähle ein Fach.'),
  datum: finanzDatumSchema,
  text: z
    .string()
    .trim()
    .max(500, 'Höchstens 500 Zeichen erlaubt.')
    .nullish()
    .transform((v) => v || null),
  /** The counted amounts; denominations that are not listed count as 0. */
  ist: z
    .array(
      z.object({
        nennwertCent: z
          .number('Bitte gib einen Nennwert an.')
          .refine(
            (n) => (NENNWERTE_CENT as readonly number[]).includes(n),
            'Unzulässiger Nennwert.',
          ),
        anzahl: z
          .number('Bitte gib eine Anzahl an.')
          .int('Die Anzahl muss eine ganze Zahl sein.')
          .min(0, 'Die Anzahl darf nicht negativ sein.')
          .max(ANZAHL_MAX, 'Die Anzahl ist zu groß.'),
      }),
      'Bitte gib die gezählten Mengen an.',
    )
    .max(NENNWERTE_CENT.length)
    .refine(
      (ist) => new Set(ist.map((i) => i.nennwertCent)).size === ist.length,
      'Jeder Nennwert darf nur einmal vorkommen.',
    ),
});
export type ZaehlungEingabe = z.output<typeof zaehlungEingabeSchema>;
export type ZaehlungEingabeInput = z.input<typeof zaehlungEingabeSchema>;

/** Query of `GET /api/finanzen/zaehlungen`. */
export const zaehlungenAbfrageSchema = z.object({ kontoId: z.string().min(1).optional() });

// ----- DTOs

/** One Fach in the Bargeld overview. */
export interface BargeldFachDto {
  id: string;
  name: string;
  saldoCent: number;
  /** All 13 denominations with the current count. */
  bestand: StueckelungDto[];
}

/** `GET /api/finanzen/bargeld`. */
export interface BargeldUebersichtDto {
  faecher: BargeldFachDto[];
  /** All 13 denominations summed over all Fächer. */
  summeBestand: StueckelungDto[];
  summeCent: number;
}

/** Response of `POST /api/finanzen/zaehlungen`. */
export interface ZaehlungErgebnisDto {
  id: string;
  /** The difference booking; null when nothing differed. */
  buchungId: string | null;
  buchungSeq: number | null;
  differenzCent: number;
  /** True when the idempotency key was already used: the existing Zählung is returned. */
  wiederholt?: boolean;
}

/** A Zählung as the store returns it (counter still a Cognito sub). */
export interface ZaehlungListeEintrag {
  id: string;
  kontoId: string;
  kontoName: string;
  datum: string;
  gezaehltVon: string;
  gezaehltAm: string;
  sollCent: number;
  istCent: number;
  differenzCent: number;
  buchung: BuchungVerweisDto | null;
}

export interface ZaehlungDetailEintrag extends ZaehlungListeEintrag {
  text: string | null;
  /** All 13 denominations. */
  posten: ZaehlPosten[];
}

export interface ZaehlungListeDto extends Omit<ZaehlungListeEintrag, 'gezaehltVon'> {
  gezaehltVon: FinanzMitgliedDto | null;
}

export interface ZaehlungDetailDto extends Omit<ZaehlungDetailEintrag, 'gezaehltVon'> {
  gezaehltVon: FinanzMitgliedDto | null;
}

/** `GET /api/finanzen/zaehlungen`: newest first, at most `ZAEHLUNGEN_MAX`. */
export interface ZaehlungenSeiteDto {
  zaehlungen: ZaehlungListeDto[];
  gekappt: boolean;
}
