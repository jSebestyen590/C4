import { z } from 'zod';
import { heuteBerlin, monateVerschieben } from './datum';
import { betragCsv, csvFeld } from './finanzenDatenexport';
import {
  EUER_ZEILEN,
  EUER_ZEILEN_WERTE,
  UST_FINANZAMT_KONTO_ID,
  euerZeileSeite,
  type EuerSeite,
  type EuerZeile,
} from './finanzenEuer';
import { finanzDatumSchema, type KontoArt, type SteuerArt } from './finanzen';
import { steuersaetzeAm, type SteuersatzZeitraum } from './steuersaetze';
import {
  EINHEIT_LABELS,
  bestandAnzeigen,
  basisGebinde,
  gebindeNameOhnePfand,
  inBasiseinheiten,
  pfandGesamtCent,
  type Einheit,
  type Gebinde,
} from './waren';

// Auswertungen (see docs/finanzen.md „Auswertungen“): USt, G+V, EÜR, Event-Einnahmen and Einkauf.
// The API store delivers raw rows, all calculation is done here (pure functions, shared by the real
// store, the fake and the CSV export in the browser). Money is whole cents. The date basis is the
// Buchungsdatum (Ist-Prinzip); Stornos are plain bookings with their own date and cancel out.

// ----- Zeiträume

export const AUSWERTUNG_INTERVALLE = ['monat', 'quartal', 'jahr'] as const;
export type AuswertungIntervall = (typeof AUSWERTUNG_INTERVALLE)[number];

export const AUSWERTUNG_INTERVALL_LABELS: Record<AuswertungIntervall, string> = {
  monat: 'Monat',
  quartal: 'Quartal',
  jahr: 'Jahr',
};

const MONATSNAMEN = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

/** Key of the period a date (`YYYY-MM-DD`) falls in: `2027-03`, `2027-Q1` or `2027`. */
export function zeitraumSchluessel(datum: string, intervall: AuswertungIntervall): string {
  const jahr = datum.slice(0, 4);
  if (intervall === 'jahr') return jahr;
  const monat = Number(datum.slice(5, 7));
  if (intervall === 'quartal') return `${jahr}-Q${Math.ceil(monat / 3)}`;
  return `${jahr}-${String(monat).padStart(2, '0')}`;
}

/** German label of a period key: `März 2027`, `1. Quartal 2027`, `2027`. */
export function zeitraumLabel(schluessel: string): string {
  const [jahr = '', rest] = schluessel.split('-');
  if (rest === undefined) return jahr;
  if (rest.startsWith('Q')) return `${rest.slice(1)}. Quartal ${jahr}`;
  return `${MONATSNAMEN[Number(rest) - 1] ?? rest} ${jahr}`;
}

export interface AuswertungZeitraumDto {
  schluessel: string;
  label: string;
}

/** All periods from the one of `von` to the one of `bis`, without gaps (also empty periods). */
export function zeitraeumeZwischen(
  von: string,
  bis: string,
  intervall: AuswertungIntervall,
): AuswertungZeitraumDto[] {
  const ergebnis: AuswertungZeitraumDto[] = [];
  let tag = `${von.slice(0, 7)}-01`;
  while (tag <= bis) {
    const schluessel = zeitraumSchluessel(tag, intervall);
    if (ergebnis[ergebnis.length - 1]?.schluessel !== schluessel)
      ergebnis.push({ schluessel, label: zeitraumLabel(schluessel) });
    tag = monateVerschieben(tag, 1);
  }
  return ergebnis;
}

/** Longest range of an evaluation: ten years. */
export const AUSWERTUNG_MAX_MONATE = 120;

// Refinements run even when a date failed its own check; skip them then.
const datumsPaarOk = (v: { von: string; bis: string }): boolean =>
  finanzDatumSchema.safeParse(v.von).success && finanzDatumSchema.safeParse(v.bis).success;

/** Query of the USt, G+V and Events evaluations. */
export const auswertungZeitraumSchema = z
  .object({
    von: finanzDatumSchema,
    bis: finanzDatumSchema,
    intervall: z.enum(AUSWERTUNG_INTERVALLE, 'Bitte wähle ein Intervall.').default('monat'),
  })
  .refine((v) => !datumsPaarOk(v) || v.von <= v.bis, {
    message: 'Das Von-Datum liegt nach dem Bis-Datum.',
    path: ['bis'],
  })
  .refine((v) => !datumsPaarOk(v) || v.bis < monateVerschieben(v.von, AUSWERTUNG_MAX_MONATE), {
    message: 'Der Zeitraum darf höchstens zehn Jahre umfassen.',
    path: ['bis'],
  });
export type AuswertungZeitraumQuery = z.output<typeof auswertungZeitraumSchema>;

/** Query of the EÜR and Einkauf evaluations. */
export const auswertungJahrSchema = z.object({
  jahr: z.coerce
    .number('Bitte gib ein Jahr an.')
    .int('Bitte gib ein gültiges Jahr an.')
    .min(2000, 'Bitte gib ein gültiges Jahr an.')
    .max(2100, 'Bitte gib ein gültiges Jahr an.'),
});
export type AuswertungJahrQuery = z.output<typeof auswertungJahrSchema>;

/** First and last day of a calendar year. */
export const jahrGrenzen = (jahr: number): { von: string; bis: string } => ({
  von: `${jahr}-01-01`,
  bis: `${jahr}-12-31`,
});

// ----- Raw rows

/** One journal line with the data of its Buchung (the store joins `fin_buchungszeilen` and `fin_buchungen`). */
export interface AuswertungZeile {
  buchungId: string;
  /** Buchungsdatum, `YYYY-MM-DD`. */
  datum: string;
  quelleTyp: string;
  eventId: string | null;
  stornoVon: string | null;
  kontoId: string;
  betragCent: number;
  /** NULL without tax: then `betragCent` is the net amount. */
  nettoCent: number | null;
  steuerCent: number | null;
  steuersatz: number | null;
  steuerArt: SteuerArt;
}

/** The accounts the G+V and EÜR need. */
export interface AuswertungKonto {
  id: string;
  name: string;
  art: KontoArt;
  parentId: string | null;
  euerZeile: EuerZeile | null;
}

const nettoVon = (z: Pick<AuswertungZeile, 'nettoCent' | 'betragCent'>): number =>
  z.nettoCent ?? z.betragCent;

/** Rounds half away from zero. */
const runde = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x));

const summiere = (zahlen: Iterable<number>): number => {
  let s = 0;
  for (const z of zahlen) s += z;
  return s;
};

// ----- USt

export type UstSatzArt = 'regel' | 'ermaessigt' | 'sonstige';

export interface UstSatzZeileDto {
  /** Basis points (1900 = 19 %). */
  satz: number;
  /** `sonstige` (0 %, old rates) is not part of Kz 81 / 86. */
  art: UstSatzArt;
  bemessungCent: number;
  ustCent: number;
  vorsteuerCent: number;
  /** USt minus Vorsteuer. */
  zahllastCent: number;
}

/** UStVA figures of a period to type into ELSTER. */
export interface UstKennzahlenDto {
  /** Kz 81: Bemessung at the regular rate, whole euros rounded down. */
  kz81Euro: number;
  /** Kz 86: Bemessung at the reduced rate, whole euros rounded down. */
  kz86Euro: number;
  /** Kz 66: Vorsteuer in cents. */
  kz66Cent: number;
  /** Kz 83: USt minus Vorsteuer in cents. */
  kz83Cent: number;
}

export interface UstZeitraumDto extends AuswertungZeitraumDto {
  zeilen: UstSatzZeileDto[];
  kennzahlen: UstKennzahlenDto;
  /** Net balance of the account `ust-finanzamt` in the period (payments minus refunds), for comparison with Kz 83. */
  vorauszahlungCent: number;
}

export interface UstAuswertungDto {
  von: string;
  bis: string;
  intervall: AuswertungIntervall;
  zeitraeume: UstZeitraumDto[];
}

/**
 * USt per period and rate: Bemessung = −Σ net of the `ust` lines, USt = −Σ tax of them, Vorsteuer = Σ tax
 * of the `vorsteuer` lines. The rate is assigned to Kz 81 / 86 via the rates valid on the Buchungsdatum.
 */
export function ustAuswertung(
  zeilen: readonly AuswertungZeile[],
  von: string,
  bis: string,
  intervall: AuswertungIntervall,
  saetze: readonly Pick<SteuersatzZeitraum, 'ab' | 'regel' | 'ermaessigt'>[],
): UstAuswertungDto {
  const perioden = zeitraeumeZwischen(von, bis, intervall);
  const jeZeitraum = new Map(
    perioden.map((p) => [p.schluessel, { zeilen: new Map<number, UstSatzZeileDto>(), voraus: 0 }]),
  );
  for (const z of zeilen) {
    const ziel = jeZeitraum.get(zeitraumSchluessel(z.datum, intervall));
    if (!ziel) continue;
    if (z.kontoId === UST_FINANZAMT_KONTO_ID) ziel.voraus += z.betragCent;
    if (z.steuerArt === 'keine') continue;
    const satz = z.steuersatz ?? 0;
    const am = steuersaetzeAm(saetze, z.datum);
    const art: UstSatzArt =
      satz === am.regel ? 'regel' : satz === am.ermaessigt ? 'ermaessigt' : 'sonstige';
    let zeile = ziel.zeilen.get(satz);
    if (!zeile) {
      zeile = { satz, art, bemessungCent: 0, ustCent: 0, vorsteuerCent: 0, zahllastCent: 0 };
      ziel.zeilen.set(satz, zeile);
    }
    // A rate can be Regelsatz on one day and „sonstige“ on another: the row keeps the first Art, the
    // Kz sums below look at the single lines.
    if (z.steuerArt === 'ust') {
      zeile.bemessungCent -= nettoVon(z);
      zeile.ustCent -= z.steuerCent ?? 0;
    } else zeile.vorsteuerCent += z.steuerCent ?? 0;
  }
  const kz = new Map<string, { kz81: number; kz86: number }>();
  for (const z of zeilen) {
    if (z.steuerArt !== 'ust') continue;
    const schluessel = zeitraumSchluessel(z.datum, intervall);
    if (!jeZeitraum.has(schluessel)) continue;
    const am = steuersaetzeAm(saetze, z.datum);
    const satz = z.steuersatz ?? 0;
    const k = kz.get(schluessel) ?? { kz81: 0, kz86: 0 };
    if (satz === am.regel) k.kz81 -= nettoVon(z);
    else if (satz === am.ermaessigt) k.kz86 -= nettoVon(z);
    kz.set(schluessel, k);
  }
  return {
    von,
    bis,
    intervall,
    zeitraeume: perioden.map((p) => {
      const ziel = jeZeitraum.get(p.schluessel)!;
      const rows = [...ziel.zeilen.values()]
        .map((r) => ({ ...r, zahllastCent: r.ustCent - r.vorsteuerCent }))
        .sort((a, b) => b.satz - a.satz);
      const k = kz.get(p.schluessel) ?? { kz81: 0, kz86: 0 };
      const ust = summiere(rows.map((r) => r.ustCent));
      const vorsteuer = summiere(rows.map((r) => r.vorsteuerCent));
      return {
        ...p,
        zeilen: rows,
        kennzahlen: {
          kz81Euro: Math.floor(k.kz81 / 100),
          kz86Euro: Math.floor(k.kz86 / 100),
          kz66Cent: vorsteuer,
          kz83Cent: ust - vorsteuer,
        },
        vorauszahlungCent: ziel.voraus,
      };
    }),
  };
}

// ----- G+V

export interface GuvKontoZeileDto {
  kontoId: string;
  name: string;
  art: 'erloes' | 'aufwand';
  /** Indentation depth by `parent_id` (0 = top level). */
  ebene: number;
  /** Net per period, positive for Erlöse and Aufwand alike; parents include their sub accounts. */
  werteCent: number[];
  summeCent: number;
}

export interface GuvSummenDto {
  erloeseCent: number[];
  aufwandCent: number[];
  ergebnisCent: number[];
}

export interface GuvAuswertungDto {
  von: string;
  bis: string;
  intervall: AuswertungIntervall;
  zeitraeume: AuswertungZeitraumDto[];
  erloese: GuvKontoZeileDto[];
  aufwand: GuvKontoZeileDto[];
  /** Per period. */
  summen: GuvSummenDto;
  /** Whole range. */
  gesamt: { erloeseCent: number; aufwandCent: number; ergebnisCent: number };
}

/** Konten in tree order (children under their parent, by name) with their depth. */
function baumReihenfolge(
  konten: readonly AuswertungKonto[],
): { konto: AuswertungKonto; ebene: number }[] {
  const ids = new Set(konten.map((k) => k.id));
  const kinder = new Map<string | null, AuswertungKonto[]>();
  for (const k of konten) {
    const eltern = k.parentId && ids.has(k.parentId) ? k.parentId : null;
    kinder.set(eltern, [...(kinder.get(eltern) ?? []), k]);
  }
  const ergebnis: { konto: AuswertungKonto; ebene: number }[] = [];
  const besuche = (eltern: string | null, ebene: number) => {
    for (const k of (kinder.get(eltern) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
      ergebnis.push({ konto: k, ebene });
      besuche(k.id, ebene + 1);
    }
  };
  besuche(null, 0);
  return ergebnis;
}

/** G+V per account and period: net (`netto_cent ?? betrag_cent`), Erlöse shown positive. */
export function guvAuswertung(
  zeilen: readonly AuswertungZeile[],
  konten: readonly AuswertungKonto[],
  von: string,
  bis: string,
  intervall: AuswertungIntervall,
): GuvAuswertungDto {
  const perioden = zeitraeumeZwischen(von, bis, intervall);
  const spalte = new Map(perioden.map((p, i) => [p.schluessel, i]));
  const guv = konten.filter((k) => k.art === 'erloes' || k.art === 'aufwand');
  const art = new Map(guv.map((k) => [k.id, k.art]));
  // Raw net sums per account and period.
  const roh = new Map<string, number[]>();
  const beruehrt = new Set<string>();
  for (const z of zeilen) {
    const i = spalte.get(zeitraumSchluessel(z.datum, intervall));
    if (i === undefined || !art.has(z.kontoId)) continue;
    const werte = roh.get(z.kontoId) ?? perioden.map(() => 0);
    werte[i]! += nettoVon(z);
    roh.set(z.kontoId, werte);
    beruehrt.add(z.kontoId);
  }
  // Accounts with lines plus their ancestors.
  const nachId = new Map(guv.map((k) => [k.id, k]));
  const sichtbar = new Set<string>();
  for (const id of beruehrt) {
    for (
      let k = nachId.get(id);
      k && !sichtbar.has(k.id);
      k = k.parentId ? nachId.get(k.parentId) : undefined
    )
      sichtbar.add(k.id);
  }
  const zeileFuer = (a: 'erloes' | 'aufwand'): GuvKontoZeileDto[] => {
    const liste = guv.filter((k) => k.art === a && sichtbar.has(k.id));
    const rollup = (id: string): number[] => {
      const werte = [...(roh.get(id) ?? perioden.map(() => 0))];
      for (const kind of liste.filter((k) => k.parentId === id))
        rollup(kind.id).forEach((w, i) => (werte[i]! += w));
      return werte;
    };
    const vorzeichen = a === 'erloes' ? -1 : 1;
    return baumReihenfolge(liste).map(({ konto, ebene }) => {
      const werteCent = rollup(konto.id).map((w) => w * vorzeichen || 0);
      return {
        kontoId: konto.id,
        name: konto.name,
        art: a,
        ebene,
        werteCent,
        summeCent: summiere(werteCent),
      };
    });
  };
  const summeJe = (a: 'erloes' | 'aufwand'): number[] => {
    const werte = perioden.map(() => 0);
    for (const [id, w] of roh)
      if (art.get(id) === a) w.forEach((x, i) => (werte[i]! += x * (a === 'erloes' ? -1 : 1)));
    return werte.map((w) => w || 0);
  };
  const erloeseCent = summeJe('erloes');
  const aufwandCent = summeJe('aufwand');
  const ergebnisCent = erloeseCent.map((e, i) => e - aufwandCent[i]!);
  return {
    von,
    bis,
    intervall,
    zeitraeume: perioden,
    erloese: zeileFuer('erloes'),
    aufwand: zeileFuer('aufwand'),
    summen: { erloeseCent, aufwandCent, ergebnisCent },
    gesamt: {
      erloeseCent: summiere(erloeseCent),
      aufwandCent: summiere(aufwandCent),
      ergebnisCent: summiere(ergebnisCent),
    },
  };
}

// ----- EÜR

export interface EuerKontoDto {
  kontoId: string;
  name: string;
  betragCent: number;
}

export interface EuerZeileDto {
  zeile: EuerZeile;
  label: string;
  seite: EuerSeite;
  /** Computed from the tax fields (no Konten). */
  berechnet: boolean;
  betragCent: number;
  konten: EuerKontoDto[];
}

/** An Erlös or Aufwand account without an EÜR line. */
export interface EuerNichtZugeordnetDto extends EuerKontoDto {
  seite: EuerSeite;
}

export interface EuerAuswertungDto {
  jahr: number;
  zeilen: EuerZeileDto[];
  nichtZugeordnet: EuerNichtZugeordnetDto[];
  summeEinnahmenCent: number;
  summeAusgabenCent: number;
  ueberschussCent: number;
}

/**
 * EÜR of a year: net amounts grouped by the `euer_zeile` of the account, plus the computed lines
 * (collected USt, paid Vorsteuer). Neutral accounts count only with a line; the account `ust-finanzamt`
 * is split by sign into `ust_zahlung` (outflow) and `ust_erstattung` (inflow).
 */
export function euerAuswertung(
  zeilen: readonly AuswertungZeile[],
  konten: readonly AuswertungKonto[],
  jahr: number,
): EuerAuswertungDto {
  const nachId = new Map(konten.map((k) => [k.id, k]));
  const summen = new Map<string, number>();
  let ustVereinnahmt = 0;
  let vorsteuerGezahlt = 0;
  let ustZahlung = 0;
  let ustErstattung = 0;
  for (const z of zeilen) {
    if (!z.datum.startsWith(`${jahr}-`)) continue;
    if (z.steuerArt === 'ust') ustVereinnahmt -= z.steuerCent ?? 0;
    else if (z.steuerArt === 'vorsteuer') vorsteuerGezahlt += z.steuerCent ?? 0;
    if (z.kontoId === UST_FINANZAMT_KONTO_ID) {
      if (z.betragCent > 0) ustZahlung += z.betragCent;
      else ustErstattung -= z.betragCent;
      continue;
    }
    summen.set(z.kontoId, (summen.get(z.kontoId) ?? 0) + nettoVon(z));
  }
  const jeZeile = new Map<EuerZeile, EuerKontoDto[]>();
  const nichtZugeordnet: EuerNichtZugeordnetDto[] = [];
  for (const [id, summe] of summen) {
    const k = nachId.get(id);
    if (!k) continue;
    if (k.art !== 'erloes' && k.art !== 'aufwand' && k.art !== 'neutral') continue;
    if (k.euerZeile === null) {
      if (k.art === 'neutral') continue;
      const seite: EuerSeite = k.art === 'erloes' ? 'einnahme' : 'ausgabe';
      nichtZugeordnet.push({
        kontoId: id,
        name: k.name,
        seite,
        betragCent: (seite === 'einnahme' ? -summe : summe) || 0,
      });
      continue;
    }
    const betrag = (euerZeileSeite(k.euerZeile) === 'einnahme' ? -summe : summe) || 0;
    jeZeile.set(k.euerZeile, [
      ...(jeZeile.get(k.euerZeile) ?? []),
      { kontoId: id, name: k.name, betragCent: betrag },
    ]);
  }
  const finanzamt = nachId.get(UST_FINANZAMT_KONTO_ID);
  const finanzamtKonto = (betragCent: number): EuerKontoDto[] =>
    finanzamt && betragCent !== 0
      ? [{ kontoId: finanzamt.id, name: finanzamt.name, betragCent }]
      : [];
  const berechnet: Partial<Record<EuerZeile, number>> = {
    ust_vereinnahmt: ustVereinnahmt,
    vorsteuer_gezahlt: vorsteuerGezahlt,
    ust_zahlung: ustZahlung,
    ust_erstattung: ustErstattung,
  };
  const ergebnis: EuerZeileDto[] = EUER_ZEILEN_WERTE.map((zeile) => {
    const info = EUER_ZEILEN[zeile] as { label: string; seite: EuerSeite; berechnet?: true };
    const finanzamtZeile = zeile === 'ust_zahlung' || zeile === 'ust_erstattung';
    const kontenZeile = finanzamtZeile
      ? finanzamtKonto(berechnet[zeile] ?? 0)
      : (jeZeile.get(zeile) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const betragCent =
      info.berechnet || finanzamtZeile
        ? (berechnet[zeile] ?? 0)
        : summiere(kontenZeile.map((k) => k.betragCent));
    return {
      zeile,
      label: info.label,
      seite: info.seite,
      berechnet: info.berechnet === true,
      betragCent: betragCent || 0,
      konten: info.berechnet ? [] : kontenZeile,
    };
  });
  const summeSeite = (seite: EuerSeite): number =>
    summiere(ergebnis.filter((z) => z.seite === seite).map((z) => z.betragCent)) +
    summiere(nichtZugeordnet.filter((z) => z.seite === seite).map((z) => z.betragCent));
  const summeEinnahmenCent = summeSeite('einnahme');
  const summeAusgabenCent = summeSeite('ausgabe');
  return {
    jahr,
    zeilen: ergebnis,
    nichtZugeordnet: nichtZugeordnet.sort((a, b) => a.name.localeCompare(b.name, 'de')),
    summeEinnahmenCent,
    summeAusgabenCent,
    ueberschussCent: summeEinnahmenCent - summeAusgabenCent,
  };
}

// ----- Events

export type EventEinnahmeQuelle = 'bar' | 'karte';

/** Revenue of one source (cash settlement or SumUp) at one event; the store leaves out cancelled ones. */
export interface EventEinnahmeRoh {
  eventId: string;
  /** Title, or the name of the Kategorie when the event has none. */
  titel: string;
  /** ISO instant. */
  beginn: string;
  kategorieId: string;
  kategorieName: string;
  kategorieFarbe: string;
  quelle: EventEinnahmeQuelle;
  bruttoCent: number;
  nettoCent: number;
}

export interface EventEinnahmeZeileDto {
  eventId: string;
  titel: string;
  beginn: string;
  kategorieId: string;
  kategorieName: string;
  kategorieFarbe: string;
  barBruttoCent: number;
  barNettoCent: number;
  karteBruttoCent: number;
  karteNettoCent: number;
  summeBruttoCent: number;
  summeNettoCent: number;
}

/** One row per event (oldest first). */
export function eventEinnahmen(quellen: readonly EventEinnahmeRoh[]): EventEinnahmeZeileDto[] {
  const jeEvent = new Map<string, EventEinnahmeZeileDto>();
  for (const q of quellen) {
    const z =
      jeEvent.get(q.eventId) ??
      ({
        eventId: q.eventId,
        titel: q.titel,
        beginn: q.beginn,
        kategorieId: q.kategorieId,
        kategorieName: q.kategorieName,
        kategorieFarbe: q.kategorieFarbe,
        barBruttoCent: 0,
        barNettoCent: 0,
        karteBruttoCent: 0,
        karteNettoCent: 0,
        summeBruttoCent: 0,
        summeNettoCent: 0,
      } satisfies EventEinnahmeZeileDto);
    if (q.quelle === 'bar') {
      z.barBruttoCent += q.bruttoCent;
      z.barNettoCent += q.nettoCent;
    } else {
      z.karteBruttoCent += q.bruttoCent;
      z.karteNettoCent += q.nettoCent;
    }
    z.summeBruttoCent += q.bruttoCent;
    z.summeNettoCent += q.nettoCent;
    jeEvent.set(q.eventId, z);
  }
  return [...jeEvent.values()].sort(
    (a, b) => a.beginn.localeCompare(b.beginn) || a.eventId.localeCompare(b.eventId),
  );
}

export interface EventVerlaufKategorieDto {
  id: string;
  name: string;
  /** Mantine color name. */
  farbe: string;
}

export interface EventVerlaufPunktDto {
  schluessel: string;
  kategorieId: string;
  bruttoCent: number;
  nettoCent: number;
}

export interface EventVerlaufDto {
  zeitraeume: AuswertungZeitraumDto[];
  kategorien: EventVerlaufKategorieDto[];
  /** Only (period, Kategorie) pairs with revenue. */
  punkte: EventVerlaufPunktDto[];
}

/** Revenue per Kategorie and period (by the Berlin date of the event start), for the chart. */
export function eventVerlauf(
  quellen: readonly EventEinnahmeRoh[],
  von: string,
  bis: string,
  intervall: AuswertungIntervall,
): EventVerlaufDto {
  const zeitraeume = zeitraeumeZwischen(von, bis, intervall);
  const gueltig = new Set(zeitraeume.map((z) => z.schluessel));
  const kategorien = new Map<string, EventVerlaufKategorieDto>();
  const punkte = new Map<string, EventVerlaufPunktDto>();
  for (const q of quellen) {
    const schluessel = zeitraumSchluessel(heuteBerlin(new Date(q.beginn)), intervall);
    if (!gueltig.has(schluessel)) continue;
    kategorien.set(q.kategorieId, {
      id: q.kategorieId,
      name: q.kategorieName,
      farbe: q.kategorieFarbe,
    });
    const key = `${schluessel}|${q.kategorieId}`;
    const p = punkte.get(key) ?? {
      schluessel,
      kategorieId: q.kategorieId,
      bruttoCent: 0,
      nettoCent: 0,
    };
    p.bruttoCent += q.bruttoCent;
    p.nettoCent += q.nettoCent;
    punkte.set(key, p);
  }
  return {
    zeitraeume,
    kategorien: [...kategorien.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    punkte: [...punkte.values()],
  };
}

export interface EventAuswertungDto {
  von: string;
  bis: string;
  intervall: AuswertungIntervall;
  events: EventEinnahmeZeileDto[];
  summe: Omit<
    EventEinnahmeZeileDto,
    'eventId' | 'titel' | 'beginn' | 'kategorieId' | 'kategorieName' | 'kategorieFarbe'
  >;
  verlauf: EventVerlaufDto;
}

// ----- Einkauf

/** A booked Ware item of a Beleg of the year (the store leaves out cancelled Belege). */
export interface EinkaufPostenRoh {
  wareId: string;
  wareName: string;
  standardGebindeId: string | null;
  gebindeId: string;
  /** Number of Gebinde in thousandths. */
  anzahlMilli: number;
  /** Amount of the item without deposit: gross for `brutto` Belege, net for `netto` ones. */
  betragCent: number;
  /** Basis points. */
  steuersatz: number;
  modus: 'brutto' | 'netto';
  /** An Eigenbeleg has no Vorsteuer: the gross amount counts. */
  eigenbeleg: boolean;
}

export interface EinkaufGebindeDto {
  gebindeId: string;
  anzahlMilli: number;
}

export interface EinkaufWareDto {
  wareId: string;
  name: string;
  /** Unit of `mengeMilli`; a Ware bought in different units appears once per unit. */
  einheit: Einheit;
  einheitLabel: string;
  gebinde: EinkaufGebindeDto[];
  /** Ready-to-show text of `gebinde`, e.g. `3 Kästen`. */
  gebindeText: string;
  /** Amount in thousandths of `einheit` (Basisgebinde: `menge × Anzahl`; without a content: pieces). */
  mengeMilli: number;
  /** Net sum without deposit. */
  nettoCent: number;
  /** Average net price per `einheit` (rounded cents); null without an amount. */
  preisJeEinheitCent: number | null;
  /** Average net price per Standard-Gebinde of the Ware; null without one or an amount. */
  preisJeStandardGebindeCent: number | null;
  /** Name of the Standard-Gebinde without deposit. */
  standardGebinde: string | null;
  /** Total deposit of one Standard-Gebinde; null without Pfand. */
  standardGebindePfandCent: number | null;
}

export interface EinkaufPfandDto {
  /** Open Leergut (balance of the account `pfand`) at the start and end of the year. */
  anfangCent: number;
  zugangCent: number;
  abgangCent: number;
  endeCent: number;
}

export interface EinkaufAuswertungDto {
  jahr: number;
  waren: EinkaufWareDto[];
  nettoCent: number;
  pfand: EinkaufPfandDto;
}

/** Net amount of an item (`betragCent` is gross in `brutto` Belege, except Eigenbelege). */
export const einkaufNetto = (
  p: Pick<EinkaufPostenRoh, 'betragCent' | 'steuersatz' | 'modus' | 'eigenbeleg'>,
): number =>
  p.modus === 'netto' || p.eigenbeleg
    ? p.betragCent
    : runde((p.betragCent * 10000) / (10000 + p.steuersatz));

/**
 * Per Ware (and unit): Gebinde, amount in base units, net sum and average prices. `inBasiseinheiten`
 * resolves Obergebinde (a Kasten of 20 counts 20 Flaschen), the unit comes from the base Gebinde.
 */
export function einkaufAuswertung(
  posten: readonly EinkaufPostenRoh[],
  gebinde: readonly Gebinde[],
  jahr: number,
  pfand: EinkaufPfandDto,
): EinkaufAuswertungDto {
  const alle = [...gebinde];
  const index = new Map(alle.map((g) => [g.id, g]));
  interface Summe {
    wareId: string;
    name: string;
    einheit: Einheit;
    standardGebindeId: string | null;
    gebinde: Map<string, number>;
    basisMilli: number;
    mengeMilli: number;
    nettoCent: number;
  }
  const jeWare = new Map<string, Summe>();
  for (const p of posten) {
    const g = index.get(p.gebindeId);
    const basis = g ? (index.get(basisGebinde(g)) ?? g) : undefined;
    const einheit: Einheit = basis?.einheit ?? 'stk';
    const inhalt = basis?.einheit && basis.menge ? basis.menge : 1;
    const basisMilli = g ? inBasiseinheiten(p.gebindeId, p.anzahlMilli, alle) : p.anzahlMilli;
    const key = `${p.wareId}|${einheit}`;
    const s = jeWare.get(key) ?? {
      wareId: p.wareId,
      name: p.wareName,
      einheit,
      standardGebindeId: p.standardGebindeId,
      gebinde: new Map<string, number>(),
      basisMilli: 0,
      mengeMilli: 0,
      nettoCent: 0,
    };
    s.gebinde.set(p.gebindeId, (s.gebinde.get(p.gebindeId) ?? 0) + p.anzahlMilli);
    s.basisMilli += basisMilli;
    s.mengeMilli += Math.round(basisMilli * inhalt);
    s.nettoCent += einkaufNetto(p);
    jeWare.set(key, s);
  }
  const waren = [...jeWare.values()]
    .map((s): EinkaufWareDto => {
      const standard = s.standardGebindeId ? index.get(s.standardGebindeId) : undefined;
      const standardFaktor = standard ? inBasiseinheiten(standard.id, 1, alle) : 0;
      // Standard-Gebinde only makes sense in the unit of the Ware's base Gebinde.
      const standardPassend =
        standard !== undefined &&
        (index.get(basisGebinde(standard)) ?? standard).einheit === s.einheit;
      const gebindeListe = [...s.gebinde].map(([gebindeId, anzahlMilli]) => ({
        gebindeId,
        anzahlMilli,
      }));
      return {
        wareId: s.wareId,
        name: s.name,
        einheit: s.einheit,
        einheitLabel: EINHEIT_LABELS[s.einheit],
        gebinde: gebindeListe,
        gebindeText: bestandAnzeigen(
          gebindeListe.map((x) => ({
            gebindeId: x.gebindeId,
            menge: Math.round(x.anzahlMilli / 1000),
          })),
          alle,
        ),
        mengeMilli: s.mengeMilli,
        nettoCent: s.nettoCent,
        preisJeEinheitCent: s.mengeMilli > 0 ? runde((s.nettoCent * 1000) / s.mengeMilli) : null,
        preisJeStandardGebindeCent:
          standardPassend && standardFaktor > 0 && s.basisMilli > 0
            ? runde((s.nettoCent * standardFaktor * 1000) / s.basisMilli)
            : null,
        standardGebinde: standardPassend ? gebindeNameOhnePfand(standard, alle) : null,
        standardGebindePfandCent: standardPassend ? pfandGesamtCent(standard, alle) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de') || a.einheit.localeCompare(b.einheit));
  return { jahr, waren, nettoCent: summiere(waren.map((w) => w.nettoCent)), pfand };
}

/** A line of the account `pfand` (the balance is the open Leergut). */
export interface PfandZeileRoh {
  datum: string;
  betragCent: number;
}

/** Pfand balance at the start and end of the year plus inflow (Pfand paid) and outflow (Leergut returned). */
export function pfandSaldo(zeilen: readonly PfandZeileRoh[], jahr: number): EinkaufPfandDto {
  const { von, bis } = jahrGrenzen(jahr);
  let anfangCent = 0;
  let zugangCent = 0;
  let abgangCent = 0;
  for (const z of zeilen) {
    if (z.datum < von) anfangCent += z.betragCent;
    else if (z.datum <= bis) {
      if (z.betragCent >= 0) zugangCent += z.betragCent;
      else abgangCent -= z.betragCent;
    }
  }
  return { anfangCent, zugangCent, abgangCent, endeCent: anfangCent + zugangCent - abgangCent };
}

// ----- CSV

/** A cell: text, a plain number, `{ cent }` (as `1234,56`) or empty. */
export type CsvZelle = string | number | { cent: number } | null | undefined;

const csvZelle = (z: CsvZelle): string => {
  if (z === null || z === undefined) return '';
  if (typeof z === 'string') return csvFeld(z);
  if (typeof z === 'number') return String(z).replace('.', ',');
  return betragCsv(z.cent);
};

/**
 * CSV for Excel: `;` separated, German decimal comma, UTF-8 with BOM, CRLF line ends. Text with `;`, `"`
 * or a line break is quoted.
 */
export function csvText(kopf: readonly string[], zeilen: readonly (readonly CsvZelle[])[]): string {
  return `\uFEFF${[kopf.map(csvFeld), ...zeilen.map((z) => z.map(csvZelle))]
    .map((z) => `${z.join(';')}\r\n`)
    .join('')}`;
}
