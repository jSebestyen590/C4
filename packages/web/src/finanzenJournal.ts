import { centAnzeigen, type BuchungListeDto, type BuchungRichtungDto } from '@c4/shared';
import { mitgliedName } from './mitglied';

/** How many accounts of one side the journal names before it says "+ N weitere". */
export const RICHTUNG_MAX = 2;

export interface RichtungKurz {
  /** Names shown directly. */
  namen: string[];
  /** Number of accounts hidden behind "+ N weitere". */
  weitere: number;
}

/** Shortens one side of a booking: up to two names, else the first one and a count. */
export function richtungKurz(konten: readonly BuchungRichtungDto[]): RichtungKurz {
  if (konten.length <= RICHTUNG_MAX) return { namen: konten.map((k) => k.kontoName), weitere: 0 };
  return { namen: [konten[0]!.kontoName], weitere: konten.length - 1 };
}

/** "Bank (Fyrst)", "Bank, Safe" or "Bank + 3 weitere"; "–" when the side is empty. */
export function richtungText(konten: readonly BuchungRichtungDto[]): string {
  const { namen, weitere } = richtungKurz(konten);
  if (namen.length === 0) return '–';
  const text = namen.join(', ');
  return weitere > 0 ? `${text} + ${weitere} weitere` : text;
}

/** "Bank (Fyrst) → Geldtransit". */
export function vonNachText(
  abgang: readonly BuchungRichtungDto[],
  zugang: readonly BuchungRichtungDto[],
): string {
  return `${richtungText(abgang)} → ${richtungText(zugang)}`;
}

/** "Bank: 25,50 €" lines for the tooltip of a shortened side. */
export function richtungZeilen(konten: readonly BuchungRichtungDto[]): string[] {
  return konten.map((k) => `${k.kontoName}: ${centAnzeigen(k.betragCent)}`);
}

/** "Zugang 25,50 €" / "Abgang 25,50 €": word plus amount, so the direction is not only a color. */
export function bewegungText(betragCent: number): string {
  if (betragCent === 0) return centAnzeigen(0);
  return `${betragCent > 0 ? 'Zugang' : 'Abgang'} ${centAnzeigen(Math.abs(betragCent))}`;
}

/** Running balance; negative values carry an explicit minus sign and are marked by the caller. */
export function saldoText(saldoCent: number): string {
  return centAnzeigen(saldoCent).replace('-', '−');
}

export const SORT_SPALTEN = [
  'nr',
  'datum',
  'text',
  'konten',
  'betrag',
  'saldo',
  'erstellt',
] as const;
export type SortSpalte = (typeof SORT_SPALTEN)[number];
export type SortRichtung = 'asc' | 'desc';

export const SORT_STANDARD: { spalte: SortSpalte; richtung: SortRichtung } = {
  spalte: 'nr',
  richtung: 'desc',
};

/** Reads `sort`/`richtung` from the URL; anything unknown falls back to Nr. descending. */
export function sortAusParams(
  sort: string | null,
  richtung: string | null,
  mitSaldo: boolean,
): { spalte: SortSpalte; richtung: SortRichtung } {
  const spalte = SORT_SPALTEN.find((s) => s === sort);
  if (!spalte || (spalte === 'saldo' && !mitSaldo)) return SORT_STANDARD;
  return { spalte, richtung: richtung === 'asc' ? 'asc' : 'desc' };
}

/** The accounts column as displayed: the counter account for an account statement, else "Von → Nach". */
export function kontenText(
  b: Pick<BuchungListeDto, 'abgang' | 'zugang' | 'konto'>,
  mitKonto: boolean,
): string {
  if (mitKonto && b.konto) return richtungText(b.konto.betragCent < 0 ? b.zugang : b.abgang);
  return vonNachText(b.abgang, b.zugang);
}

type SortBuchung = Pick<
  BuchungListeDto,
  'seq' | 'datum' | 'text' | 'abgang' | 'zugang' | 'konto' | 'betragCent' | 'erstelltVon'
>;

const text = (a: string, b: string) => a.localeCompare(b, 'de');

/** Sorts a copy by one column; ties fall back to Datum, then Nr. (always in the same direction). */
export function journalSortieren<B extends SortBuchung>(
  liste: readonly B[],
  spalte: SortSpalte,
  richtung: SortRichtung,
  mitKonto: boolean,
): B[] {
  const vergleich = (a: B, b: B): number => {
    switch (spalte) {
      case 'nr':
        return a.seq - b.seq;
      case 'datum':
        return a.datum.localeCompare(b.datum);
      case 'text':
        return text(a.text, b.text);
      case 'konten':
        return text(kontenText(a, mitKonto), kontenText(b, mitKonto));
      case 'betrag':
        return mitKonto
          ? (a.konto?.betragCent ?? 0) - (b.konto?.betragCent ?? 0)
          : a.betragCent - b.betragCent;
      case 'saldo':
        return (a.konto?.saldoNachCent ?? 0) - (b.konto?.saldoNachCent ?? 0);
      case 'erstellt':
        // Unknown creators ("–") sort first.
        return text(
          a.erstelltVon ? mitgliedName(a.erstelltVon) : '',
          b.erstelltVon ? mitgliedName(b.erstelltVon) : '',
        );
    }
  };
  const vorzeichen = richtung === 'asc' ? 1 : -1;
  return [...liste].sort(
    (a, b) => vorzeichen * (vergleich(a, b) || a.datum.localeCompare(b.datum) || a.seq - b.seq),
  );
}

/** Column title; an account statement says "Gegenkonto" and "Bewegung". */
export function sortLabel(spalte: SortSpalte, mitKonto: boolean): string {
  switch (spalte) {
    case 'nr':
      return 'Nr.';
    case 'datum':
      return 'Datum';
    case 'text':
      return 'Text';
    case 'konten':
      return mitKonto ? 'Gegenkonto' : 'Von → Nach';
    case 'betrag':
      return mitKonto ? 'Bewegung' : 'Betrag';
    case 'saldo':
      return 'Saldo danach';
    case 'erstellt':
      return 'Erstellt von';
  }
}
