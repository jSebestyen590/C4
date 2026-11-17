import { eintragWirkungCent, formatEuro, istUeberzug, type BuchSeiteDto } from '@c4/shared';

/** What was typed for one page; `striche` is the raw text of the field. */
export interface BuchEingabe {
  striche: string;
  barCent: number | null;
  abzahlungCent: number | null;
}

export interface BuchZeilenRechnung {
  striche: number;
  barCent: number;
  abzahlungCent: number;
  /** Nothing typed: the row is ignored. */
  leer: boolean;
  /** Effect on the balance with the tarif of today. */
  wirkungCent: number;
  saldoDanachCent: number;
  /** Striche but no tarif: the row cannot be saved. */
  ohneTarif: boolean;
  /** The balance after the row is below the allowed overdraft. */
  ueberzug: boolean;
}

/** Digits only; anything else counts as empty. */
export const strichePruefen = (text: string): number => {
  const n = /^\d{1,5}$/.test(text.trim()) ? Number(text.trim()) : 0;
  return Number.isSafeInteger(n) ? n : 0;
};

export function rechneZeile(
  seite: Pick<BuchSeiteDto, 'saldoCent' | 'tarif'>,
  e: BuchEingabe | undefined,
): BuchZeilenRechnung {
  const striche = strichePruefen(e?.striche ?? '');
  const barCent = e?.barCent ?? 0;
  const abzahlungCent = e?.abzahlungCent ?? 0;
  const strichwertCent = seite.tarif?.strichwertCent ?? 0;
  const wirkungCent = eintragWirkungCent({ striche, strichwertCent, barCent, abzahlungCent });
  const saldoDanachCent = seite.saldoCent + wirkungCent;
  const leer = striche === 0 && barCent === 0 && abzahlungCent === 0;
  return {
    striche,
    barCent,
    abzahlungCent,
    leer,
    wirkungCent,
    saldoDanachCent,
    ohneTarif: striche > 0 && !seite.tarif,
    ueberzug: !leer && !!seite.tarif && istUeberzug(saldoDanachCent, seite.tarif.maxUeberzugCent),
  };
}

/** Confirmable warning of a page that goes over its limit with this Abrechnung. */
export const ueberzugWarnung = (
  name: string,
  rechnung: Pick<BuchZeilenRechnung, 'saldoDanachCent'>,
  maxUeberzugCent: number,
): string =>
  `${name} liegt danach bei ${formatEuro(rechnung.saldoDanachCent)} (erlaubt: ${formatEuro(0 - maxUeberzugCent)}).`;

/** The next id after `aktuell` that is not closed yet (wrapping around); null when all are closed. */
export function naechsteOffene(
  ids: readonly string[],
  abgeschlossen: ReadonlySet<string>,
  aktuell: string,
): string | null {
  const start = ids.indexOf(aktuell);
  for (let i = 1; i <= ids.length; i++) {
    const id = ids[(start + i) % ids.length];
    if (id !== undefined && id !== aktuell && !abgeschlossen.has(id)) return id;
  }
  return null;
}
