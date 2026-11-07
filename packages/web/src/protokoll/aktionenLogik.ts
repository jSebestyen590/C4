import type { ProtokollAktionAusgang, ProtokollAktionDto } from '@c4/shared';

/** Whether the Aktion can be run now (not done, executable). */
export const aktionLaeuft = (a: Pick<ProtokollAktionDto, 'ausfuehrbar' | 'zustand'>): boolean =>
  a.ausfuehrbar && (a.zustand === 'offen' || a.zustand === 'fehler');

/** Ids that are pre-checked in the closing dialog: executable and not tried yet. */
export const vorgewaehlteAktionen = (
  aktionen: readonly Pick<ProtokollAktionDto, 'id' | 'ausfuehrbar' | 'zustand'>[],
): string[] => aktionen.filter((a) => a.ausfuehrbar && a.zustand === 'offen').map((a) => a.id);

/** Toggles an id in the selection (keeps the order of `aktionen`). */
export function auswahlUmschalten(auswahl: readonly string[], id: string, an: boolean): string[] {
  const ohne = auswahl.filter((x) => x !== id);
  return an ? [...ohne, id] : ohne;
}

/** Ids of the selection that still exist and can run (stale ids are dropped). */
export const gueltigeAuswahl = (
  auswahl: readonly string[],
  aktionen: readonly Pick<ProtokollAktionDto, 'id' | 'ausfuehrbar' | 'zustand'>[],
): string[] => {
  const erlaubt = new Set(aktionen.filter(aktionLaeuft).map((a) => a.id));
  return auswahl.filter((id) => erlaubt.has(id));
};

const zahl = (n: number, einzahl: string, mehrzahl: string) =>
  `${n} ${n === 1 ? einzahl : mehrzahl}`;

/**
 * Text of the notification after Aktionen ran, e.g. "3 Aktionen erledigt, 1 fehlgeschlagen".
 * Skipped ones are not mentioned; null when nothing was erledigt or failed.
 */
export function ergebnisZusammenfassung(
  ausgang: readonly Pick<ProtokollAktionAusgang, 'status'>[],
): string | null {
  const erledigt = ausgang.filter((a) => a.status === 'erledigt').length;
  const fehler = ausgang.filter((a) => a.status === 'fehler').length;
  const teile: string[] = [];
  if (erledigt > 0) teile.push(`${zahl(erledigt, 'Aktion', 'Aktionen')} erledigt`);
  if (fehler > 0) teile.push(`${fehler} fehlgeschlagen`);
  return teile.length > 0 ? teile.join(', ') : null;
}

/** Label of the state in the closed-protocol card. */
export function zustandText(a: Pick<ProtokollAktionDto, 'zustand'>): string {
  switch (a.zustand) {
    case 'erledigt':
      return 'Erledigt';
    case 'fehler':
      return 'Fehlgeschlagen';
    case 'nicht_ausfuehrbar':
      return 'Nicht ausführbar';
    default:
      return 'Offen';
  }
}
