import { datumAnzeigen, type Wiederholung } from '@c4/shared';

export type WiederholungArt = 'Abstimmung' | 'Aufnahme-Abstimmung' | 'Wahl';

/** "Wiederholung der Abstimmung vom 05.11.2026 (Sitzung), damals nicht beschlussfähig." */
export function wiederholungText(art: WiederholungArt, w: NonNullable<Wiederholung>): string {
  const sitzung = w.sitzung.trim();
  return `Wiederholung der ${art} vom ${datumAnzeigen(w.datum)}${sitzung ? ` (${sitzung})` : ''}, damals nicht beschlussfähig.`;
}
