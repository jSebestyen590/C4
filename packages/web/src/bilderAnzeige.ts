import { datumAnzeigen, type BilderOrdnerDto } from '@c4/shared';

/**
 * German date text of a photo folder: `14.06.2025`, `18.–20.07.2025`, `30.07.–02.08.2025`,
 * `30.12.2025–02.01.2026`; null for folders without a date.
 */
export function bilderDatum(von: string | null, bis: string | null): string | null {
  if (von === null) return null;
  if (bis === null || bis <= von) return datumAnzeigen(von);
  const [vj, vm, vt] = von.split('-') as [string, string, string];
  const [bj, bm] = bis.split('-') as [string, string, string];
  if (vj === bj && vm === bm) return `${vt}.–${datumAnzeigen(bis)}`;
  if (vj === bj) return `${vt}.${vm}.–${datumAnzeigen(bis)}`;
  return `${datumAnzeigen(von)}–${datumAnzeigen(bis)}`;
}

export const OHNE_DATUM = 'Ohne Datum';

export interface BilderJahr {
  jahr: string;
  ordner: BilderOrdnerDto[];
}

/** Groups an already sorted list by the year of `von`; folders without a date form the last group. */
export function bilderNachJahr(ordner: readonly BilderOrdnerDto[]): BilderJahr[] {
  const gruppen: BilderJahr[] = [];
  for (const o of ordner) {
    const jahr = o.von === null ? OHNE_DATUM : o.von.slice(0, 4);
    const letzte = gruppen.at(-1);
    if (letzte?.jahr === jahr) letzte.ordner.push(o);
    else gruppen.push({ jahr, ordner: [o] });
  }
  return gruppen;
}
