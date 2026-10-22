import { z } from 'zod';

// Ifco types and the capacity of Ifco-Lagerplätze (pure, no I/O).
//
// Model: the floor of a place consists of `2 × stellflaechen` half-columns, each `hoeheCm` high. A
// small Ifco (40×30) stands in one half-column and uses its height there; a large Ifco (60×40) uses
// two half-columns, with its height in each of them. A set of Ifcos fits when they can be assigned
// to half-columns so that no half-column's sum of heights exceeds the place height. Which two
// half-columns a large Ifco takes does not matter (a deliberate simplification: it may rest on two
// half-columns of different heights).

export const IFCO_GRUNDFLAECHEN = ['gross', 'klein'] as const;
export type IfcoGrundflaeche = (typeof IFCO_GRUNDFLAECHEN)[number];

/** Footprint labels, e.g. for selects. */
export const IFCO_GRUNDFLAECHE_LABELS: Record<IfcoGrundflaeche, string> = {
  gross: 'groß 60×40',
  klein: 'klein 40×30',
};

/** Footprint in cm as short text. */
export const IFCO_MASSE: Record<IfcoGrundflaeche, string> = { gross: '60×40', klein: '40×30' };

/** Most Ifcos the capacity check considers; more never fit. */
export const MAX_IFCOS_JE_PLATZ = 30;
/** Most Stellflächen of one Ifco-Lagerplatz. */
export const MAX_STELLFLAECHEN = 10;
export const MAX_IFCO_HOEHE_CM = 200;

/** Height in cm: > 0, at most one decimal. */
const hoeheSchema = z
  .number('Bitte gib eine Höhe in cm an.')
  .positive('Die Höhe muss größer als 0 sein.')
  .max(MAX_IFCO_HOEHE_CM, `Höchstens ${MAX_IFCO_HOEHE_CM} cm erlaubt.`)
  .refine((v) => Math.round(v * 10) / 10 === v, 'Höchstens 1 Nachkommastelle erlaubt.');

export const ifcoTypSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Bitte gib einen Namen ein.')
    .max(100, 'Höchstens 100 Zeichen erlaubt.'),
  grundflaeche: z.enum(IFCO_GRUNDFLAECHEN, 'Bitte wähle die Grundfläche.'),
  hoeheCm: hoeheSchema,
});
export type IfcoTypEingabe = z.input<typeof ifcoTypSchema>;

/** An Ifco-Lagerplatz as sent when marking a Lagerort: height per half-column and number of 60×40 footprints. */
export const ifcoPlatzMasseSchema = z.object({
  hoeheCm: hoeheSchema,
  stellflaechen: z
    .number('Bitte gib die Stellflächen an.')
    .min(0.5, 'Mindestens 0,5 Stellflächen.')
    .max(MAX_STELLFLAECHEN, `Höchstens ${MAX_STELLFLAECHEN} Stellflächen erlaubt.`)
    .refine((v) => Math.round(v * 2) / 2 === v, 'Die Stellflächen gehen in 0,5er-Schritten.'),
});
export type IfcoPlatzMasse = z.infer<typeof ifcoPlatzMasseSchema>;

/** Footprint and height of an Ifco (its type). */
export interface IfcoMass {
  grundflaeche: IfcoGrundflaeche;
  hoeheCm: number;
}

export interface IfcoTypKurz extends IfcoMass {
  id: string;
  name: string;
  archiviert?: boolean;
}

const zehntel = (cm: number): number => Math.round(cm * 10);

/** German number with decimal comma: `1,5`, `20`. */
export const zahlText = (n: number): string => String(n).replace('.', ',');

/** `20 cm hoch · 1 Stellfläche` / `13,5 cm hoch · 1,5 Stellflächen`. */
export function ifcoPlatzText(platz: IfcoPlatzMasse): string {
  return `${zahlText(platz.hoeheCm)} cm hoch · ${zahlText(platz.stellflaechen)} ${platz.stellflaechen === 1 ? 'Stellfläche' : 'Stellflächen'}`;
}

/** `6410 · 60×40 · 10 cm` */
export const ifcoTypText = (typ: IfcoMass & { name: string }): string =>
  `${typ.name} · ${IFCO_MASSE[typ.grundflaeche]} · ${zahlText(typ.hoeheCm)} cm`;

interface Teil {
  /** Number of half-columns the Ifco uses (1 = small, 2 = large). */
  breite: 1 | 2;
  h: number;
}

/** Whether the Ifcos fit onto the place (exact search, see the model above). */
export function ifcosPassen(platz: IfcoPlatzMasse, ifcos: IfcoMass[]): boolean {
  if (ifcos.length === 0) return true;
  if (ifcos.length > MAX_IFCOS_JE_PLATZ) return false;
  const spalten = Math.round(platz.stellflaechen * 2);
  const hoehe = zehntel(platz.hoeheCm);
  const teile: Teil[] = ifcos
    .map((i): Teil => ({ breite: i.grundflaeche === 'gross' ? 2 : 1, h: zehntel(i.hoeheCm) }))
    // Hardest first: tall before low, and large before small of the same height.
    .sort((a, b) => b.h - a.h || b.breite - a.breite);

  if (spalten < 1) return false;
  if (teile.some((t) => t.h > hoehe || t.breite > spalten)) return false;
  if (teile.reduce((s, t) => s + t.h * t.breite, 0) > hoehe * spalten) return false;

  const rest = Array.from({ length: spalten }, () => hoehe);
  const gescheitert = new Set<string>();

  const platzieren = (i: number): boolean => {
    if (i === teile.length) return true;
    const zustand = `${i}:${[...rest].sort((a, b) => a - b).join(',')}`;
    if (gescheitert.has(zustand)) return false;
    const { breite, h } = teile[i]!;
    const probiert = new Set<string>();
    if (breite === 1) {
      for (let c = 0; c < spalten; c++) {
        if (rest[c]! < h || probiert.has(String(rest[c]))) continue;
        probiert.add(String(rest[c]));
        rest[c]! -= h;
        const ok = platzieren(i + 1);
        rest[c]! += h;
        if (ok) return true;
      }
    } else {
      for (let c1 = 0; c1 < spalten; c1++) {
        if (rest[c1]! < h) continue;
        for (let c2 = c1 + 1; c2 < spalten; c2++) {
          if (rest[c2]! < h) continue;
          const key = [rest[c1], rest[c2]].sort().join(',');
          if (probiert.has(key)) continue;
          probiert.add(key);
          rest[c1]! -= h;
          rest[c2]! -= h;
          const ok = platzieren(i + 1);
          rest[c1]! += h;
          rest[c2]! += h;
          if (ok) return true;
        }
      }
    }
    gescheitert.add(zustand);
    return false;
  };
  return platzieren(0);
}

/**
 * For every non-archived type the largest number of further Ifcos of that type that still fit next
 * to `vorhanden` (0 = none), in the order of `typen`.
 */
export function nochPlatzFuer(
  platz: IfcoPlatzMasse,
  vorhanden: IfcoMass[],
  typen: IfcoTypKurz[],
): { typId: string; anzahl: number }[] {
  return typen
    .filter((t) => !t.archiviert)
    .map((typ) => {
      let anzahl = 0;
      while (
        vorhanden.length + anzahl < MAX_IFCOS_JE_PLATZ &&
        ifcosPassen(platz, [...vorhanden, ...Array.from({ length: anzahl + 1 }, () => typ)])
      ) {
        anzahl++;
      }
      return { typId: typ.id, anzahl };
    });
}

/** An Ifco as named in messages: `typ` null = no type. */
export interface IfcoEintrag {
  name: string;
  typ: (IfcoMass & { name: string }) | null;
}

const eintragText = (e: IfcoEintrag & { typ: NonNullable<IfcoEintrag['typ']> }) =>
  `${e.typ.name}, ${zahlText(e.typ.hoeheCm)} cm`;

/**
 * German error unless the Ifcos `stehend` (already there) and `neu` (to be added) fit together onto
 * the place, otherwise null. Ifcos are added one by one in this order; those that no longer fit are
 * named. An Ifco without a type is an error of its own.
 */
export function ifcoPlatzFehler(
  platzName: string,
  platz: IfcoPlatzMasse,
  stehend: IfcoEintrag[],
  neu: IfcoEintrag[],
): string | null {
  const alle = [...stehend, ...neu];
  const ohneTyp = alle.find((e) => e.typ === null);
  if (ohneTyp) {
    return `„${ohneTyp.name}“ hat keinen Typ. Auf einem Ifco-Lagerplatz braucht jede Ifco einen Typ.`;
  }
  const drauf: (IfcoEintrag & { typ: NonNullable<IfcoEintrag['typ']> })[] = [];
  const keinPlatz: typeof drauf = [];
  for (const e of alle as typeof drauf) {
    if (
      ifcosPassen(
        platz,
        [...drauf, e].map((d) => d.typ),
      )
    )
      drauf.push(e);
    else keinPlatz.push(e);
  }
  if (keinPlatz.length === 0) return null;
  const kopf = `Passt nicht auf „${platzName}“ (${ifcoPlatzText(platz).replace(' · ', ', ')})`;
  const dort =
    drauf.length > 0
      ? `dort stehen ${drauf.map((e) => `${e.name} (${eintragText(e)})`).join(', ')}`
      : '';
  const keine = keinPlatz.map((e) => `„${e.name}“ (${eintragText(e)})`).join(' und ');
  const verb = keinPlatz.length === 1 ? 'hat' : 'haben';
  const rest = `${keine} ${verb} ${drauf.length > 0 ? 'keinen Platz mehr' : 'keinen Platz'}.`;
  return `${kopf}: ${dort ? `${dort}; ` : ''}${rest}`;
}

/** Whether an Ifco of the given type fits next to the standing ones (false without a type). */
export function passtIfco(
  platz: IfcoPlatzMasse,
  stehend: IfcoMass[],
  ifco: IfcoMass | null,
): boolean {
  return ifco !== null && ifcosPassen(platz, [...stehend, ifco]);
}

export const IFCO_PLATZ_KEINE_WARE = 'Auf einem Ifco-Lagerplatz kann keine Ware liegen.';
export const IFCO_PLATZ_KEINE_KINDER = 'Ein Ifco-Lagerplatz kann keine Unterebenen haben.';

/**
 * German error unless a node of kind `art` with `kinderAnzahl` children may become an
 * Ifco-Lagerplatz, otherwise null. Only a place without children qualifies; a Regal is not one
 * itself (its Regalböden are).
 */
export function ifcoPlatzMarkierenFehler(art: string | null, kinderAnzahl: number): string | null {
  if (art === 'regal')
    return 'Ein Regal ist selbst kein Ifco-Lagerplatz. Markiere seine Regalböden.';
  if (kinderAnzahl > 0) return 'Ein Lagerort mit Unterebenen kann kein Ifco-Lagerplatz sein.';
  return null;
}
