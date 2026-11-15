/**
 * Order in which a table of count fields is walked with Tab, Enter and the iOS keyboard arrows. The
 * fields are rendered in this order (DOM order), see `StueckelungFeld`.
 */
export type FeldReihenfolge = 'zeilen' | 'spalten';

/**
 * The fields of a table with `zeilen` rows and `spalten` count columns as `[zeile, spalte]` pairs in
 * walking order: row by row (1 ct Abgang -> 1 ct Zugang -> 2 ct Abgang ...) or column by column
 * (all of the first column, then all of the second).
 */
export function feldReihenfolge(
  zeilen: number,
  spalten: number,
  modus: FeldReihenfolge,
): [number, number][] {
  const felder: [number, number][] = [];
  if (modus === 'zeilen') {
    for (let z = 0; z < zeilen; z++) for (let s = 0; s < spalten; s++) felder.push([z, s]);
  } else {
    for (let s = 0; s < spalten; s++) for (let z = 0; z < zeilen; z++) felder.push([z, s]);
  }
  return felder;
}
