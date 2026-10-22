import {
  ifcosPassen,
  ifcoTypText,
  nochPlatzFuer,
  type IfcoMass,
  type IfcoPlatzMasse,
} from '@c4/shared';
import type { IfcoEintrag, IfcoTypEintrag } from './inventarDaten';

/** The Ifco-Lagerplatz dimensions of a Lagerort, null for a normal one. */
export function ifcoPlatzMasse(l: {
  ifcoHoeheCm: number | null;
  ifcoStellflaechen: number | null;
}): IfcoPlatzMasse | null {
  return l.ifcoHoeheCm !== null && l.ifcoStellflaechen !== null
    ? { hoeheCm: l.ifcoHoeheCm, stellflaechen: l.ifcoStellflaechen }
    : null;
}

/** Non-archived Ifcos standing at a place (archived ones take no space), optionally without one Ifco. */
export const ifcosAufPlatz = (ifcos: IfcoEintrag[], lagerortId: string, ohneId?: string) =>
  ifcos.filter((i) => i.lagerortId === lagerortId && !i.archiviert && i.id !== ohneId);

/** Footprint and height of an Ifco's type, null without a (known) type. */
export function ifcoMass(typId: string | null, typen: IfcoTypEintrag[]): IfcoMass | null {
  return typen.find((t) => t.id === typId) ?? null;
}

/** Dimensions of the standing Ifcos; those without a type are left out (the API forbids them there). */
export const stehendeMasse = (stehend: IfcoEintrag[], typen: IfcoTypEintrag[]): IfcoMass[] =>
  stehend.flatMap((i) => ifcoMass(i.typId, typen) ?? []);

/** `2 Ifcos` / `1 Ifco` */
export const ifcosText = (n: number): string => `${n} ${n === 1 ? 'Ifco' : 'Ifcos'}`;

/** `6410 · 60×40 · 10 cm`, or `Ohne Typ`. */
export function typAnzeige(typId: string | null, typen: IfcoTypEintrag[]): string {
  const typ = typen.find((t) => t.id === typId);
  return typ ? ifcoTypText(typ) : 'Ohne Typ';
}

/**
 * `Passt noch: 1× 6410 oder 2× 4310` (the types with the most room first, at most `max`), or
 * `Voll` when no type fits any more.
 */
export function passtNochText(
  platz: IfcoPlatzMasse,
  stehend: IfcoEintrag[],
  typen: IfcoTypEintrag[],
  max = 4,
): string {
  const frei = nochPlatzFuer(platz, stehendeMasse(stehend, typen), typen)
    .filter((f) => f.anzahl > 0)
    .map((f) => ({ ...f, name: typen.find((t) => t.id === f.typId)?.name ?? '' }))
    .sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, 'de', { numeric: true }))
    .slice(0, max);
  return frei.length === 0
    ? 'Voll'
    : `Passt noch: ${frei.map((f) => `${f.anzahl}× ${f.name}`).join(' oder ')}`;
}

/**
 * Whether the Ifco `ifco` (with the type `typId`) fits on the Ifco-Lagerplatz `platz` next to the
 * Ifcos standing there, with a short reason when it does not.
 */
export function platzPasst(
  platz: IfcoPlatzMasse,
  lagerortId: string,
  ifco: { id: string },
  typId: string | null,
  ifcos: IfcoEintrag[],
  typen: IfcoTypEintrag[],
): { passt: boolean; grund: string | null } {
  const mass = ifcoMass(typId, typen);
  if (!mass) return { passt: false, grund: 'Typ nötig' };
  const stehend = stehendeMasse(ifcosAufPlatz(ifcos, lagerortId, ifco.id), typen);
  return ifcosPassen(platz, [...stehend, mass])
    ? { passt: true, grund: null }
    : { passt: false, grund: 'passt nicht' };
}
