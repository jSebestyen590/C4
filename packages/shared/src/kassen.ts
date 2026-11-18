import { z } from 'zod';
import { anzahlenAus, stueckelungSumme } from './bargeld';
import { name } from './bausteine';
import {
  ANZAHL_MAX,
  BETRAG_MAX_CENT,
  finanzDatumSchema,
  formatEuro,
  idempotenzSchluessel,
  NENNWERTE_CENT,
  type BuchungVerweisDto,
  type FinanzMitgliedDto,
  type KontoArt,
  type SteuerArt,
  type StueckelungDto,
} from './finanzen';

// Finanzen / Barkassen: a Kasse is a Fach of the Safe with a Grundbestand and default accounts.
// Staff count it unbindingly at events (Dienst-Zählung), the Finanzer:in settles it with one
// booking (Kassenabrechnung). Pure functions only, see docs/finanzen.md ("Barkassen").

/** Coins per roll (Euro standard); notes have no roll. */
export const MUENZROLLE: Readonly<Record<number, number>> = {
  1: 50,
  2: 50,
  5: 50,
  10: 40,
  20: 40,
  50: 40,
  100: 25,
  200: 25,
};

/** Coins per roll of a denomination; null for notes. */
export const muenzrolle = (nennwertCent: number): number | null => MUENZROLLE[nennwertCent] ?? null;

/** `25 × 1,00 €` as "1 Rolle (25 Stück)", `50 × 1,00 €` as "2 Rollen (50 Stück)", else "12 Stück". */
export function rollenText(nennwertCent: number, anzahl: number): string {
  const rolle = muenzrolle(nennwertCent);
  if (rolle && anzahl > 0 && anzahl % rolle === 0) {
    const n = anzahl / rolle;
    return `${n} ${n === 1 ? 'Rolle' : 'Rollen'} (${anzahl} Stück)`;
  }
  return `${anzahl} Stück`;
}

/** The Kassenzählungen list at an event returns at most this many entries. */
export const KASSENABRECHNUNGEN_MAX = 2000;

// ----- Schemas

const nennwertFeld = z
  .number('Bitte gib einen Nennwert an.')
  .refine((n) => (NENNWERTE_CENT as readonly number[]).includes(n), 'Unzulässiger Nennwert.');

const mengeSchema = z.object({
  nennwertCent: nennwertFeld,
  anzahl: z
    .number('Bitte gib eine Anzahl an.')
    .int('Die Anzahl muss eine ganze Zahl sein.')
    .min(0, 'Die Anzahl darf nicht negativ sein.')
    .max(ANZAHL_MAX, 'Die Anzahl ist zu groß.'),
});

/** `[{nennwertCent, anzahl >= 0}]`, each denomination at most once. */
const mengenListe = (meldung: string) =>
  z
    .array(mengeSchema, meldung)
    .max(NENNWERTE_CENT.length)
    .refine(
      (l) => new Set(l.map((i) => i.nennwertCent)).size === l.length,
      'Jeder Nennwert darf nur einmal vorkommen.',
    );

const idFeld = (meldung: string) => z.string(meldung).min(1, meldung);

/** Body of `POST /api/finanzen/kassen`: creates the Fach of the Kasse and its master data. */
export const kasseEingabeSchema = z.object({
  name: name('einen Namen'),
  grundbestand: mengenListe('Bitte gib den Grundbestand an.'),
  standardErloesKontoId: idFeld('Bitte wähle ein Erlöskonto.'),
  standardZielFachId: idFeld('Bitte wähle ein Ziel-Fach.'),
});
export type KasseEingabe = z.output<typeof kasseEingabeSchema>;
export type KasseEingabeInput = z.input<typeof kasseEingabeSchema>;

/** Body of `PUT /api/finanzen/kassen/:kontoId`: the optional `name` renames the Fach like the Kontenplan does. */
export const kasseAendernSchema = kasseEingabeSchema.omit({ name: true }).extend({
  name: name('einen Namen').optional(),
});
export type KasseAendern = z.output<typeof kasseAendernSchema>;
export type KasseAendernInput = z.input<typeof kasseAendernSchema>;

/** Body of `POST /api/kassen/zaehlungen` (Dienst-Zählung at an event). */
export const kassenzaehlungEingabeSchema = z.object({
  idempotenzSchluessel,
  kontoId: idFeld('Bitte wähle eine Kasse.'),
  eventId: idFeld('Bitte wähle ein Event.'),
  /** The counted amounts; denominations that are not listed count as 0. */
  ist: mengenListe('Bitte gib die gezählten Mengen an.'),
});
export type KassenzaehlungEingabe = z.output<typeof kassenzaehlungEingabeSchema>;
export type KassenzaehlungEingabeInput = z.input<typeof kassenzaehlungEingabeSchema>;

/** Query of `GET /api/kassen/zaehlungen`. */
export const kassenzaehlungenAbfrageSchema = z.object({
  eventId: idFeld('Bitte wähle ein Event.'),
});

/** Query of `GET /api/finanzen/kassenabrechnungen`. */
export const kassenabrechnungenAbfrageSchema = z.object({ kontoId: z.string().min(1).optional() });

const transferSchema = z.object({
  fachId: idFeld('Bitte wähle ein Fach.'),
  nennwertCent: nennwertFeld,
  anzahl: z
    .number('Bitte gib eine Anzahl an.')
    .int('Die Anzahl muss eine ganze Zahl sein.')
    .refine((a) => a !== 0, 'Die Anzahl darf nicht 0 sein.')
    .refine((a) => Math.abs(a) <= ANZAHL_MAX, 'Die Anzahl ist zu groß.'),
});

/** Body of `POST /api/finanzen/kassenabrechnungen`. */
export const kassenabrechnungEingabeSchema = z.object({
  idempotenzSchluessel,
  kontoId: idFeld('Bitte wähle eine Kasse.'),
  datum: finanzDatumSchema,
  /** The counted amounts; denominations that are not listed count as 0. */
  ist: mengenListe('Bitte gib die gezählten Mengen an.'),
  erloesKontoId: idFeld('Bitte wähle ein Erlöskonto.'),
  zielFachId: idFeld('Bitte wähle ein Ziel-Fach.'),
  /**
   * Transfers per Fach and denomination: on the Ziel-Fach positive = Kasse -> Ziel-Fach, negative =
   * Ziel-Fach -> Kasse; any other Fach (Nachschub, e.g. coin rolls) only with a negative count, its
   * counterpart lands in the Ziel-Fach.
   */
  transfers: z
    .array(transferSchema)
    .max(60)
    .default([])
    .refine(
      (l) => new Set(l.map((t) => `${t.fachId}|${t.nennwertCent}`)).size === l.length,
      'Jedes Fach und jeder Nennwert darf nur einmal vorkommen.',
    ),
  /** Allocation of the income to events (editable proposal); the error is computed by the server. */
  events: z
    .array(
      z.object({
        eventId: idFeld('Bitte wähle ein Event.'),
        zaehlungId: z
          .string()
          .min(1)
          .nullish()
          .transform((v) => v ?? null),
        betragCent: z
          .number('Bitte gib einen Betrag an.')
          .int('Beträge müssen ganze Cent sein.')
          .refine((b) => Math.abs(b) <= BETRAG_MAX_CENT, 'Der Betrag ist zu groß.'),
      }),
    )
    .max(500)
    .default([])
    .refine(
      (l) => new Set(l.map((e) => e.eventId)).size === l.length,
      'Jedes Event darf nur einmal vorkommen.',
    ),
});
export type KassenabrechnungEingabe = z.output<typeof kassenabrechnungEingabeSchema>;
export type KassenabrechnungEingabeInput = z.input<typeof kassenabrechnungEingabeSchema>;

// ----- Rules for the accounts of a Kasse

/** An account as the Kasse rules need it. */
export interface KassenKonto {
  id: string;
  name: string;
  art: KontoArt;
  stueckelung: boolean;
  archiviert: boolean;
  hatUnterkonten?: boolean;
  /** Basis points; `null` = none. */
  steuersatzStandard?: number | null;
}

/** Why an account is not a usable Fach (empty = fine). */
export function fachFehler(k: KassenKonto | undefined, wort = 'Das Fach'): string[] {
  if (!k) return [`${wort} gibt es nicht.`];
  if (!k.stueckelung || k.hatUnterkonten || k.art !== 'bargeld')
    return [`Das Konto „${k.name}“ ist kein Fach.`];
  if (k.archiviert) return [`Das Fach „${k.name}“ ist archiviert.`];
  return [];
}

/** Checks the default accounts of a Kasse (create / change): Erlöskonto and Ziel-Fach ≠ Kasse. */
export function kasseKontenFehler(
  erloes: KassenKonto | undefined,
  ziel: KassenKonto | undefined,
  kasseId: string | null,
): string[] {
  const fehler: string[] = [];
  if (!erloes) fehler.push('Das Erlöskonto gibt es nicht.');
  else if (erloes.art !== 'erloes' || erloes.hatUnterkonten)
    fehler.push(`Das Konto „${erloes.name}“ ist kein Erlöskonto.`);
  else if (erloes.archiviert) fehler.push(`Das Erlöskonto „${erloes.name}“ ist archiviert.`);
  if (ziel && ziel.id === kasseId)
    fehler.push('Das Ziel-Fach muss ein anderes Fach als die Kasse sein.');
  else fehler.push(...fachFehler(ziel, 'Das Ziel-Fach'));
  return fehler;
}

// ----- Proposals

/** A Dienst-Zählung as the proposal needs it. */
export interface KassenZaehlungVorschlag {
  eventId: string;
  zaehlungId: string;
  summeCent: number;
  /** ISO timestamp of the count; the newest one of a Event counts. */
  gezaehltAm: string;
  /** ISO timestamp of the event start, orders the events. */
  eventBeginn: string;
}

export interface EventEinnahme {
  eventId: string;
  zaehlungId: string | null;
  betragCent: number;
}

/**
 * Proposal of the income per event: the newest count of each event, ordered by event start;
 * income_i = count_i - count_(i-1), starting with the stock (`sollCent`).
 */
export function eventEinnahmenVorschlag(
  sollCent: number,
  zaehlungen: readonly KassenZaehlungVorschlag[],
): EventEinnahme[] {
  const neueste = new Map<string, KassenZaehlungVorschlag>();
  for (const z of zaehlungen) {
    const alt = neueste.get(z.eventId);
    if (
      !alt ||
      z.gezaehltAm > alt.gezaehltAm ||
      (z.gezaehltAm === alt.gezaehltAm && z.zaehlungId > alt.zaehlungId)
    )
      neueste.set(z.eventId, z);
  }
  let vorher = sollCent;
  return [...neueste.values()]
    .sort(
      (a, b) => a.eventBeginn.localeCompare(b.eventBeginn) || a.eventId.localeCompare(b.eventId),
    )
    .map((z) => {
      const betragCent = z.summeCent - vorher;
      vorher = z.summeCent;
      return { eventId: z.eventId, zaehlungId: z.zaehlungId, betragCent };
    });
}

/** Ascending, without zeros. */
const alsStueckelung = (m: ReadonlyMap<number, number>): StueckelungDto[] =>
  NENNWERTE_CENT.filter((n) => (m.get(n) ?? 0) !== 0).map((n) => ({
    nennwertCent: n,
    anzahl: m.get(n) ?? 0,
  }));

export interface TransferVorschlag {
  /** Ziel-Fach transfer per denomination: positive = Kasse -> Ziel-Fach, negative = the other way. */
  transfer: StueckelungDto[];
  /** Per denomination how many pieces the Ziel-Fach lacks to refill the Kasse to its Grundbestand. */
  fehlbestand: StueckelungDto[];
}

/**
 * Brings the Kasse back to its Grundbestand: the surplus (`ist - grundbestand`) goes to the Ziel-Fach,
 * the need comes from it, limited by its stock (`bestandZielFach`); what is still missing is the
 * `fehlbestand`.
 */
export function transferVorschlag(
  ist: readonly StueckelungDto[],
  grundbestand: readonly StueckelungDto[],
  bestandZielFach: readonly StueckelungDto[],
): TransferVorschlag {
  const istM = anzahlenAus(ist);
  const grundM = anzahlenAus(grundbestand);
  const zielM = anzahlenAus(bestandZielFach);
  const transfer = new Map<number, number>();
  const fehlbestand = new Map<number, number>();
  for (const n of NENNWERTE_CENT) {
    const bedarf = (istM.get(n) ?? 0) - (grundM.get(n) ?? 0);
    if (bedarf > 0) transfer.set(n, bedarf);
    else if (bedarf < 0) {
      const da = Math.min(-bedarf, Math.max(0, zielM.get(n) ?? 0));
      if (da > 0) transfer.set(n, -da);
      if (-bedarf - da > 0) fehlbestand.set(n, -bedarf - da);
    }
  }
  return { transfer: alsStueckelung(transfer), fehlbestand: alsStueckelung(fehlbestand) };
}

/** A Fach with its stock, as a source of Nachschub. */
export interface NachschubQuelle {
  fachId: string;
  name: string;
  bestand: readonly StueckelungDto[];
}

export interface NachschubVorschlag {
  nennwertCent: number;
  fachId: string;
  /** Pieces to fetch: whole rolls when the Fach has enough, else as many as it has. */
  anzahl: number;
  /** Number of rolls when `anzahl` is a whole number of rolls, else null. */
  rollen: number | null;
  /** False for notes and when the Fach has no whole roll to give. */
  ganzeRolle: boolean;
}

/**
 * Per missing denomination the first Fach that has enough, with the missing count rounded up to
 * whole rolls (`MUENZROLLE`, at most the stock of the Fach). No Fach with enough: no proposal.
 */
export function nachschubVorschlag(
  fehlbestand: readonly StueckelungDto[],
  faecher: readonly NachschubQuelle[],
): NachschubVorschlag[] {
  const ergebnis: NachschubVorschlag[] = [];
  for (const f of fehlbestand) {
    if (f.anzahl <= 0) continue;
    const quelle = faecher.find(
      (q) => (anzahlenAus(q.bestand).get(f.nennwertCent) ?? 0) >= f.anzahl,
    );
    if (!quelle) continue;
    const bestand = anzahlenAus(quelle.bestand).get(f.nennwertCent) ?? 0;
    const rolle = muenzrolle(f.nennwertCent);
    const anzahl = rolle ? Math.min(Math.ceil(f.anzahl / rolle) * rolle, bestand) : f.anzahl;
    const ganzeRolle = !!rolle && anzahl % rolle === 0;
    ergebnis.push({
      nennwertCent: f.nennwertCent,
      fachId: quelle.fachId,
      anzahl,
      rollen: ganzeRolle && rolle ? anzahl / rolle : null,
      ganzeRolle,
    });
  }
  return ergebnis;
}

// ----- Settlement

/** `1190` at 1900 bp -> net 1000, tax 190; signs follow the gross amount. */
export function nettoSteuer(
  bruttoCent: number,
  satzBp: number,
): { nettoCent: number; steuerCent: number } {
  const betrag = Math.abs(bruttoCent);
  const netto = Math.round((betrag * 10000) / (10000 + satzBp));
  const vorzeichen = bruttoCent < 0 ? -1 : 1;
  return {
    nettoCent: netto === 0 ? 0 : vorzeichen * netto,
    steuerCent: betrag - netto === 0 ? 0 : vorzeichen * (betrag - netto),
  };
}

export interface KassenTransfer {
  fachId: string;
  nennwertCent: number;
  anzahl: number;
}

/** A line of the Kassenabrechnung booking (the shape of an entry line without `pos`). */
export interface KassenZeile {
  kontoId: string;
  betragCent: number;
  nettoCent: number | null;
  steuerCent: number | null;
  steuersatz: number | null;
  steuerArt: SteuerArt;
  stueckelung: StueckelungDto[];
}

/** One denomination of the settlement. */
export interface KassenPosten {
  nennwertCent: number;
  /** Stock of the Kasse according to the books. */
  soll: number;
  /** Counted by the Finanzer:in. */
  ist: number;
  grundbestand: number;
  /** In the Kasse after the settlement (`ist` minus the transfer to the Ziel-Fach). */
  danach: number;
}

export interface KassenRechnungEingabe {
  kasse: { id: string; name: string };
  /** Stock of the Kasse according to the books. */
  bestand: readonly StueckelungDto[];
  grundbestand: readonly StueckelungDto[];
  ist: readonly StueckelungDto[];
  transfers: readonly KassenTransfer[];
  erloesKonto: { id: string; steuersatzStandard: number | null };
  zielFachId: string;
  events: readonly { betragCent: number; zaehlungId?: string | null }[];
}

export interface KassenRechnung {
  /** Stock of the Kasse in cent. */
  sollCent: number;
  istCent: number;
  /** `istCent - sollCent`, may be negative. */
  einnahmeCent: number;
  /** Value of the Ziel-Fach transfer (positive = into the Ziel-Fach). */
  transferCent: number;
  /** `einnahmeCent` minus the sum of the event incomes: income that no event explains. */
  fehlerCent: number;
  eventSummeCent: number;
  /** All 13 denominations. */
  posten: KassenPosten[];
  /** The booking lines; empty when nothing changes. */
  zeilen: KassenZeile[];
  /** Non-blocking: the user confirms them before saving. */
  warnungen: string[];
}

/** The Kasse's own checks of the transfers (empty = fine); the stock rule is checked with the booking. */
export function pruefeKassenTransfers(
  transfers: readonly KassenTransfer[],
  zielFachId: string,
  kasseId: string,
): string[] {
  const fehler: string[] = [];
  if (zielFachId === kasseId)
    fehler.push('Das Ziel-Fach muss ein anderes Fach als die Kasse sein.');
  const nachschub = transfers.filter((t) => t.fachId !== zielFachId);
  if (nachschub.some((t) => t.fachId === kasseId))
    fehler.push('Die Kasse selbst kann kein Nachschub-Fach sein.');
  if (nachschub.some((t) => t.anzahl > 0))
    fehler.push('Nachschub aus einem Fach ist nur mit einer negativen Anzahl möglich.');
  return fehler;
}

const keinNull = (n: number) => (n === 0 ? 0 : n);

/**
 * Computes the Kassenabrechnung: income = counted - stock, error = income - sum of event incomes,
 * the Kasse afterwards, the booking lines and the warnings. The server computes it again; values
 * for income and error that a client sends are never taken over.
 */
export function berechneKassenabrechnung(e: KassenRechnungEingabe): KassenRechnung {
  const sollM = anzahlenAus(e.bestand);
  const istM = anzahlenAus(e.ist);
  const grundM = anzahlenAus(e.grundbestand);
  const ziel = e.transfers.filter((t) => t.fachId === e.zielFachId);
  const zielM = anzahlenAus(ziel);
  const sollCent = stueckelungSumme(e.bestand);
  const istCent = stueckelungSumme(e.ist);
  const einnahmeCent = istCent - sollCent;
  const transferCent = stueckelungSumme(ziel);
  const eventSummeCent = e.events.reduce((s, x) => s + x.betragCent, 0);
  const fehlerCent = einnahmeCent - eventSummeCent;

  const posten: KassenPosten[] = NENNWERTE_CENT.map((n) => ({
    nennwertCent: n,
    soll: sollM.get(n) ?? 0,
    ist: istM.get(n) ?? 0,
    grundbestand: grundM.get(n) ?? 0,
    danach: (istM.get(n) ?? 0) - (zielM.get(n) ?? 0),
  }));

  const zeile = (
    kontoId: string,
    stueckelung: StueckelungDto[],
    betragCent = stueckelungSumme(stueckelung),
  ): KassenZeile => ({
    kontoId,
    betragCent,
    nettoCent: null,
    steuerCent: null,
    steuersatz: null,
    steuerArt: 'keine',
    stueckelung,
  });
  const zeilen: KassenZeile[] = [];
  // The Kasse takes over the counted stock: surplus and missing denominations on separate lines.
  const mehr = posten
    .filter((p) => p.ist - p.soll > 0)
    .map((p) => ({ nennwertCent: p.nennwertCent, anzahl: p.ist - p.soll }));
  const weniger = posten
    .filter((p) => p.ist - p.soll < 0)
    .map((p) => ({ nennwertCent: p.nennwertCent, anzahl: p.ist - p.soll }));
  if (mehr.length > 0) zeilen.push(zeile(e.kasse.id, mehr));
  if (weniger.length > 0) zeilen.push(zeile(e.kasse.id, weniger));
  if (einnahmeCent !== 0) {
    const brutto = -einnahmeCent;
    const satz = e.erloesKonto.steuersatzStandard;
    zeilen.push(
      satz === null
        ? zeile(e.erloesKonto.id, [], brutto)
        : {
            ...zeile(e.erloesKonto.id, [], brutto),
            ...nettoSteuer(brutto, satz),
            steuersatz: satz,
            steuerArt: 'ust',
          },
    );
  }
  if (ziel.length > 0) {
    const raus = ziel.map((t) => ({ nennwertCent: t.nennwertCent, anzahl: -t.anzahl }));
    zeilen.push(zeile(e.kasse.id, alsStueckelung(anzahlenAus(raus))));
    zeilen.push(zeile(e.zielFachId, alsStueckelung(zielM)));
  }
  const nachschub = new Map<string, KassenTransfer[]>();
  for (const t of e.transfers)
    if (t.fachId !== e.zielFachId) nachschub.set(t.fachId, [...(nachschub.get(t.fachId) ?? []), t]);
  for (const [fachId, liste] of nachschub) {
    const raus = alsStueckelung(anzahlenAus(liste));
    zeilen.push(zeile(fachId, raus));
    zeilen.push(
      zeile(
        e.zielFachId,
        raus.map((s) => ({ nennwertCent: s.nennwertCent, anzahl: -s.anzahl })),
      ),
    );
  }
  // -0 would not survive JSON and the hash.
  for (const z of zeilen) z.betragCent = keinNull(z.betragCent);

  const warnungen: string[] = [];
  if (einnahmeCent < 0)
    warnungen.push(
      `Die Einnahme ist negativ (${formatEuro(einnahmeCent)}): In der Kasse ist weniger Geld, als die Buchhaltung erwartet.`,
    );
  if (!e.events.some((x) => x.zaehlungId))
    warnungen.push('Seit der letzten Abrechnung gibt es keine Dienst-Zählung.');
  else if (fehlerCent !== 0)
    warnungen.push(
      `Abweichung zur letzten Dienst-Zählung: ${fehlerCent > 0 ? '+' : ''}${formatEuro(fehlerCent)}.`,
    );
  for (const p of posten)
    if (p.danach !== p.grundbestand)
      warnungen.push(
        `Die Kasse geht nicht mit dem Grundbestand raus – ${formatEuro(p.nennwertCent)}: ${p.danach} statt ${p.grundbestand}.`,
      );
  return {
    sollCent,
    istCent,
    einnahmeCent,
    transferCent,
    fehlerCent,
    eventSummeCent,
    posten,
    zeilen,
    warnungen,
  };
}

/** Booking text of a Kassenabrechnung. */
export const kassenabrechnungBuchungstext = (kasse: string, einnahmeCent: number): string =>
  einnahmeCent === 0
    ? `Kassenabrechnung ${kasse}`
    : `Kassenabrechnung ${kasse}: Einnahme ${formatEuro(einnahmeCent)}`;

// ----- DTOs

/** An account reference (name for display). */
export interface KontoVerweisDto {
  id: string;
  name: string;
}

export interface KasseDto {
  kontoId: string;
  name: string;
  archiviert: boolean;
  /** All 13 denominations. */
  grundbestand: StueckelungDto[];
  /** All 13 denominations: the stock according to the books. */
  bestand: StueckelungDto[];
  saldoCent: number;
  standardErloesKonto: KontoVerweisDto;
  standardZielFach: KontoVerweisDto;
  /** The last Abrechnung that is not reversed. */
  letzteAbrechnung: { id: string; datum: string; buchung: BuchungVerweisDto | null } | null;
  /** Events with a Dienst-Zählung since the last Abrechnung. */
  offeneZaehlungen: number;
}

/** A Dienst-Zählung as the store returns it (counter still a Cognito sub). */
export interface KassenzaehlungEintrag {
  id: string;
  kontoId: string;
  kontoName: string;
  eventId: string;
  summeCent: number;
  /** All 13 denominations. */
  posten: StueckelungDto[];
  gezaehltVon: string;
  gezaehltAm: string;
  /** A newer count of the same Kasse at the same event exists: this one no longer counts. */
  ersetzt: boolean;
}

export interface KassenzaehlungDto extends Omit<KassenzaehlungEintrag, 'gezaehltVon'> {
  gezaehltVon: FinanzMitgliedDto | null;
}

/** Response of `POST /api/kassen/zaehlungen`. */
export interface KassenzaehlungErgebnisDto {
  id: string;
  summeCent: number;
  wiederholt?: boolean;
}

/** A Kasse the staff may count: no stock. */
export interface KasseKurzDto {
  kontoId: string;
  name: string;
}

/** A Dienst-Zählung offered in the Abrechnung (the newest per event). */
export interface KassenAbrechnungZaehlungEintrag {
  id: string;
  eventId: string;
  eventTitel: string;
  /** ISO timestamp. */
  eventBeginn: string;
  summeCent: number;
  gezaehltVon: string;
  gezaehltAm: string;
}

export interface KassenAbrechnungZaehlungDto extends Omit<
  KassenAbrechnungZaehlungEintrag,
  'gezaehltVon'
> {
  gezaehltVon: FinanzMitgliedDto | null;
}

/** `GET /api/finanzen/kassen/:kontoId/abrechnung`. */
export interface KassenabrechnungVorschauEintrag {
  kasse: KasseDto;
  /** The newest Dienst-Zählung per event since the last Abrechnung, ordered by event start. */
  zaehlungen: KassenAbrechnungZaehlungEintrag[];
}

export interface KassenabrechnungVorschauDto extends Omit<
  KassenabrechnungVorschauEintrag,
  'zaehlungen'
> {
  zaehlungen: KassenAbrechnungZaehlungDto[];
}

/** Response of `POST /api/finanzen/kassenabrechnungen`. */
export interface KassenabrechnungErgebnisDto {
  id: string;
  /** The booking; null when nothing changed. */
  buchungId: string | null;
  buchungSeq: number | null;
  einnahmeCent: number;
  fehlerCent: number;
  /** True when the idempotency key was already used: the existing Abrechnung is returned. */
  wiederholt?: boolean;
}

export interface KassenabrechnungListeEintrag {
  id: string;
  kontoId: string;
  kontoName: string;
  datum: string;
  sollCent: number;
  istCent: number;
  einnahmeCent: number;
  fehlerCent: number;
  buchung: BuchungVerweisDto | null;
  /** The booking was reversed: the Abrechnung no longer counts. */
  storniert: boolean;
  erstelltVon: string;
  erstelltAm: string;
}

export interface KassenabrechnungTransferDto {
  fachId: string;
  fachName: string;
  nennwertCent: number;
  anzahl: number;
}

export interface KassenabrechnungEventDto {
  eventId: string;
  eventTitel: string;
  /** ISO timestamp. */
  eventBeginn: string;
  zaehlungId: string | null;
  betragCent: number;
}

export interface KassenabrechnungDetailEintrag extends KassenabrechnungListeEintrag {
  erloesKonto: KontoVerweisDto;
  zielFach: KontoVerweisDto;
  transferCent: number;
  /** All 13 denominations. */
  posten: KassenPosten[];
  transfers: KassenabrechnungTransferDto[];
  events: KassenabrechnungEventDto[];
}

export interface KassenabrechnungListeDto extends Omit<
  KassenabrechnungListeEintrag,
  'erstelltVon'
> {
  erstelltVon: FinanzMitgliedDto | null;
}

export interface KassenabrechnungDetailDto extends Omit<
  KassenabrechnungDetailEintrag,
  'erstelltVon'
> {
  erstelltVon: FinanzMitgliedDto | null;
}

/** `GET /api/finanzen/kassenabrechnungen`: newest first, at most `KASSENABRECHNUNGEN_MAX`. */
export interface KassenabrechnungenSeiteDto {
  abrechnungen: KassenabrechnungListeDto[];
  gekappt: boolean;
}
