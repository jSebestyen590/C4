import type { ProtokollArt } from './kalender';
import {
  bausteinAnwesenheitDatenSchema,
  type ProtokollDokument,
  type ProtokollKnoten,
  type ProtokollTeilnahmeWert,
} from './protokolle';
import type { MitgliedStatus } from './status';

// Quorum ("Beschlussfähigkeit") of a Sitzung and the formatting of Baustein headings (see
// docs/protokolle.md). Pure functions; the document is only walked, never changed.

export interface Beschlussfaehigkeit {
  /** Members (status `mitglied`) in the attendance list. */
  gesamt: number;
  /** Members present at that point. */
  anwesend: number;
  /** Members needed to be beschlussfähig. */
  mindestens: number;
  beschlussfaehig: boolean;
}

/**
 * Quorum: a Sitzung needs more than half of the members, a Mitgliederversammlung more than two
 * thirds. Nobody to count (`gesamt` 0) is never beschlussfähig.
 */
export function beschlussfaehigkeit(
  art: ProtokollArt,
  gesamt: number,
  anwesend: number,
): Beschlussfaehigkeit {
  const mindestens =
    art === 'mitgliederversammlung' ? Math.floor((2 * gesamt) / 3) + 1 : Math.floor(gesamt / 2) + 1;
  return { gesamt, anwesend, mindestens, beschlussfaehig: gesamt > 0 && anwesend >= mindestens };
}

export interface AnwesenheitsEingabe {
  art: ProtokollArt;
  /** Everybody in the attendance list. Only status `mitglied` counts. */
  teilnahme: ReadonlyArray<{ sub: string; status: MitgliedStatus; wert: ProtokollTeilnahmeWert }>;
  /** The EMs who count as present (chosen in the Kopf). Only used for the head count of a Meinungsbild. */
  ems?: ReadonlyArray<{ sub: string }>;
}

export interface AnwesenheitsVerlauf {
  /** Quorum at the opening. */
  start: Beschlussfaehigkeit;
  /**
   * Quorum at each `bausteinAnwesenheit` (after applying it), `bausteinBeschluss`, `bausteinEm` and
   * `bausteinAufnahme`, by Baustein id.
   */
  bausteine: Record<string, Beschlussfaehigkeit & { wechsel: boolean }>;
  /**
   * Number of people present (every status plus the chosen EMs, guests are free text and not counted)
   * at each `bausteinMeinungsbild`, by Baustein id.
   */
  anwesendePersonen: Record<string, number>;
}

/** Baustein nodes in document order, also those inside other Bausteine (a parent comes before its children). */
function inReihenfolge(knoten: ProtokollKnoten, besuch: (k: ProtokollKnoten) => void): void {
  besuch(knoten);
  for (const kind of knoten.content ?? []) inReihenfolge(kind, besuch);
}

/**
 * Who is present where in the document. At the opening the members with attendance `anwesend`
 * count; `verspaetet` members only from their `erscheint` block on. A `geht` block removes a present
 * member. Blocks for somebody who is not a Mitglied (Anwärter:in, EM, unknown) or that change
 * nothing leave the member count alone; blocks without a person are ignored. The head count of
 * all people (for a Meinungsbild) follows `erscheint` / `geht` blocks of any person.
 */
export function anwesenheitsVerlauf(
  dokument: ProtokollDokument,
  eingabe: AnwesenheitsEingabe,
): AnwesenheitsVerlauf {
  const mitglieder = eingabe.teilnahme.filter((t) => t.status === 'mitglied');
  const alle = new Set(mitglieder.map((t) => t.sub));
  const da = new Set(mitglieder.filter((t) => t.wert === 'anwesend').map((t) => t.sub));
  const stand = () => beschlussfaehigkeit(eingabe.art, alle.size, da.size);
  // Everybody present, whatever the status: attendance `anwesend` plus the chosen EMs.
  const personen = new Set([
    ...eingabe.teilnahme.filter((t) => t.wert === 'anwesend').map((t) => t.sub),
    ...(eingabe.ems ?? []).map((e) => e.sub),
  ]);

  const start = stand();
  let aktuell = start;
  const bausteine: AnwesenheitsVerlauf['bausteine'] = {};
  const anwesendePersonen: AnwesenheitsVerlauf['anwesendePersonen'] = {};

  inReihenfolge(dokument, (knoten) => {
    const id = knoten.attrs?.id;
    if (typeof id !== 'string') return;
    if (knoten.type === 'bausteinAnwesenheit') {
      const daten = bausteinAnwesenheitDatenSchema.safeParse(knoten.attrs?.daten);
      if (daten.success && daten.data.sub !== null) {
        const erscheint = daten.data.art === 'erscheint';
        if (alle.has(daten.data.sub)) {
          if (erscheint) da.add(daten.data.sub);
          else da.delete(daten.data.sub);
        }
        if (erscheint) personen.add(daten.data.sub);
        else personen.delete(daten.data.sub);
      }
      const neu = stand();
      bausteine[id] = { ...neu, wechsel: neu.beschlussfaehig !== aktuell.beschlussfaehig };
      aktuell = neu;
    } else if (
      knoten.type === 'bausteinBeschluss' ||
      knoten.type === 'bausteinEm' ||
      knoten.type === 'bausteinAufnahme'
    ) {
      bausteine[id] = { ...aktuell, wechsel: false };
    } else if (knoten.type === 'bausteinMeinungsbild') {
      anwesendePersonen[id] = personen.size;
    }
  });
  return { start, bausteine, anwesendePersonen };
}

/** Per member the time of the first `erscheint` block that has one (for "Julia (21:00 Uhr)"). */
export function erscheintUhrzeiten(dokument: ProtokollDokument): Record<string, string> {
  const zeiten: Record<string, string> = {};
  inReihenfolge(dokument, (knoten) => {
    if (knoten.type !== 'bausteinAnwesenheit') return;
    const daten = bausteinAnwesenheitDatenSchema.safeParse(knoten.attrs?.daten);
    if (!daten.success || daten.data.art !== 'erscheint') return;
    const { sub, uhrzeit } = daten.data;
    if (sub !== null && uhrzeit !== '' && !(sub in zeiten)) zeiten[sub] = uhrzeit;
  });
  return zeiten;
}

// ---------------------------------------------------------------------------------------------
// Headings
// ---------------------------------------------------------------------------------------------

const tagMonat = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** `11.02.`; a range `31.05. – 02.06.`; the same day twice is one day; empty `von` gives ''. */
export function datumKurz(von: string | null | undefined, bis?: string | null): string {
  if (!von) return '';
  if (!bis || bis === von) return tagMonat(von);
  return `${tagMonat(von)} – ${tagMonat(bis)}`;
}

interface UeberschriftDaten {
  name: string;
  datum: string | null;
  bisDatum?: string | null;
}

const ueberschrift = (d: UeberschriftDaten): string =>
  `${datumKurz(d.datum, d.bisDatum)} ${d.name}`.trim();

/** `31.05. – 02.06. Name` of a `bausteinEvent`; without a date just the name. */
export const eventUeberschrift = (daten: UeberschriftDaten): string => ueberschrift(daten);

/** Same for a `bausteinVergangenesEvent`. */
export const vergangenesUeberschrift = (daten: UeberschriftDaten): string => ueberschrift(daten);
