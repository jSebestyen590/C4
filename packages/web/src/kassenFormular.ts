import {
  anzahlenAus,
  NENNWERTE_CENT,
  type BestandKonto,
  type EventEinnahme,
  type KassenTransfer,
  type StueckelungDto,
} from '@c4/shared';
import { mengeVon, mengenStueckelung, type Mengen } from './bargeldFormular';

// Pure logic of the Kassen pages (Abrechnung): Fehlbestand, Nachschub (coin rolls), the transfers of
// the request body and the event allocation as typed.

/** Nachschub of one denomination: the Fach to take from and how many pieces (rolls x roll size). */
export interface NachschubWahl {
  fachId: string | null;
  stueck: number | null;
}
export type NachschubMap = Record<number, NachschubWahl | undefined>;

/**
 * Per denomination how many pieces are still missing to refill the Kasse to the Grundbestand:
 * `grundbestand - ist` minus what the transfer takes from the Ziel-Fach (negative transfer).
 * Only denominations with a positive shortfall appear.
 */
export function fehlbestandJe(
  ist: Mengen,
  grundbestand: readonly StueckelungDto[],
  transfer: Mengen,
): Map<number, number> {
  const grund = anzahlenAus(grundbestand);
  const fehlt = new Map<number, number>();
  for (const n of NENNWERTE_CENT) {
    const bedarf = (grund.get(n) ?? 0) - mengeVon(ist, n);
    const gedeckt = Math.max(0, -mengeVon(transfer, n));
    if (bedarf - gedeckt > 0) fehlt.set(n, bedarf - gedeckt);
  }
  return fehlt;
}

/** The Ziel-Fach stock with the Nachschub that lands in it. */
export function zielBestandMitNachschub(
  bestandZiel: readonly StueckelungDto[],
  nachschub: NachschubMap,
): StueckelungDto[] {
  const m = anzahlenAus(bestandZiel);
  for (const n of NENNWERTE_CENT) {
    const w = nachschub[n];
    if (w?.fachId && w.stueck && w.stueck > 0) m.set(n, (m.get(n) ?? 0) + w.stueck);
  }
  return NENNWERTE_CENT.map((n) => ({ nennwertCent: n, anzahl: m.get(n) ?? 0 }));
}

/** Transfers of the request: the Ziel-Fach entries as typed (signed) and every Nachschub as a negative count. */
export function transfersBody(
  zielFachId: string,
  transfer: Mengen,
  nachschub: NachschubMap,
): KassenTransfer[] {
  const ziel = mengenStueckelung(transfer).map((s) => ({ fachId: zielFachId, ...s }));
  const quellen = NENNWERTE_CENT.flatMap((n) => {
    const w = nachschub[n];
    return w?.fachId && w.stueck && w.stueck > 0
      ? [{ fachId: w.fachId, nennwertCent: n, anzahl: -w.stueck }]
      : [];
  });
  return [...ziel, ...quellen];
}

/** The proposal with the amounts the user typed laid over it (typed `null` = emptied = 0). */
export function eventBetraegeMit(
  vorschlag: readonly EventEinnahme[],
  eingaben: Readonly<Record<string, number | null | undefined>>,
): EventEinnahme[] {
  return vorschlag.map((v) => {
    const e = eingaben[v.eventId];
    return e === undefined ? v : { ...v, betragCent: e ?? 0 };
  });
}

/** The Fächer as stock accounts for the client-side stock rule. */
export function faecherAlsBestand(
  faecher: readonly {
    id: string;
    name: string;
    saldoCent: number;
    bestand: readonly StueckelungDto[];
  }[],
): BestandKonto[] {
  return faecher.map((f) => ({
    id: f.id,
    name: f.name,
    art: 'bargeld',
    stueckelung: true,
    saldoCent: f.saldoCent,
    anzahl: anzahlenAus(f.bestand),
  }));
}

/** `Mengen` of the Grundbestand as a form start value. */
export const grundbestandMengen = (g: readonly StueckelungDto[]): Mengen =>
  Object.fromEntries(g.filter((s) => s.anzahl > 0).map((s) => [s.nennwertCent, s.anzahl]));
