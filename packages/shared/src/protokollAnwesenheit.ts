import type { ProtokollArt } from './kalender';
import {
  bausteinAnwesenheitDatenSchema,
  bausteinEmDatenSchema,
  type ProtokollDokument,
  type ProtokollKnoten,
  teilnahmeNormalisiert,
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
   * `bausteinAufnahme`, `bausteinWahl` and `bausteinAuswahl`, by Baustein id.
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

/** Times of the Anwesenheit blocks of one person: first `erscheint` with a time, last `geht` with a time ('' = none). */
export interface AnwesenheitsZeit {
  ab: string;
  bis: string;
}

/**
 * Per person with at least one Anwesenheit block (with a person) the times from the blocks, in
 * document order: `ab` = first `erscheint` that has a time, `bis` = last `geht` that has a time.
 * These people are locked to "da" in the Kopf.
 */
export function anwesenheitsZeiten(dokument: ProtokollDokument): Record<string, AnwesenheitsZeit> {
  const zeiten: Record<string, AnwesenheitsZeit> = {};
  inReihenfolge(dokument, (knoten) => {
    if (knoten.type !== 'bausteinAnwesenheit') return;
    const daten = bausteinAnwesenheitDatenSchema.safeParse(knoten.attrs?.daten);
    if (!daten.success || daten.data.sub === null) return;
    const { sub, art, uhrzeit } = daten.data;
    const z = (zeiten[sub] ??= { ab: '', bis: '' });
    if (art === 'erscheint') {
      if (z.ab === '') z.ab = uhrzeit;
    } else if (uhrzeit !== '') {
      z.bis = uhrzeit;
    }
  });
  return zeiten;
}

/** "ab 21:00" / "bis 22:10" / "ab 21:00 · bis 22:10"; '' without times. `suffix` is appended to each time (" Uhr"). */
export function anwesenheitsZeitText(z: AnwesenheitsZeit | undefined, suffix = ''): string {
  if (!z) return '';
  return [z.ab && `ab ${z.ab}${suffix}`, z.bis && `bis ${z.bis}${suffix}`]
    .filter(Boolean)
    .join(suffix ? ', ' : ' · ');
}

/** `verspaetet` becomes `anwesend`, people with an Anwesenheit block count as `anwesend` (they are locked to "da"). */
export function teilnahmeMitBloecken<T extends { sub: string; wert: ProtokollTeilnahmeWert }>(
  teilnahme: readonly T[],
  dokument: ProtokollDokument,
): T[] {
  const zeiten = anwesenheitsZeiten(dokument);
  return teilnahme.map((t) => ({
    ...t,
    wert: t.sub in zeiten ? 'anwesend' : teilnahmeNormalisiert(t.wert),
  }));
}

/**
 * Who is present where in the document. At the opening the members with attendance `anwesend`
 * (`verspaetet` in old data counts as `anwesend`) count, except those whose first Anwesenheit block
 * is an `erscheint` (they arrive later); members whose first block is `geht` count at the opening.
 * Then the blocks are applied: `erscheint` adds a member, `geht` removes one. Blocks for somebody
 * who is not a Mitglied (Anwärter:in, EM, unknown) or that change nothing leave the member count
 * alone; blocks without a person are ignored. The head count of all people (for a Meinungsbild)
 * follows the same rules for every status.
 */
export function anwesenheitsVerlauf(
  dokument: ProtokollDokument,
  eingabe: AnwesenheitsEingabe,
): AnwesenheitsVerlauf {
  // People whose first block is `erscheint` are not there at the opening.
  const spaeter = new Set<string>();
  const gesehen = new Set<string>();
  inReihenfolge(dokument, (knoten) => {
    if (knoten.type !== 'bausteinAnwesenheit') return;
    const daten = bausteinAnwesenheitDatenSchema.safeParse(knoten.attrs?.daten);
    if (!daten.success || daten.data.sub === null || gesehen.has(daten.data.sub)) return;
    gesehen.add(daten.data.sub);
    if (daten.data.art === 'erscheint') spaeter.add(daten.data.sub);
  });
  const teilnahme = teilnahmeMitBloecken(eingabe.teilnahme, dokument);

  const mitglieder = teilnahme.filter((t) => t.status === 'mitglied');
  const alle = new Set(mitglieder.map((t) => t.sub));
  const da = new Set(
    mitglieder.filter((t) => t.wert === 'anwesend' && !spaeter.has(t.sub)).map((t) => t.sub),
  );
  const stand = () => beschlussfaehigkeit(eingabe.art, alle.size, da.size);
  // Everybody present, whatever the status: attendance `anwesend` plus the chosen EMs.
  const personen = new Set([
    ...teilnahme.filter((t) => t.wert === 'anwesend' && !spaeter.has(t.sub)).map((t) => t.sub),
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
      knoten.type === 'bausteinAufnahme' ||
      knoten.type === 'bausteinWahl' ||
      knoten.type === 'bausteinAuswahl'
    ) {
      bausteine[id] = { ...aktuell, wechsel: false };
    } else if (knoten.type === 'bausteinMeinungsbild') {
      anwesendePersonen[id] = personen.size;
    }
  });
  return { start, bausteine, anwesendePersonen };
}

/**
 * Ids of the votes (Abstimmung, Neues EM with a vote, Aufnahme, Wahl; also inside the notes of other
 * Bausteine) in document order at which the Sitzung was not beschlussfähig. The next Sitzung repeats
 * them (`protokollVorschlag`); the Aktionen of them are provisional. A Meinungsbild never counts.
 */
export function nichtBeschlussfaehigeAbstimmungen(
  dokument: ProtokollDokument,
  eingabe: AnwesenheitsEingabe,
): string[] {
  const verlauf = anwesenheitsVerlauf(dokument, eingabe);
  const ids: string[] = [];
  inReihenfolge(dokument, (knoten) => {
    const id = knoten.attrs?.id;
    if (typeof id !== 'string') return;
    const abstimmung =
      knoten.type === 'bausteinBeschluss' ||
      knoten.type === 'bausteinAufnahme' ||
      knoten.type === 'bausteinWahl' ||
      knoten.type === 'bausteinAuswahl' ||
      (knoten.type === 'bausteinEm' &&
        bausteinEmDatenSchema.safeParse(knoten.attrs?.daten).data?.abstimmung != null);
    if (abstimmung && verlauf.bausteine[id]?.beschlussfaehig === false) ids.push(id);
  });
  return ids;
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
