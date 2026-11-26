import { z } from 'zod';
import { datumAnzeigen, tagVorher } from './datum';
import { idempotenzSchluessel } from './finanzen';
import { datumBerlin, zeitBerlin } from './kalender';
import { nettoSteuer, type KassenZeile } from './kassen';

// SumUp card revenue (Finanzen slice 7): pure logic for grouping transactions, planning the
// bookings and matching payouts to bank transactions. See docs/finanzen.md („SumUp“).

/** Fixed accounts. The Guthaben account already exists since migration 0256 under the id `sumup`. */
export const SUMUP_GUTHABEN_KONTO_ID = 'sumup';
export const SUMUP_ERLOES_KONTO_ID = 'kartenerloese';
export const SUMUP_GEBUEHREN_KONTO_ID = 'sumup-gebuehren';
/** Tax rate of the card revenue in basis points (19 %). */
export const SUMUP_ERLOES_SATZ_BP = 1900;

/** A card transaction may still belong to an event this long after its end. */
export const SUMUP_EVENT_NACHLAUF_MS = 3 * 3600_000;
/** The business day ends at 06:00 (Europe/Berlin): 02:00 belongs to the previous day. */
export const SUMUP_TAGESWECHSEL_STUNDE = 6;
/** A bank transaction may be at most this many days away from the payout date. */
export const SUMUP_AUSZAHLUNG_TOLERANZ_TAGE = 5;

export interface SumupTransaktion {
  id: string;
  transactionCode: string;
  /** ISO instant. */
  zeitpunkt: string;
  /** Negative for REFUND / CHARGE_BACK. */
  betragCent: number;
  typ: string;
  status: string;
  trinkgeldCent: number;
  sumupBenutzer: string | null;
}

export interface SumupAuszahlungZeile {
  id: string;
  /** `YYYY-MM-DD`. */
  datum: string;
  /** `PAYOUT` or a `*_DEDUCTION`. */
  typ: string;
  betragCent: number;
  gebuehrCent: number;
  transactionCode: string | null;
  referenz: string | null;
  status: string;
}

export interface SumupAuszahlung {
  /** `YYYY-MM-DD`, also the id of the payout. */
  datum: string;
  bruttoCent: number;
  gebuehrCent: number;
  /** What arrives on the bank account. */
  nettoCent: number;
  zeilen: SumupAuszahlungZeile[];
}

/** Minimal event shape (a subset of `EventDto`). */
export interface SumupEvent {
  id: string;
  beginn: string;
  ende: string;
  abgesagt: boolean;
}

export type SumupHinweis = 'trinkgeld' | 'ohne_event';

export interface SumupGruppe {
  /** `event:<id>` or `tag:<YYYY-MM-DD>`. */
  key: string;
  /** Business day (`YYYY-MM-DD`); for an event the business day of its start. */
  geschaeftstag: string;
  eventId: string | null;
  transaktionen: SumupTransaktion[];
  summeCent: number;
  anzahl: number;
  hinweise: SumupHinweis[];
}

/**
 * The event a transaction most likely belongs to: not cancelled and `zeitpunkt` in
 * [beginn, ende + 3 h]; on overlap the event that started last; otherwise null.
 */
export function sumupEventVorschlag(
  zeitpunkt: string,
  events: readonly SumupEvent[],
): SumupEvent | null {
  const t = new Date(zeitpunkt).getTime();
  let treffer: SumupEvent | null = null;
  let trefferBeginn = -Infinity;
  for (const e of events) {
    if (e.abgesagt) continue;
    const beginn = new Date(e.beginn).getTime();
    const ende = new Date(e.ende).getTime() + SUMUP_EVENT_NACHLAUF_MS;
    if (t < beginn || t > ende) continue;
    if (beginn > trefferBeginn) {
      treffer = e;
      trefferBeginn = beginn;
    }
  }
  return treffer;
}

/** Business day (`YYYY-MM-DD`, Europe/Berlin) of an instant; before 06:00 it is the previous day. */
export function sumupGeschaeftstag(zeitpunkt: string): string {
  const tag = datumBerlin(zeitpunkt);
  // Wall clock based, so it stays correct on the days of the DST change.
  const stunde = Number(zeitBerlin(zeitpunkt).slice(0, 2));
  return stunde < SUMUP_TAGESWECHSEL_STUNDE ? tagVorher(tag) : tag;
}

/** Groups transactions per suggested event, else per business day; sorted by business day. */
export function sumupGruppen(
  transaktionen: readonly SumupTransaktion[],
  events: readonly SumupEvent[],
): SumupGruppe[] {
  const gruppen = new Map<string, SumupGruppe>();
  const eventsById = new Map(events.map((e) => [e.id, e]));
  for (const tx of transaktionen) {
    const event = sumupEventVorschlag(tx.zeitpunkt, events);
    const key = event ? `event:${event.id}` : `tag:${sumupGeschaeftstag(tx.zeitpunkt)}`;
    let g = gruppen.get(key);
    if (!g) {
      g = {
        key,
        geschaeftstag: event
          ? sumupGeschaeftstag(eventsById.get(event.id)!.beginn)
          : sumupGeschaeftstag(tx.zeitpunkt),
        eventId: event?.id ?? null,
        transaktionen: [],
        summeCent: 0,
        anzahl: 0,
        hinweise: event ? [] : ['ohne_event'],
      };
      gruppen.set(key, g);
    }
    g.transaktionen.push(tx);
    g.summeCent += tx.betragCent;
    g.anzahl += 1;
    if (tx.trinkgeldCent !== 0 && !g.hinweise.includes('trinkgeld')) g.hinweise.push('trinkgeld');
  }
  const liste = [...gruppen.values()];
  for (const g of liste)
    g.transaktionen.sort(
      (a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt) || a.id.localeCompare(b.id),
    );
  return liste.sort(
    (a, b) =>
      a.geschaeftstag.localeCompare(b.geschaeftstag) ||
      (a.transaktionen[0]?.zeitpunkt ?? '').localeCompare(b.transaktionen[0]?.zeitpunkt ?? ''),
  );
}

export interface SumupBuchungPlan {
  /** Business day of the group. */
  datum: string;
  text: string;
  eventId: string | null;
  zeilen: KassenZeile[];
}

const zeile = (
  kontoId: string,
  betragCent: number,
  extra: Partial<KassenZeile> = {},
): KassenZeile => ({
  kontoId,
  betragCent,
  nettoCent: null,
  steuerCent: null,
  steuersatz: null,
  steuerArt: 'keine',
  stueckelung: [],
  ...extra,
});

/**
 * Booking lines of one group: SumUp-Guthaben +gross, Kartenerlöse -gross (net/tax from the gross
 * amount, 19 %). Refunds make the sum negative; a sum of 0 cannot be booked.
 * `eventName` is the title of the event the Finanzer:in chose, if any.
 */
export function planeSumupBuchung(
  gruppe: Pick<SumupGruppe, 'geschaeftstag' | 'summeCent'>,
  eventId: string | null,
  eventName?: string | null,
): SumupBuchungPlan {
  const brutto = gruppe.summeCent;
  if (brutto === 0) throw new Error('Die Summe ist 0 und kann nicht gebucht werden.');
  const bezeichnung = eventName?.trim() || datumAnzeigen(gruppe.geschaeftstag);
  return {
    datum: gruppe.geschaeftstag,
    text: `SumUp ${bezeichnung}`,
    eventId,
    zeilen: [
      zeile(SUMUP_GUTHABEN_KONTO_ID, brutto),
      zeile(SUMUP_ERLOES_KONTO_ID, -brutto, {
        ...nettoSteuer(-brutto, SUMUP_ERLOES_SATZ_BP),
        steuersatz: SUMUP_ERLOES_SATZ_BP,
        steuerArt: 'ust',
      }),
    ],
  };
}

/**
 * One payout per date from the payout lines. ASSUMPTION (SumUp field semantics not yet
 * confirmed against real data): the lines' `betragCent` are what reaches the bank (deductions are
 * negative), `gebuehrCent` is the fee that SumUp already held back, so gross = net + fees.
 * Adjust only here if the real data says otherwise.
 */
export function sumupAuszahlungen(zeilen: readonly SumupAuszahlungZeile[]): SumupAuszahlung[] {
  const nachDatum = new Map<string, SumupAuszahlungZeile[]>();
  for (const z of zeilen) nachDatum.set(z.datum, [...(nachDatum.get(z.datum) ?? []), z]);
  return [...nachDatum.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([datum, liste]) => {
      const nettoCent = liste.reduce((s, z) => s + z.betragCent, 0);
      const gebuehrCent = liste.reduce((s, z) => s + z.gebuehrCent, 0);
      return { datum, bruttoCent: nettoCent + gebuehrCent, gebuehrCent, nettoCent, zeilen: liste };
    });
}

// ----- Interface to the bank slice (kept narrow and compatible with its types)

export type SumupBankVorschlag = {
  art: 'sumup_auszahlung';
  zielId: string;
  kontoId?: string;
  text: string;
  punkte: number;
};

export type SumupBankUmsatz = {
  betragCent: number;
  buchungsdatum: string;
  verwendungszweck: string;
  gegenName: string;
};

const tageZwischen = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/**
 * Suggests the open payout that belongs to a bank transaction: same amount as the net payout and
 * at most 5 days apart. "SumUp" in the counterparty or purpose and a closer date score higher.
 */
export function sumupAuszahlungFuerUmsatz(
  umsatz: SumupBankUmsatz,
  offeneAuszahlungen: readonly SumupAuszahlung[],
): SumupBankVorschlag | null {
  const nennt = /sumup/i.test(`${umsatz.gegenName} ${umsatz.verwendungszweck}`);
  let best: SumupBankVorschlag | null = null;
  for (const a of offeneAuszahlungen) {
    if (a.nettoCent !== umsatz.betragCent) continue;
    const abstand = Math.abs(tageZwischen(umsatz.buchungsdatum, a.datum));
    if (abstand > SUMUP_AUSZAHLUNG_TOLERANZ_TAGE) continue;
    const punkte = 50 + (nennt ? 30 : 0) + (SUMUP_AUSZAHLUNG_TOLERANZ_TAGE - abstand) * 4;
    if (!best || punkte > best.punkte)
      best = {
        art: 'sumup_auszahlung',
        zielId: a.datum,
        text: `SumUp-Auszahlung vom ${datumAnzeigen(a.datum)}`,
        punkte,
      };
  }
  return best;
}

/**
 * Booking lines for a bank transaction that settles a payout: bank +net, SumUp-Gebühren +fees,
 * SumUp-Guthaben -(net + fees). The amount must equal the net payout.
 */
export function planeSumupAuszahlung(
  umsatz: SumupBankUmsatz,
  auszahlung: SumupAuszahlung,
  bankKontoId: string,
): { datum: string; text: string; zeilen: KassenZeile[] } {
  if (umsatz.betragCent !== auszahlung.nettoCent)
    throw new Error(
      'Der Betrag des Bankumsatzes passt nicht zur SumUp-Auszahlung vom ' +
        `${datumAnzeigen(auszahlung.datum)}.`,
    );
  const zeilen = [zeile(bankKontoId, auszahlung.nettoCent)];
  if (auszahlung.gebuehrCent !== 0)
    zeilen.push(zeile(SUMUP_GEBUEHREN_KONTO_ID, auszahlung.gebuehrCent));
  zeilen.push(zeile(SUMUP_GUTHABEN_KONTO_ID, -(auszahlung.nettoCent + auszahlung.gebuehrCent)));
  return {
    datum: umsatz.buchungsdatum,
    text: `SumUp-Auszahlung vom ${datumAnzeigen(auszahlung.datum)}`,
    zeilen,
  };
}

// ----- API DTOs

/** A booking group of the overview, enriched with the suggested event. */
export interface SumupGruppeDto extends SumupGruppe {
  eventTitel: string | null;
  eventBeginn: string | null;
}

/** A payout of the overview; `zugeordnet` is set once slice 6 matched it to a bank transaction. */
export interface SumupAuszahlungDto extends SumupAuszahlung {
  status: 'offen' | 'zugeordnet';
}

/** An event the Finanzer:in can choose for a group. */
export interface SumupEventDto {
  id: string;
  titel: string | null;
  beginn: string;
  ende: string;
  abgesagt: boolean;
}

export interface SumupUebersichtDto {
  /** Open (not yet booked) transactions as groups, sorted by business day. */
  gruppen: SumupGruppeDto[];
  /** Events around the open transactions, for the event picker. */
  events: SumupEventDto[];
  auszahlungen: SumupAuszahlungDto[];
  /** ISO instant of the last fetch; null when nothing was fetched yet. */
  letzterAbrufAm: string | null;
  /** Balance of the account SumUp-Guthaben in cents. */
  saldoCent: number;
}

export interface SumupAbrufErgebnis {
  /** True when SumUp is not set up (no secret). */
  uebersprungen?: boolean;
  transaktionenNeu: number;
  auszahlungenNeu: number;
  /** False when the run was cut at the page budget; the next run continues. */
  vollstaendig: boolean;
}

export const sumupBuchenSchema = z.object({
  transaktionIds: z.array(z.string().min(1)).min(1, 'Wähle mindestens eine Zahlung aus.').max(2000),
  /** The event the group belongs to; null = booked per business day without an event. */
  eventId: z.string().min(1).nullable(),
  idempotenzSchluessel,
});
export type SumupBuchenEingabe = z.output<typeof sumupBuchenSchema>;

export interface SumupBuchenErgebnis {
  id: string;
  seq: number;
  datum: string;
  wiederholt?: boolean;
}
