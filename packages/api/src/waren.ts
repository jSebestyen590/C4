import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, getTableColumns, inArray, isNull, ne, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  bestandZu,
  entnahmePlanen,
  gebindeBezeichnung,
  gebindeDoppelt,
  gebindeErgaenzen,
  gebindeFehler,
  gebindeKurz,
  gebindeSortieren,
  IFCO_PLATZ_KEINE_KINDER,
  ifcoPlatzHatIfcosFehler,
  ifcoPlatzMarkierenFehler,
  inventurAbgleich,
  bodenNamenFehler,
  inventurKorrekturen,
  kinderArtNach,
  lagerortArtAenderungFehler,
  lagerortArtFehler,
  mhdNormalisieren,
  pfad,
  teilbaumIds,
  tiefensuche,
  umlagerungPlanen,
  verlauf,
  verlaufSerien,
  vergleicheBuchungsZeilen,
  type Anrede,
  type BaumKnoten,
  type Bestandsposten,
  type Buchung,
  type Buchungszeile,
  type GebindeDaten,
  bodenIfcoPlatz,
  type IfcoPlatzMasse,
  type InventurIst,
  type InventurZeile,
  type LagerortArt,
  type MhdArt,
  type MitgliedStatus,
  type VerlaufPunkt,
  type VerlaufSerie,
  type VerlaufZeile,
  blockierungText,
  blockierungen,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  ausleihen,
  ausleihePositionen,
  bestandsbuchungen,
  bestandsvorgaenge,
  gebinde,
  gegenstandPlaetze,
  ifcos,
  inventurKnoten,
  inventuren,
  inventurZaehlungen,
  lagerortWaren,
  lagerorte,
  mitglieder,
  wareAliase,
  wareGebinde,
  waren,
  warengruppen,
  type BuchungRow,
  type GebindeRow,
  type InventurRow,
  type LagerortRow,
  type VorgangRow,
  type WareRow,
  type WarengruppeRow,
} from './db/schema';
import { ifcoPlatzMasse, ifcoPlatzPruefen } from './ifcoPlatz';

// ---------------------------------------------------------------------------
// Errors

/** The request is well-formed but names unknown/archived entries or violates a domain rule (400). */
export class WarenUngueltig extends Error {}

/** The request conflicts with the current state, e.g. the entry is still in use (409). */
export class WarenKonflikt extends Error {}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in waren.test.ts)

export type { GebindeDaten };

/** Message for a Gebinde that already exists with identical attributes. */
export const GEBINDE_DOPPELT = 'Dieses Gebinde gibt es schon.';

export type EintragArt =
  | 'Lagerort'
  | 'Warengruppe'
  | 'Gebinde'
  | 'Ware'
  | 'Kategorie'
  | 'Gegenstand'
  | 'Ifco'
  | 'Ifco-Typ';

/** `Der Lagerort wird noch verwendet, archiviere ihn stattdessen.` */
export function verwendetMeldung(art: EintragArt): string {
  const [artikel, pronomen] = {
    Lagerort: ['Der', 'ihn'],
    Warengruppe: ['Die', 'sie'],
    Gebinde: ['Das', 'es'],
    Ware: ['Die', 'sie'],
    Kategorie: ['Die', 'sie'],
    Gegenstand: ['Der', 'ihn'],
    Ifco: ['Die', 'sie'],
    'Ifco-Typ': ['Der', 'ihn'],
  }[art];
  return `${artikel} ${art} wird noch verwendet, archiviere ${pronomen} stattdessen.`;
}

/** German error if `id` would get itself or one of its descendants as parent, otherwise null. */
export function zyklusFehler(
  nodes: BaumKnoten[],
  id: string,
  parentId: string | null,
): string | null {
  if (parentId === null) return null;
  if (teilbaumIds(nodes, id).includes(parentId)) {
    return 'Der übergeordnete Eintrag darf nicht der Eintrag selbst oder einer seiner Untereinträge sein.';
  }
  return null;
}

/** German error if `parentId` is no usable (existing, not archived) parent, otherwise null. */
export function elternFehler(
  nodes: (BaumKnoten & { archiviert: boolean })[],
  parentId: string | null,
): string | null {
  if (parentId === null) return null;
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return 'Der übergeordnete Eintrag existiert nicht.';
  if (parent.archiviert) return 'Der übergeordnete Eintrag ist archiviert.';
  return null;
}

/** German error unless `ids` is a permutation of the `kinderIds`, otherwise null. */
export function reihenfolgeFehler(
  kinderIds: string[],
  ids: string[],
  elternArt: LagerortArt | null = null,
): string | null {
  if (elternArt === 'regal') return 'Regalböden lassen sich nicht verschieben.';
  const erwartet = new Set(kinderIds);
  if (ids.length !== erwartet.size || ids.some((id) => !erwartet.has(id))) {
    return 'Die Reihenfolge muss genau die Einträge dieser Ebene enthalten.';
  }
  return null;
}

/** Position for a node appended to `geschwister`. */
export const naechstePosition = (geschwister: { position: number }[]): number =>
  geschwister.reduce((max, g) => Math.max(max, g.position + 1), 0);

/** MHD of an Einlagerung: required unless the ware has none, normalised by the ware's MHD-Art. */
export function einlagerungMhd(mhd: string | null | undefined, mhdArt: MhdArt): string | null {
  if (mhdArt !== 'keins' && !mhd) throw new WarenUngueltig('Bitte gib ein MHD an.');
  return mhdNormalisieren(mhd, mhdArt);
}

/**
 * Booking lines of a withdrawal: stock of the ware AT `zeitpunkt` (backdating allowed), restricted to
 * the subtree of the chosen node, planned FIFO. `buchungen` may contain rows of other wares.
 */
export function entnahmeZeilen(eingabe: {
  buchungen: Buchung[];
  lagerorte: BaumKnoten[];
  gebinde: GebindeRow[];
  wareId: string;
  lagerortId: string;
  gebindeId: string;
  anzahl: number;
  zeitpunkt: string;
}): Buchungszeile[] {
  const knoten = new Set(teilbaumIds(eingabe.lagerorte, eingabe.lagerortId));
  const posten = bestandZu(
    eingabe.buchungen.filter((b) => b.wareId === eingabe.wareId),
    eingabe.zeitpunkt,
  ).filter((p) => knoten.has(p.lagerortId));
  return entnahmePlanen({
    posten,
    gebinde: eingabe.gebinde,
    gebindeId: eingabe.gebindeId,
    anzahl: eingabe.anzahl,
    lagerortId: eingabe.lagerortId,
  });
}

type ZeileMitWare = Buchungszeile & { wareId: string };

const alsBuchungen = (zeilen: ZeileMitWare[], zeitpunkt: string, vorgangId: string): Buchung[] =>
  zeilen.map((z) => ({ ...z, vorgangId, zeitpunkt }));

/** Plans one Umlagerung position against `buchungen` (stock AT `zeitpunkt`, source node only). */
function umlagerungZeilen(eingabe: {
  buchungen: Buchung[];
  gebinde: GebindeRow[];
  wareId: string;
  gebindeId: string;
  anzahl: number;
  vonId: string;
  nachId: string;
  zeitpunkt: string;
}): ZeileMitWare[] {
  const posten = bestandZu(
    eingabe.buchungen.filter((b) => b.wareId === eingabe.wareId),
    eingabe.zeitpunkt,
  );
  return umlagerungPlanen({ ...eingabe, posten }).map((z) => ({ ...z, wareId: eingabe.wareId }));
}

/**
 * Lines of several Umlagerungen of one request. Positions are planned one after the other, each
 * seeing the effect of the previous ones. `buchungen` may contain rows of other wares.
 */
export function umlagerungenZeilen(eingabe: {
  buchungen: Buchung[];
  gebinde: GebindeRow[];
  positionen: {
    wareId: string;
    gebindeId: string;
    anzahl: number;
    vonId: string;
    nachId: string;
  }[];
  zeitpunkt: string;
}): ZeileMitWare[] {
  const buchungen = [...eingabe.buchungen];
  const ergebnis: ZeileMitWare[] = [];
  for (const position of eingabe.positionen) {
    const zeilen = umlagerungZeilen({
      buchungen,
      gebinde: eingabe.gebinde,
      zeitpunkt: eingabe.zeitpunkt,
      ...position,
    });
    buchungen.push(...alsBuchungen(zeilen, eingabe.zeitpunkt, 'geplant'));
    ergebnis.push(...zeilen);
  }
  return ergebnis;
}

/**
 * Lines of a multi-position withdrawal (FIFO on the chosen node only, not its subtree) plus the
 * Umlagerung that refills the nodes listed in `nachfuellen` from their source with the withdrawn
 * amounts per (node, ware, Gebinde). The Umlagerung is planned after the withdrawal.
 */
export function entnahmenZeilen(eingabe: {
  buchungen: Buchung[];
  gebinde: GebindeRow[];
  positionen: { wareId: string; lagerortId: string; gebindeId: string; anzahl: number }[];
  nachfuellen: { lagerortId: string; quelleId: string }[];
  zeitpunkt: string;
}): { entnahme: ZeileMitWare[]; umlagerung: ZeileMitWare[] } {
  const buchungen = [...eingabe.buchungen];
  const entnahme: ZeileMitWare[] = [];
  for (const p of eingabe.positionen) {
    const posten = bestandZu(
      buchungen.filter((b) => b.wareId === p.wareId),
      eingabe.zeitpunkt,
    ).filter((x) => x.lagerortId === p.lagerortId);
    const zeilen = entnahmePlanen({
      posten,
      gebinde: eingabe.gebinde,
      gebindeId: p.gebindeId,
      anzahl: p.anzahl,
      lagerortId: p.lagerortId,
    }).map((z) => ({ ...z, wareId: p.wareId }));
    buchungen.push(...alsBuchungen(zeilen, eingabe.zeitpunkt, 'geplant'));
    entnahme.push(...zeilen);
  }

  const summen = new Map<
    string,
    { wareId: string; lagerortId: string; gebindeId: string; anzahl: number }
  >();
  for (const n of eingabe.nachfuellen) {
    for (const p of eingabe.positionen.filter((x) => x.lagerortId === n.lagerortId)) {
      const key = `${n.lagerortId}\u0000${p.wareId}\u0000${p.gebindeId}`;
      const vorhanden = summen.get(key);
      if (vorhanden) vorhanden.anzahl += p.anzahl;
      else summen.set(key, { ...p });
    }
  }
  const quelle = new Map(eingabe.nachfuellen.map((n) => [n.lagerortId, n.quelleId]));
  const umlagerung = umlagerungenZeilen({
    buchungen,
    gebinde: eingabe.gebinde,
    zeitpunkt: eingabe.zeitpunkt,
    positionen: [...summen.values()].map((x) => ({
      wareId: x.wareId,
      gebindeId: x.gebindeId,
      anzahl: x.anzahl,
      vonId: quelle.get(x.lagerortId)!,
      nachId: x.lagerortId,
    })),
  });
  return { entnahme, umlagerung };
}

/** Current stock per (node, ware, Gebinde), summed over MHD, with the earliest MHD of the positive stock. */
export interface LagerortBestandZeile {
  lagerortId: string;
  wareId: string;
  gebindeId: string;
  menge: number;
  fruehestesMhd: string | null;
}

export function lagerortBestandZeilen(buchungen: Buchung[]): LagerortBestandZeile[] {
  const map = new Map<string, LagerortBestandZeile>();
  for (const p of bestandZu(buchungen)) {
    const key = `${p.lagerortId}\u0000${p.wareId}\u0000${p.gebindeId}`;
    const z = map.get(key) ?? {
      lagerortId: p.lagerortId,
      wareId: p.wareId,
      gebindeId: p.gebindeId,
      menge: 0,
      fruehestesMhd: null,
    };
    z.menge += p.menge;
    if (p.menge > 0 && p.mhd !== null && (z.fruehestesMhd === null || p.mhd < z.fruehestesMhd)) {
      z.fruehestesMhd = p.mhd;
    }
    map.set(key, z);
  }
  return [...map.values()].filter((z) => z.menge !== 0);
}

/** Ids of the Lagerort and its non-archived descendants in inventory order (preorder, by position). */
export function inventurKnotenIds(
  lagerorteAlle: (BaumKnoten & { archiviert: boolean })[],
  wurzelId: string,
  /** Places where Ifcos stand: no Waren can lie there, so there is nothing to count. */
  mitIfcos: ReadonlySet<string> = new Set(),
): string[] {
  return tiefensuche(
    lagerorteAlle.filter((l) => !l.archiviert && !mitIfcos.has(l.id)),
    wurzelId,
  ).map((l) => l.id);
}

export interface ZaehlungDaten {
  wareId: string;
  gebindeId: string;
  mhd: string | null;
  anzahl: number;
}

/**
 * Validates counted lines against the wares (the Gebinde must belong to the ware), normalises the
 * MHD by the ware's MHD-Art and merges lines with the same key.
 */
export function zaehlungenNormalisieren(
  zaehlungen: ZaehlungDaten[],
  waren: Map<string, { mhdArt: MhdArt; gebindeIds: string[] }>,
): ZaehlungDaten[] {
  const ergebnis = new Map<string, ZaehlungDaten>();
  for (const z of zaehlungen) {
    const ware = waren.get(z.wareId);
    if (!ware) throw new WarenUngueltig('Die Ware gibt es nicht.');
    if (!ware.gebindeIds.includes(z.gebindeId)) {
      throw new WarenUngueltig('Dieses Gebinde gehört nicht zur Ware.');
    }
    const mhd = mhdNormalisieren(z.mhd, ware.mhdArt);
    const key = [z.wareId, z.gebindeId, mhd ?? ''].join('\u0000');
    const vorhanden = ergebnis.get(key);
    if (vorhanden) vorhanden.anzahl += z.anzahl;
    else ergebnis.set(key, { ...z, mhd });
  }
  return [...ergebnis.values()];
}

// ---------------------------------------------------------------------------
// Types

export interface LagerortDaten {
  name: string;
  beschreibung: string | null;
  parentId: string | null;
  /** On create: null/undefined = normal; on update: undefined keeps the kind. */
  art?: LagerortArt | null;
  /** Ifco-Lagerplatz dimensions. On create: null/undefined = normal; on update: undefined keeps them, null unmarks. */
  ifcoPlatz?: IfcoPlatzMasse | null;
}

/** Ids of what a create made: the Lagerort and, for a Regal, its Regalböden in the given order. */
export interface LagerortAngelegt {
  id: string;
  boedenIds: string[];
}

export interface WarengruppeDaten {
  name: string;
  parentId: string | null;
}

export interface WareDaten {
  name: string;
  warengruppeId: string;
  mhdArt: MhdArt;
  gebindeIds: string[];
  aliase: string[];
}

export interface WareDetails extends WareRow {
  aliase: string[];
  gebindeIds: string[];
  /** Current stock per Lagerort, Gebinde and MHD. */
  bestand: Bestandsposten[];
  /** Earliest MHD among the stock on hand. */
  fruehestesMhd: string | null;
}

/** Display data of the member who created something; null for users without a profile. */
export interface Ersteller {
  sub: string;
  /** Cognito username; the store cannot know it, `app.ts` fills it in (null until then). */
  username: string | null;
  vorname: string;
  nachname: string;
  anrede: Anrede;
  status: MitgliedStatus;
}

export interface BuchungZeile {
  id: string;
  wareId: string;
  lagerortId: string;
  gebindeId: string;
  mhd: string | null;
  menge: number;
  art: BuchungRow['art'];
}

export interface VorgangDetails {
  id: string;
  typ: VorgangRow['typ'];
  quelle: VorgangRow['quelle'];
  zeitpunkt: string;
  kommentar: string | null;
  erstelltVon: string;
  ersteller: Ersteller | null;
  erstelltAm: string;
  zeilen: BuchungZeile[];
  /** Rows of other wares in this Vorgang (a deletion would remove them too). */
  weitereZeilen: number;
}

export interface WareVerlauf {
  serien: VerlaufSerie[];
  zeilen: VerlaufZeile[];
  /** Same order as `zeilen`: stock per top-level Lager and Gebinde (not base units) at each point. */
  punkte: VerlaufPunkt[];
  /** Names of the Lager and Gebinde the series refer to. */
  lager: { id: string; name: string }[];
  gebinde: { id: string; bezeichnung: string; kurz: string }[];
}

export interface EinlagerungDaten {
  wareId: string;
  lagerortId: string;
  gebindeId: string;
  anzahl: number;
  mhd: string | null;
  zeitpunkt: string;
  kommentar: string | null;
}

export interface EntnahmeDaten {
  wareId: string;
  lagerortId: string;
  gebindeId: string;
  anzahl: number;
  zeitpunkt: string;
  kommentar: string | null;
}

export interface EinlagerungenDaten {
  zeitpunkt: string;
  kommentar: string | null;
  positionen: {
    wareId: string;
    lagerortId: string;
    gebindeId: string;
    mhd: string | null;
    anzahl: number;
  }[];
}

export interface EntnahmenDaten {
  zeitpunkt: string;
  kommentar: string | null;
  positionen: { wareId: string; lagerortId: string; gebindeId: string; anzahl: number }[];
  nachfuellen: { lagerortId: string; quelleId: string }[];
}

export interface UmlagerungenDaten {
  zeitpunkt: string;
  kommentar: string | null;
  positionen: {
    wareId: string;
    gebindeId: string;
    anzahl: number;
    vonId: string;
    nachId: string;
  }[];
}

export interface InventurUebersicht {
  id: string;
  lagerortId: string;
  lagerortPfad: string;
  status: InventurRow['status'];
  gestartetVon: string;
  ersteller: Ersteller | null;
  gestartetAm: string;
  vorgangId: string | null;
}

export interface WareKurz {
  id: string;
  name: string;
  mhdArt: MhdArt;
  archiviert: boolean;
  gebindeIds: string[];
}

export interface InventurKnotenDetails {
  lagerortId: string;
  name: string;
  pfad: string;
  /** The configured Warenliste of the node, in order. */
  wareIds: string[];
  /** Current expected stock on this node. */
  soll: { wareId: string; gebindeId: string; mhd: string | null; menge: number }[];
  zaehlungen: ZaehlungDaten[];
}

export interface InventurDetails extends InventurUebersicht {
  knoten: InventurKnotenDetails[];
  waren: WareKurz[];
  gebinde: GebindeRow[];
}

export interface InventurZusammenfassung {
  zeitpunkt: string;
  zeilen: (InventurZeile & { lagerortPfad: string })[];
  waren: WareKurz[];
  gebinde: GebindeRow[];
}

/**
 * The mutations return false (or undefined) when the entry itself does not exist, and throw
 * `WarenUngueltig` / `WarenKonflikt` for the domain rules.
 */
export interface WarenStore {
  // Lagerorte
  lagerorte(mitArchiv: boolean): Promise<LagerortRow[]>;
  /** `boeden` (names, in order) belong to a Regal and are created with it. */
  lagerortAnlegen(
    daten: LagerortDaten,
    boeden?: string[],
    /** Makes the new Regalböden Ifco-Lagerplätze. */
    boedenIfcoPlatz?: IfcoPlatzMasse | IfcoPlatzMasse[] | null,
  ): Promise<LagerortAngelegt>;
  /** Appends Regalböden to a Regal; the new ids, or undefined if the Lagerort does not exist. */
  boedenHinzufuegen(
    id: string,
    namen: string[],
    ifcoPlatz?: IfcoPlatzMasse | IfcoPlatzMasse[] | null,
  ): Promise<string[] | undefined>;
  lagerortAktualisieren(id: string, daten: LagerortDaten): Promise<boolean>;
  lagerortLoeschen(id: string): Promise<boolean>;
  /** Archives (or restores) the whole subtree; archiving needs a stock of 0 in the subtree. */
  lagerortArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  /** Orders the children of `parentId` (null = top level). */
  lagerortReihenfolge(parentId: string | null, ids: string[]): Promise<boolean>;
  lagerortWaren(id: string): Promise<string[] | undefined>;
  /** The Warenliste (ordered ware ids) of every node that has one. */
  lagerortWarenlisten(): Promise<{ lagerortId: string; wareIds: string[] }[]>;
  lagerortWarenSetzen(id: string, wareIds: string[]): Promise<boolean>;
  // Warengruppen
  warengruppen(mitArchiv: boolean): Promise<WarengruppeRow[]>;
  warengruppeAnlegen(daten: WarengruppeDaten): Promise<string>;
  warengruppeAktualisieren(id: string, daten: WarengruppeDaten): Promise<boolean>;
  warengruppeLoeschen(id: string): Promise<boolean>;
  warengruppeArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  // Gebinde
  gebinde(mitArchiv: boolean): Promise<GebindeRow[]>;
  gebindeAnlegen(daten: GebindeDaten): Promise<string>;
  gebindeAktualisieren(id: string, daten: GebindeDaten): Promise<boolean>;
  gebindeLoeschen(id: string): Promise<boolean>;
  gebindeArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  // Waren
  waren(mitArchiv: boolean): Promise<WareDetails[]>;
  wareHolen(id: string): Promise<WareDetails | undefined>;
  wareAnlegen(daten: WareDaten): Promise<string>;
  wareAktualisieren(id: string, daten: WareDaten): Promise<boolean>;
  wareLoeschen(id: string): Promise<boolean>;
  wareArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  wareBestand(id: string): Promise<Bestandsposten[] | undefined>;
  wareVerlauf(id: string): Promise<WareVerlauf | undefined>;
  wareVorgaenge(id: string): Promise<VorgangDetails[] | undefined>;
  // Bestand
  einlagern(daten: EinlagerungDaten, sub: string): Promise<string>;
  entnehmen(daten: EntnahmeDaten, sub: string): Promise<string>;
  /** One Vorgang `einlagerung` with a row per position; returns its id. */
  einlagerungen(daten: EinlagerungenDaten, sub: string): Promise<string>;
  /** One Vorgang `entnahme` plus, for `nachfuellen`, one Vorgang `umlagerung` (same transaction). */
  entnahmen(
    daten: EntnahmenDaten,
    sub: string,
  ): Promise<{ entnahmeId: string; umlagerungId: string | null }>;
  umlagerungen(daten: UmlagerungenDaten, sub: string): Promise<string>;
  /** Current stock of every node, non-zero only. */
  lagerortBestand(): Promise<LagerortBestandZeile[]>;
  vorgangLoeschen(id: string): Promise<boolean>;
  // Inventur
  inventuren(status?: InventurRow['status']): Promise<InventurUebersicht[]>;
  inventurStarten(lagerortId: string, sub: string): Promise<string>;
  inventurHolen(id: string): Promise<InventurDetails | undefined>;
  inventurKnotenSpeichern(
    id: string,
    lagerortId: string,
    zaehlungen: ZaehlungDaten[],
    inListeAufnehmen: string[],
  ): Promise<boolean>;
  inventurZusammenfassung(
    id: string,
    zeitpunkt?: string,
  ): Promise<InventurZusammenfassung | undefined>;
  /** Returns the id of the created Vorgang. */
  inventurAbschliessen(id: string, zeitpunkt: string, sub: string): Promise<string | undefined>;
  inventurVerwerfen(id: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Store

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** What the loaders need; satisfied by the database and by a transaction. */
export type Q = Pick<Db, 'select'>;

export const sortiert = <T>(liste: T[], schluessel: (t: T) => string) =>
  [...liste].sort((a, b) => schluessel(a).localeCompare(schluessel(b), 'de'));

const inListe = <T>(spalte: Parameters<typeof inArray>[0], werte: T[]) =>
  werte.length === 0 ? undefined : inArray(spalte, werte as never[]);

/**
 * Open (not yet returned) Ausleihe-Positionen incl. start and borrower of their Ausleihe, optionally
 * narrowed by `bedingung`. This counts the ones away now and the reserved ones (start in the future) alike.
 */
export const offenLaden = (q: Q, bedingung?: SQL) =>
  q
    .select({
      ...getTableColumns(ausleihePositionen),
      ausgeliehenAm: ausleihen.ausgeliehenAm,
      an: ausleihen.an,
      rueckgabeGeplant: ausleihen.rueckgabeGeplant,
    })
    .from(ausleihePositionen)
    .innerJoin(ausleihen, eq(ausleihen.id, ausleihePositionen.ausleiheId))
    .where(and(isNull(ausleihePositionen.zurueckAm), bedingung));

/** Inserts Regalböden (as `regalboden`) below `regalId`, positions counting up from `ab`; returns their ids. */
async function boedenEinfuegen(
  tx: Tx,
  regalId: string,
  namen: string[],
  ab: number,
  ifcoPlatz: IfcoPlatzMasse | IfcoPlatzMasse[] | null = null,
): Promise<string[]> {
  if (Array.isArray(ifcoPlatz) && ifcoPlatz.length !== namen.length) {
    throw new WarenUngueltig('Jeder Regalboden braucht genau eine Höhe.');
  }
  const ids = namen.map(() => randomUUID());
  for (const [i, name] of namen.entries()) {
    await tx.insert(lagerorte).values({
      id: ids[i]!,
      name,
      beschreibung: null,
      parentId: regalId,
      art: 'regalboden',
      position: ab + i,
      ifcoHoeheCm: bodenIfcoPlatz(ifcoPlatz, i)?.hoeheCm ?? null,
      ifcoStellflaechen: bodenIfcoPlatz(ifcoPlatz, i)?.stellflaechen ?? null,
    });
  }
  return ids;
}

/** `: 3 an Feuerwehr verliehen (20.10.–27.10.2026)` for the given open positions, or `` without any. */
export const blockiertVon = (offen: Awaited<ReturnType<typeof offenLaden>>): string => {
  const text = blockierungText(blockierungen(offen, null, new Date()));
  return text ? `: ${text}` : '';
};

/** Whether any row of `tabelle` matches `bedingung`. */
export async function gibtEs(q: Q, tabelle: PgTable, bedingung: SQL | undefined): Promise<boolean> {
  const rows = await q.select().from(tabelle).where(bedingung).limit(1);
  return rows.length > 0;
}

export async function buchungenLaden(q: Q, bedingung?: SQL): Promise<Buchung[]> {
  const rows = await q
    .select({
      vorgangId: bestandsbuchungen.vorgangId,
      zeitpunkt: bestandsvorgaenge.zeitpunkt,
      wareId: bestandsbuchungen.wareId,
      lagerortId: bestandsbuchungen.lagerortId,
      gebindeId: bestandsbuchungen.gebindeId,
      mhd: bestandsbuchungen.mhd,
      menge: bestandsbuchungen.menge,
      art: bestandsbuchungen.art,
    })
    .from(bestandsbuchungen)
    .innerJoin(bestandsvorgaenge, eq(bestandsvorgaenge.id, bestandsbuchungen.vorgangId))
    .where(bedingung);
  return rows.map((r) => ({ ...r, zeitpunkt: r.zeitpunkt.toISOString() }));
}

/** Loads the ware for a booking and checks that it and the Gebinde can be booked on. */
async function buchbareWare(q: Q, wareId: string, gebindeId: string): Promise<WareRow> {
  const [ware] = await q.select().from(waren).where(eq(waren.id, wareId));
  if (!ware) throw new WarenUngueltig('Die Ware gibt es nicht.');
  if (ware.archiviert) throw new WarenUngueltig('Die Ware ist archiviert.');
  const verknuepft = await q
    .select()
    .from(wareGebinde)
    .where(and(eq(wareGebinde.wareId, wareId), eq(wareGebinde.gebindeId, gebindeId)));
  if (verknuepft.length === 0) throw new WarenUngueltig('Dieses Gebinde gehört nicht zur Ware.');
  const [g] = await q.select().from(gebinde).where(eq(gebinde.id, gebindeId));
  if (g?.archiviert) throw new WarenUngueltig('Das Gebinde ist archiviert.');
  return ware;
}

/** Ids of the places on which non-archived Ifcos stand. */
async function ortMitIfcos(q: Q): Promise<Set<string>> {
  const rows = await q
    .select({ lagerortId: ifcos.lagerortId })
    .from(ifcos)
    .where(eq(ifcos.archiviert, false));
  return new Set(rows.flatMap((r) => (r.lagerortId ? [r.lagerortId] : [])));
}

/**
 * The place must exist and not be archived. Unless it is only withdrawn from (`abgang`), no Ifco
 * may stand on it: Waren and Ifcos do not share a place.
 */
async function buchbarerLagerort(q: Q, lagerortId: string, abgang = false): Promise<void> {
  const [l] = await q.select().from(lagerorte).where(eq(lagerorte.id, lagerortId));
  if (!l) throw new WarenUngueltig('Der Lagerort existiert nicht.');
  if (l.archiviert) throw new WarenUngueltig('Der Lagerort ist archiviert.');
  if (abgang) return;
  const stehend = await gibtEs(
    q,
    ifcos,
    and(eq(ifcos.lagerortId, lagerortId), eq(ifcos.archiviert, false)),
  );
  if (stehend) throw new WarenUngueltig(ifcoPlatzHatIfcosFehler(l.name));
}

/** Throws `WarenUngueltig` when `eltern` is an Ifco-Lagerplatz: it cannot have children. */
function elternKeinIfcoPlatz(
  eltern: Pick<LagerortRow, 'ifcoHoeheCm' | 'ifcoStellflaechen'> | undefined,
) {
  if (eltern && ifcoPlatzMasse(eltern)) throw new WarenUngueltig(IFCO_PLATZ_KEINE_KINDER);
}

async function vorgangAnlegen(
  tx: Tx,
  vorgang: Pick<VorgangRow, 'typ' | 'quelle' | 'kommentar' | 'erstelltVon'> & {
    zeitpunkt: string;
  },
  zeilen: (Buchungszeile & { wareId: string })[],
): Promise<string> {
  const id = randomUUID();
  await tx
    .insert(bestandsvorgaenge)
    .values({ id, ...vorgang, zeitpunkt: new Date(vorgang.zeitpunkt) });
  if (zeilen.length > 0) {
    await tx
      .insert(bestandsbuchungen)
      .values(zeilen.map((z) => ({ id: randomUUID(), vorgangId: id, ...z })));
  }
  return id;
}

export function createWarenStore(db: Db): WarenStore {
  const erstellerLaden = async (subs: string[]): Promise<Map<string, Ersteller>> => {
    const eindeutig = [...new Set(subs)];
    if (eindeutig.length === 0) return new Map();
    const rows = await db
      .select({
        sub: mitglieder.sub,
        vorname: mitglieder.vorname,
        nachname: mitglieder.nachname,
        anrede: mitglieder.anrede,
        status: mitglieder.status,
      })
      .from(mitglieder)
      .where(inArray(mitglieder.sub, eindeutig));
    return new Map(
      rows.map(({ sub, anrede, ...r }) => [
        sub,
        { ...r, sub, username: null, anrede: anrede ?? 'neutral' },
      ]),
    );
  };

  const warenDetails = async (rows: WareRow[], nurIds?: string[]): Promise<WareDetails[]> => {
    const [aliase, verknuepft, buchungen] = await Promise.all([
      db.select().from(wareAliase),
      db.select().from(wareGebinde),
      buchungenLaden(db, nurIds ? inListe(bestandsbuchungen.wareId, nurIds) : undefined),
    ]);
    const bestand = bestandZu(buchungen);
    return rows.map((w) => {
      const eigener = bestand.filter((p) => p.wareId === w.id);
      const mhds = eigener
        .filter((p) => p.menge > 0 && p.mhd !== null)
        .map((p) => p.mhd as string)
        .sort();
      return {
        ...w,
        aliase: sortiert(
          aliase.filter((a) => a.wareId === w.id).map((a) => a.alias),
          (a) => a,
        ),
        gebindeIds: verknuepft.filter((g) => g.wareId === w.id).map((g) => g.gebindeId),
        bestand: eigener,
        fruehestesMhd: mhds[0] ?? null,
      };
    });
  };

  const vorgangDetails = async (
    rows: { vorgang: VorgangRow; buchung: BuchungRow }[],
    weitere: Map<string, number> = new Map(),
  ): Promise<VorgangDetails[]> => {
    const nachId = new Map<string, VorgangDetails>();
    const ersteller = await erstellerLaden(rows.map((r) => r.vorgang.erstelltVon));
    for (const { vorgang: v, buchung: b } of rows) {
      const eintrag = nachId.get(v.id) ?? {
        id: v.id,
        typ: v.typ,
        quelle: v.quelle,
        zeitpunkt: v.zeitpunkt.toISOString(),
        kommentar: v.kommentar,
        erstelltVon: v.erstelltVon,
        ersteller: ersteller.get(v.erstelltVon) ?? null,
        erstelltAm: v.erstelltAm.toISOString(),
        zeilen: [],
        weitereZeilen: weitere.get(v.id) ?? 0,
      };
      eintrag.zeilen.push({
        id: b.id,
        wareId: b.wareId,
        lagerortId: b.lagerortId,
        gebindeId: b.gebindeId,
        mhd: b.mhd,
        menge: b.menge,
        art: b.art,
      });
      nachId.set(v.id, eintrag);
    }
    for (const eintrag of nachId.values()) eintrag.zeilen.sort(vergleicheBuchungsZeilen);
    return [...nachId.values()].sort(
      (a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt) || b.erstelltAm.localeCompare(a.erstelltAm),
    );
  };

  /** Wares (with their Gebinde) that are mentioned in an inventory. */
  const warenKurz = async (q: Q, ids: string[]): Promise<WareKurz[]> => {
    if (ids.length === 0) return [];
    const [rows, verknuepft] = await Promise.all([
      q.select().from(waren).where(inArray(waren.id, ids)),
      q.select().from(wareGebinde).where(inArray(wareGebinde.wareId, ids)),
    ]);
    return sortiert(rows, (w) => w.name).map((w) => ({
      id: w.id,
      name: w.name,
      mhdArt: w.mhdArt,
      archiviert: w.archiviert,
      gebindeIds: verknuepft.filter((g) => g.wareId === w.id).map((g) => g.gebindeId),
    }));
  };

  const inventurUebersichten = async (rows: InventurRow[]): Promise<InventurUebersicht[]> => {
    if (rows.length === 0) return [];
    const [alle, ersteller] = await Promise.all([
      db.select().from(lagerorte),
      erstellerLaden(rows.map((r) => r.gestartetVon)),
    ]);
    return rows.map((r) => ({
      id: r.id,
      lagerortId: r.lagerortId,
      lagerortPfad: pfad(alle, r.lagerortId),
      status: r.status,
      gestartetVon: r.gestartetVon,
      ersteller: ersteller.get(r.gestartetVon) ?? null,
      gestartetAm: r.gestartetAm.toISOString(),
      vorgangId: r.vorgangId,
    }));
  };

  /** The inventory plus the ids of the nodes it covers (in counting order). */
  const inventurKontext = async (q: Q, id: string) => {
    const [inventur] = await q.select().from(inventuren).where(eq(inventuren.id, id));
    if (!inventur) return undefined;
    const alle = await q.select().from(lagerorte);
    const mitIfcos = await ortMitIfcos(q);
    return { inventur, alle, knotenIds: inventurKnotenIds(alle, inventur.lagerortId, mitIfcos) };
  };

  const nurOffen = (inventur: InventurRow) => {
    if (inventur.status !== 'offen')
      throw new WarenKonflikt('Die Inventur ist bereits abgeschlossen.');
  };

  const istZaehlungen = async (q: Q, inventurId: string): Promise<InventurIst[]> =>
    (
      await q.select().from(inventurZaehlungen).where(eq(inventurZaehlungen.inventurId, inventurId))
    ).map((z) => ({
      lagerortId: z.lagerortId,
      wareId: z.wareId,
      gebindeId: z.gebindeId,
      mhd: z.mhd,
      anzahl: z.anzahl,
    }));

  /** Parses the Gebinde of a ware save and returns the ids to store (Untergebinde added). */
  const wareSpeichern = async (tx: Tx, id: string | undefined, daten: WareDaten) => {
    const [bisher, alleGebinde, vorhandeneVerknuepfung] = await Promise.all([
      id ? tx.select().from(waren).where(eq(waren.id, id)) : Promise.resolve([]),
      tx.select().from(gebinde),
      id ? tx.select().from(wareGebinde).where(eq(wareGebinde.wareId, id)) : Promise.resolve([]),
    ]);
    if (id && !bisher[0]) return false;

    if (!bisher[0] || bisher[0].warengruppeId !== daten.warengruppeId) {
      const [gruppe] = await tx
        .select()
        .from(warengruppen)
        .where(eq(warengruppen.id, daten.warengruppeId));
      if (!gruppe) throw new WarenUngueltig('Die Warengruppe existiert nicht.');
      if (gruppe.archiviert) throw new WarenUngueltig('Die Warengruppe ist archiviert.');
    }

    const bekannt = new Set(alleGebinde.map((g) => g.id));
    if (daten.gebindeIds.some((g) => !bekannt.has(g))) {
      throw new WarenUngueltig('Ein ausgewähltes Gebinde existiert nicht.');
    }
    const gebindeIds = gebindeErgaenzen(daten.gebindeIds, alleGebinde);
    const vorher = new Set(vorhandeneVerknuepfung.map((v) => v.gebindeId));
    for (const g of alleGebinde) {
      if (gebindeIds.includes(g.id) && !vorher.has(g.id) && g.archiviert) {
        throw new WarenUngueltig('Ein ausgewähltes Gebinde ist archiviert.');
      }
    }
    const entfernt = [...vorher].filter((g) => !gebindeIds.includes(g));
    if (id && entfernt.length > 0) {
      const benutzt = await gibtEs(
        tx,
        bestandsbuchungen,
        and(eq(bestandsbuchungen.wareId, id), inArray(bestandsbuchungen.gebindeId, entfernt)),
      );
      if (benutzt) {
        throw new WarenKonflikt(
          'Ein Gebinde, das du entfernen willst, wird für diese Ware noch verwendet.',
        );
      }
    }

    const wareId = id ?? randomUUID();
    const werte = {
      name: daten.name,
      warengruppeId: daten.warengruppeId,
      mhdArt: daten.mhdArt,
    };
    if (id) {
      await tx.update(waren).set(werte).where(eq(waren.id, id));
      await tx.delete(wareAliase).where(eq(wareAliase.wareId, id));
      await tx.delete(wareGebinde).where(eq(wareGebinde.wareId, id));
    } else {
      await tx.insert(waren).values({ id: wareId, ...werte });
    }
    if (daten.aliase.length > 0) {
      await tx.insert(wareAliase).values(daten.aliase.map((alias) => ({ wareId, alias })));
    }
    await tx.insert(wareGebinde).values(gebindeIds.map((gebindeId) => ({ wareId, gebindeId })));
    return wareId;
  };

  return {
    // ----- Lagerorte
    async lagerorte(mitArchiv) {
      const rows = await db.select().from(lagerorte);
      return rows
        .filter((l) => mitArchiv || !l.archiviert)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));
    },
    async lagerortAnlegen(daten, boeden = [], boedenIfcoPlatz = null) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(lagerorte);
        const fehler = elternFehler(alle, daten.parentId);
        if (fehler) throw new WarenUngueltig(fehler);
        elternKeinIfcoPlatz(alle.find((l) => l.id === daten.parentId));
        const art = daten.art ?? null;
        const masse = daten.ifcoPlatz ?? null;
        if (masse) {
          const markieren = ifcoPlatzMarkierenFehler(art, 0);
          if (markieren) throw new WarenUngueltig(markieren);
        }
        if (boedenIfcoPlatz && art !== 'regal') {
          throw new WarenUngueltig('Ifco-Lagerplätze für Regalböden gibt es nur bei einem Regal.');
        }
        const artProblem = lagerortArtFehler(
          art,
          alle.find((l) => l.id === daten.parentId) ?? null,
        );
        if (artProblem) throw new WarenUngueltig(artProblem);
        if (art === 'regalboden') {
          const gleich = bodenNamenFehler(
            [daten.name],
            alle.filter((l) => l.parentId === daten.parentId).map((l) => l.name),
          )[0];
          if (gleich) throw new WarenUngueltig(gleich);
        }
        const id = randomUUID();
        await tx.insert(lagerorte).values({
          id,
          name: daten.name,
          beschreibung: daten.beschreibung,
          parentId: daten.parentId,
          art,
          ifcoHoeheCm: masse?.hoeheCm ?? null,
          ifcoStellflaechen: masse?.stellflaechen ?? null,
          position: naechstePosition(alle.filter((l) => l.parentId === daten.parentId)),
        });
        const boedenIds = await boedenEinfuegen(tx, id, boeden, 0, boedenIfcoPlatz);
        return { id, boedenIds };
      });
    },
    async boedenHinzufuegen(id, namen, ifcoPlatz = null) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(lagerorte);
        const regal = alle.find((l) => l.id === id);
        if (!regal) return undefined;
        if (regal.art !== 'regal') {
          throw new WarenUngueltig('Regalböden lassen sich nur einem Regal hinzufügen.');
        }
        if (regal.archiviert) throw new WarenUngueltig('Das Regal ist archiviert.');
        const fehler = bodenNamenFehler(
          namen,
          alle.filter((l) => l.parentId === id).map((l) => l.name),
        ).find(Boolean);
        if (fehler) throw new WarenUngueltig(fehler);
        return boedenEinfuegen(
          tx,
          id,
          namen,
          naechstePosition(alle.filter((l) => l.parentId === id)),
          ifcoPlatz,
        );
      });
    },
    async lagerortAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(lagerorte);
        const bisher = alle.find((l) => l.id === id);
        if (!bisher) return false;
        const fehler = zyklusFehler(alle, id, daten.parentId);
        if (fehler) throw new WarenUngueltig(fehler);
        const art = daten.art === undefined ? bisher.art : daten.art;
        const bisherMasse = ifcoPlatzMasse(bisher);
        const masse = daten.ifcoPlatz === undefined ? bisherMasse : daten.ifcoPlatz;
        if (masse) {
          const kinder = alle.filter((l) => l.parentId === id).length;
          const markieren = ifcoPlatzMarkierenFehler(art, kinder);
          if (markieren) throw new WarenUngueltig(markieren);
          const passt = await ifcoPlatzPruefen(tx, { id, name: daten.name }, masse);
          if (passt) throw new WarenUngueltig(passt);
        }
        const artProblem = lagerortArtAenderungFehler(bisher, art, alle);
        if (artProblem) throw new WarenUngueltig(artProblem);
        let position = bisher.position;
        if (daten.parentId !== bisher.parentId) {
          const elternProblem = elternFehler(alle, daten.parentId);
          if (elternProblem) throw new WarenUngueltig(elternProblem);
          elternKeinIfcoPlatz(alle.find((l) => l.id === daten.parentId));
          position = naechstePosition(alle.filter((l) => l.parentId === daten.parentId));
        }
        if (daten.parentId !== bisher.parentId || art !== bisher.art) {
          const eltern = alle.find((l) => l.id === daten.parentId) ?? null;
          const stellungProblem = lagerortArtFehler(art, eltern);
          if (stellungProblem) throw new WarenUngueltig(stellungProblem);
        }
        if (art === 'regalboden') {
          const gleich = bodenNamenFehler(
            [daten.name],
            alle.filter((l) => l.parentId === daten.parentId && l.id !== id).map((l) => l.name),
          )[0];
          if (gleich) throw new WarenUngueltig(gleich);
        }
        await tx
          .update(lagerorte)
          .set({
            name: daten.name,
            beschreibung: daten.beschreibung,
            parentId: daten.parentId,
            art,
            ifcoHoeheCm: masse?.hoeheCm ?? null,
            ifcoStellflaechen: masse?.stellflaechen ?? null,
            position,
          })
          .where(eq(lagerorte.id, id));
        const kinderArt = kinderArtNach(bisher.art, art);
        if (kinderArt !== undefined) {
          await tx.update(lagerorte).set({ art: kinderArt }).where(eq(lagerorte.parentId, id));
        }
        return true;
      });
    },
    async lagerortLoeschen(id) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx.select().from(lagerorte).where(eq(lagerorte.id, id));
        if (!vorhanden) return false;
        const verwendet = await Promise.all([
          gibtEs(tx, lagerorte, eq(lagerorte.parentId, id)),
          gibtEs(tx, bestandsbuchungen, eq(bestandsbuchungen.lagerortId, id)),
          gibtEs(tx, lagerortWaren, eq(lagerortWaren.lagerortId, id)),
          gibtEs(tx, inventuren, eq(inventuren.lagerortId, id)),
          gibtEs(tx, inventurKnoten, eq(inventurKnoten.lagerortId, id)),
          gibtEs(tx, inventurZaehlungen, eq(inventurZaehlungen.lagerortId, id)),
          gibtEs(tx, ifcos, eq(ifcos.lagerortId, id)),
          gibtEs(tx, gegenstandPlaetze, eq(gegenstandPlaetze.lagerortId, id)),
          gibtEs(tx, ausleihePositionen, eq(ausleihePositionen.lagerortId, id)),
        ]);
        if (verwendet.some(Boolean)) throw new WarenKonflikt(verwendetMeldung('Lagerort'));
        await tx.delete(lagerorte).where(eq(lagerorte.id, id));
        return true;
      });
    },
    async lagerortArchivieren(id, archiviert) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(lagerorte);
        const knoten = alle.find((l) => l.id === id);
        if (!knoten) return false;
        const ids = teilbaumIds(alle, id);
        if (archiviert) {
          const bestand = bestandZu(
            await buchungenLaden(tx, inArray(bestandsbuchungen.lagerortId, ids)),
          );
          if (bestand.length > 0) {
            throw new WarenKonflikt(
              'Im Lagerort (oder darin) ist noch Bestand vorhanden. Buche ihn zuerst aus.',
            );
          }
          const offen = await gibtEs(
            tx,
            inventuren,
            and(eq(inventuren.status, 'offen'), inArray(inventuren.lagerortId, ids)),
          );
          if (offen) {
            throw new WarenKonflikt(
              'Für den Lagerort läuft noch eine Inventur. Schließe oder verwirf sie zuerst.',
            );
          }
          const [inventar, offenVerliehen] = await Promise.all([
            Promise.all([
              gibtEs(tx, ifcos, inArray(ifcos.lagerortId, ids)),
              gibtEs(tx, gegenstandPlaetze, inArray(gegenstandPlaetze.lagerortId, ids)),
            ]),
            offenLaden(tx, inArray(ausleihePositionen.lagerortId, ids)),
          ]);
          if (inventar.some(Boolean)) {
            throw new WarenKonflikt('Im Lagerort liegt noch Inventar. Räume es zuerst um.');
          }
          if (offenVerliehen.length > 0) {
            throw new WarenKonflikt(
              `Aus dem Lagerort ist noch etwas verliehen oder vorgemerkt${blockiertVon(offenVerliehen)}. Nimm es zuerst zurück.`,
            );
          }
        } else {
          const parent = alle.find((l) => l.id === knoten.parentId);
          if (parent?.archiviert) {
            throw new WarenKonflikt(
              'Der übergeordnete Lagerort ist archiviert. Stelle ihn zuerst wieder her.',
            );
          }
        }
        await tx.update(lagerorte).set({ archiviert }).where(inArray(lagerorte.id, ids));
        return true;
      });
    },
    async lagerortReihenfolge(parentId, ids) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(lagerorte);
        if (parentId !== null && !alle.some((l) => l.id === parentId)) return false;
        const kinder = alle.filter((l) => l.parentId === parentId);
        const fehler = reihenfolgeFehler(
          kinder.map((k) => k.id),
          ids,
          alle.find((l) => l.id === parentId)?.art ?? null,
        );
        if (fehler) throw new WarenUngueltig(fehler);
        for (const [position, id] of ids.entries()) {
          await tx.update(lagerorte).set({ position }).where(eq(lagerorte.id, id));
        }
        return true;
      });
    },
    async lagerortWaren(id) {
      const [vorhanden] = await db.select().from(lagerorte).where(eq(lagerorte.id, id));
      if (!vorhanden) return undefined;
      const rows = await db
        .select()
        .from(lagerortWaren)
        .where(eq(lagerortWaren.lagerortId, id))
        .orderBy(asc(lagerortWaren.position));
      return rows.map((r) => r.wareId);
    },
    async lagerortWarenlisten() {
      const rows = await db.select().from(lagerortWaren).orderBy(asc(lagerortWaren.position));
      const listen = new Map<string, string[]>();
      for (const r of rows)
        listen.set(r.lagerortId, [...(listen.get(r.lagerortId) ?? []), r.wareId]);
      return [...listen].map(([lagerortId, wareIds]) => ({ lagerortId, wareIds }));
    },
    async lagerortWarenSetzen(id, wareIds) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx.select().from(lagerorte).where(eq(lagerorte.id, id));
        if (!vorhanden) return false;
        const bisher = new Set(
          (await tx.select().from(lagerortWaren).where(eq(lagerortWaren.lagerortId, id))).map(
            (r) => r.wareId,
          ),
        );
        const rows = wareIds.length
          ? await tx.select().from(waren).where(inArray(waren.id, wareIds))
          : [];
        if (rows.length !== wareIds.length) throw new WarenUngueltig('Eine Ware existiert nicht.');
        if (rows.some((w) => w.archiviert && !bisher.has(w.id))) {
          throw new WarenUngueltig('Eine ausgewählte Ware ist archiviert.');
        }
        await tx.delete(lagerortWaren).where(eq(lagerortWaren.lagerortId, id));
        if (wareIds.length > 0) {
          await tx
            .insert(lagerortWaren)
            .values(wareIds.map((wareId, position) => ({ lagerortId: id, wareId, position })));
        }
        return true;
      });
    },

    // ----- Warengruppen
    async warengruppen(mitArchiv) {
      const rows = await db.select().from(warengruppen);
      return sortiert(
        rows.filter((g) => mitArchiv || !g.archiviert),
        (g) => g.name,
      );
    },
    async warengruppeAnlegen(daten) {
      return db.transaction(async (tx) => {
        const fehler = elternFehler(await tx.select().from(warengruppen), daten.parentId);
        if (fehler) throw new WarenUngueltig(fehler);
        const id = randomUUID();
        await tx.insert(warengruppen).values({ id, ...daten });
        return id;
      });
    },
    async warengruppeAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(warengruppen);
        const bisher = alle.find((g) => g.id === id);
        if (!bisher) return false;
        const fehler =
          zyklusFehler(alle, id, daten.parentId) ??
          (daten.parentId !== bisher.parentId ? elternFehler(alle, daten.parentId) : null);
        if (fehler) throw new WarenUngueltig(fehler);
        await tx.update(warengruppen).set(daten).where(eq(warengruppen.id, id));
        return true;
      });
    },
    async warengruppeLoeschen(id) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx.select().from(warengruppen).where(eq(warengruppen.id, id));
        if (!vorhanden) return false;
        const verwendet = await Promise.all([
          gibtEs(tx, warengruppen, eq(warengruppen.parentId, id)),
          gibtEs(tx, waren, eq(waren.warengruppeId, id)),
        ]);
        if (verwendet.some(Boolean)) throw new WarenKonflikt(verwendetMeldung('Warengruppe'));
        await tx.delete(warengruppen).where(eq(warengruppen.id, id));
        return true;
      });
    },
    async warengruppeArchivieren(id, archiviert) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(warengruppen);
        const gruppe = alle.find((g) => g.id === id);
        if (!gruppe) return false;
        if (!archiviert && alle.find((g) => g.id === gruppe.parentId)?.archiviert) {
          throw new WarenKonflikt(
            'Die übergeordnete Warengruppe ist archiviert. Stelle sie zuerst wieder her.',
          );
        }
        await tx
          .update(warengruppen)
          .set({ archiviert })
          .where(inArray(warengruppen.id, teilbaumIds(alle, id)));
        return true;
      });
    },

    // ----- Gebinde
    async gebinde(mitArchiv) {
      const rows = await db.select().from(gebinde);
      return gebindeSortieren(
        rows.filter((g) => mitArchiv || !g.archiviert),
        rows,
      );
    },
    async gebindeAnlegen(daten) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(gebinde);
        const fehler = gebindeFehler(daten, alle);
        if (fehler) throw new WarenUngueltig(fehler);
        if (alle.find((g) => g.id === daten.unterGebindeId)?.archiviert) {
          throw new WarenUngueltig('Das Untergebinde ist archiviert.');
        }
        if (gebindeDoppelt(daten, alle)) throw new WarenKonflikt(GEBINDE_DOPPELT);
        const id = randomUUID();
        await tx.insert(gebinde).values({ id, ...daten });
        return id;
      });
    },
    async gebindeAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(gebinde);
        const bisher = alle.find((g) => g.id === id);
        if (!bisher) return false;
        const fehler = gebindeFehler({ id, ...daten }, alle);
        if (fehler) throw new WarenUngueltig(fehler);
        if (
          daten.unterGebindeId !== bisher.unterGebindeId &&
          alle.find((g) => g.id === daten.unterGebindeId)?.archiviert
        ) {
          throw new WarenUngueltig('Das Untergebinde ist archiviert.');
        }
        if (gebindeDoppelt(daten, alle, id)) throw new WarenKonflikt(GEBINDE_DOPPELT);
        await tx.update(gebinde).set(daten).where(eq(gebinde.id, id));
        return true;
      });
    },
    async gebindeLoeschen(id) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx.select().from(gebinde).where(eq(gebinde.id, id));
        if (!vorhanden) return false;
        const verwendet = await Promise.all([
          gibtEs(tx, gebinde, eq(gebinde.unterGebindeId, id)),
          gibtEs(tx, wareGebinde, eq(wareGebinde.gebindeId, id)),
          gibtEs(tx, bestandsbuchungen, eq(bestandsbuchungen.gebindeId, id)),
          gibtEs(tx, inventurZaehlungen, eq(inventurZaehlungen.gebindeId, id)),
        ]);
        if (verwendet.some(Boolean)) throw new WarenKonflikt(verwendetMeldung('Gebinde'));
        await tx.delete(gebinde).where(eq(gebinde.id, id));
        return true;
      });
    },
    async gebindeArchivieren(id, archiviert) {
      const rows = await db
        .update(gebinde)
        .set({ archiviert })
        .where(eq(gebinde.id, id))
        .returning({ id: gebinde.id });
      return rows.length > 0;
    },

    // ----- Waren
    async waren(mitArchiv) {
      const rows = await db.select().from(waren);
      return warenDetails(
        sortiert(
          rows.filter((w) => mitArchiv || !w.archiviert),
          (w) => w.name,
        ),
      );
    },
    async wareHolen(id) {
      const rows = await db.select().from(waren).where(eq(waren.id, id));
      return (await warenDetails(rows, [id]))[0];
    },
    async wareAnlegen(daten) {
      const id = await db.transaction((tx) => wareSpeichern(tx, undefined, daten));
      if (!id) throw new Error('Ware konnte nicht angelegt werden');
      return id;
    },
    async wareAktualisieren(id, daten) {
      return (await db.transaction((tx) => wareSpeichern(tx, id, daten))) !== false;
    },
    async wareLoeschen(id) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx.select().from(waren).where(eq(waren.id, id));
        if (!vorhanden) return false;
        const verwendet = await Promise.all([
          gibtEs(tx, bestandsbuchungen, eq(bestandsbuchungen.wareId, id)),
          gibtEs(tx, lagerortWaren, eq(lagerortWaren.wareId, id)),
          gibtEs(tx, inventurZaehlungen, eq(inventurZaehlungen.wareId, id)),
        ]);
        if (verwendet.some(Boolean)) throw new WarenKonflikt(verwendetMeldung('Ware'));
        await tx.delete(wareAliase).where(eq(wareAliase.wareId, id));
        await tx.delete(wareGebinde).where(eq(wareGebinde.wareId, id));
        await tx.delete(waren).where(eq(waren.id, id));
        return true;
      });
    },
    async wareArchivieren(id, archiviert) {
      const rows = await db
        .update(waren)
        .set({ archiviert })
        .where(eq(waren.id, id))
        .returning({ id: waren.id });
      return rows.length > 0;
    },
    async wareBestand(id) {
      const [ware] = await db.select().from(waren).where(eq(waren.id, id));
      if (!ware) return undefined;
      return bestandZu(await buchungenLaden(db, eq(bestandsbuchungen.wareId, id)));
    },
    async wareVerlauf(id) {
      const [ware] = await db.select().from(waren).where(eq(waren.id, id));
      if (!ware) return undefined;
      const [buchungen, orte, alleGebinde] = await Promise.all([
        buchungenLaden(db, eq(bestandsbuchungen.wareId, id)),
        db.select().from(lagerorte),
        db.select().from(gebinde),
      ]);
      const punkte = verlauf(buchungen, orte, alleGebinde);
      const { serien, zeilen } = verlaufSerien(punkte, alleGebinde);
      const lagerIds = new Set(serien.flatMap((s) => (s.lagerId ? [s.lagerId] : [])));
      const gebindeIds = new Set(serien.map((s) => s.basisGebindeId));
      return {
        serien,
        zeilen,
        punkte,
        lager: orte.filter((l) => lagerIds.has(l.id)).map((l) => ({ id: l.id, name: l.name })),
        gebinde: alleGebinde
          .filter((g) => gebindeIds.has(g.id))
          .map((g) => ({
            id: g.id,
            bezeichnung: gebindeBezeichnung(g, alleGebinde),
            kurz: gebindeKurz(g),
          })),
      };
    },
    async wareVorgaenge(id) {
      const [ware] = await db.select().from(waren).where(eq(waren.id, id));
      if (!ware) return undefined;
      const rows = await db
        .select({ vorgang: bestandsvorgaenge, buchung: bestandsbuchungen })
        .from(bestandsbuchungen)
        .innerJoin(bestandsvorgaenge, eq(bestandsvorgaenge.id, bestandsbuchungen.vorgangId))
        .where(eq(bestandsbuchungen.wareId, id))
        .orderBy(desc(bestandsvorgaenge.zeitpunkt));
      const vorgangIds = [...new Set(rows.map((r) => r.vorgang.id))];
      const weitere = new Map<string, number>();
      if (vorgangIds.length > 0) {
        const andere = await db
          .select({ vorgangId: bestandsbuchungen.vorgangId })
          .from(bestandsbuchungen)
          .where(
            and(inArray(bestandsbuchungen.vorgangId, vorgangIds), ne(bestandsbuchungen.wareId, id)),
          );
        for (const a of andere) weitere.set(a.vorgangId, (weitere.get(a.vorgangId) ?? 0) + 1);
      }
      return vorgangDetails(rows, weitere);
    },

    // ----- Bestand
    async einlagern(daten, sub) {
      return db.transaction(async (tx) => {
        const ware = await buchbareWare(tx, daten.wareId, daten.gebindeId);
        await buchbarerLagerort(tx, daten.lagerortId);
        const mhd = einlagerungMhd(daten.mhd, ware.mhdArt);
        return vorgangAnlegen(
          tx,
          {
            typ: 'einlagerung',
            quelle: 'manuell',
            zeitpunkt: daten.zeitpunkt,
            kommentar: daten.kommentar,
            erstelltVon: sub,
          },
          [
            {
              wareId: daten.wareId,
              lagerortId: daten.lagerortId,
              gebindeId: daten.gebindeId,
              mhd,
              menge: daten.anzahl,
              art: 'zugang',
            },
          ],
        );
      });
    },
    async entnehmen(daten, sub) {
      return db.transaction(async (tx) => {
        await buchbareWare(tx, daten.wareId, daten.gebindeId);
        await buchbarerLagerort(tx, daten.lagerortId, true);
        const [buchungen, orte, alleGebinde] = await Promise.all([
          buchungenLaden(tx, eq(bestandsbuchungen.wareId, daten.wareId)),
          tx.select().from(lagerorte),
          tx.select().from(gebinde),
        ]);
        const zeilen = entnahmeZeilen({
          buchungen,
          lagerorte: orte,
          gebinde: alleGebinde,
          ...daten,
        });
        return vorgangAnlegen(
          tx,
          {
            typ: 'entnahme',
            quelle: 'manuell',
            zeitpunkt: daten.zeitpunkt,
            kommentar: daten.kommentar,
            erstelltVon: sub,
          },
          zeilen.map((z) => ({ ...z, wareId: daten.wareId })),
        );
      });
    },
    async einlagerungen(daten, sub) {
      return db.transaction(async (tx) => {
        const zeilen: ZeileMitWare[] = [];
        for (const p of daten.positionen) {
          const ware = await buchbareWare(tx, p.wareId, p.gebindeId);
          await buchbarerLagerort(tx, p.lagerortId);
          zeilen.push({
            wareId: p.wareId,
            lagerortId: p.lagerortId,
            gebindeId: p.gebindeId,
            mhd: einlagerungMhd(p.mhd, ware.mhdArt),
            menge: p.anzahl,
            art: 'zugang',
          });
        }
        return vorgangAnlegen(
          tx,
          {
            typ: 'einlagerung',
            quelle: 'manuell',
            zeitpunkt: daten.zeitpunkt,
            kommentar: daten.kommentar,
            erstelltVon: sub,
          },
          zeilen,
        );
      });
    },
    async entnahmen(daten, sub) {
      return db.transaction(async (tx) => {
        for (const p of daten.positionen) {
          await buchbareWare(tx, p.wareId, p.gebindeId);
          await buchbarerLagerort(tx, p.lagerortId, true);
        }
        for (const n of daten.nachfuellen) {
          await buchbarerLagerort(tx, n.lagerortId);
          await buchbarerLagerort(tx, n.quelleId, true);
        }
        const wareIds = [...new Set(daten.positionen.map((p) => p.wareId))];
        const [buchungen, alleGebinde] = await Promise.all([
          buchungenLaden(tx, inListe(bestandsbuchungen.wareId, wareIds)),
          tx.select().from(gebinde),
        ]);
        const { entnahme, umlagerung } = entnahmenZeilen({
          buchungen,
          gebinde: alleGebinde,
          ...daten,
        });
        const vorgang = {
          quelle: 'manuell' as const,
          zeitpunkt: daten.zeitpunkt,
          kommentar: daten.kommentar,
          erstelltVon: sub,
        };
        const entnahmeId = await vorgangAnlegen(tx, { typ: 'entnahme', ...vorgang }, entnahme);
        const umlagerungId =
          umlagerung.length > 0
            ? await vorgangAnlegen(tx, { typ: 'umlagerung', ...vorgang }, umlagerung)
            : null;
        return { entnahmeId, umlagerungId };
      });
    },
    async umlagerungen(daten, sub) {
      return db.transaction(async (tx) => {
        for (const p of daten.positionen) {
          await buchbareWare(tx, p.wareId, p.gebindeId);
          await buchbarerLagerort(tx, p.vonId, true);
          await buchbarerLagerort(tx, p.nachId);
        }
        const wareIds = [...new Set(daten.positionen.map((p) => p.wareId))];
        const [buchungen, alleGebinde] = await Promise.all([
          buchungenLaden(tx, inListe(bestandsbuchungen.wareId, wareIds)),
          tx.select().from(gebinde),
        ]);
        const zeilen = umlagerungenZeilen({
          buchungen,
          gebinde: alleGebinde,
          positionen: daten.positionen,
          zeitpunkt: daten.zeitpunkt,
        });
        return vorgangAnlegen(
          tx,
          {
            typ: 'umlagerung',
            quelle: 'manuell',
            zeitpunkt: daten.zeitpunkt,
            kommentar: daten.kommentar,
            erstelltVon: sub,
          },
          zeilen,
        );
      });
    },
    async lagerortBestand() {
      return lagerortBestandZeilen(await buchungenLaden(db));
    },
    async vorgangLoeschen(id) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx
          .select()
          .from(bestandsvorgaenge)
          .where(eq(bestandsvorgaenge.id, id));
        if (!vorhanden) return false;
        await tx.update(inventuren).set({ vorgangId: null }).where(eq(inventuren.vorgangId, id));
        await tx.delete(bestandsbuchungen).where(eq(bestandsbuchungen.vorgangId, id));
        await tx.delete(bestandsvorgaenge).where(eq(bestandsvorgaenge.id, id));
        return true;
      });
    },

    // ----- Inventur
    async inventuren(status) {
      const rows = await db
        .select()
        .from(inventuren)
        .where(status ? eq(inventuren.status, status) : undefined)
        .orderBy(desc(inventuren.gestartetAm));
      return inventurUebersichten(rows);
    },
    async inventurStarten(lagerortId, sub) {
      return db.transaction(async (tx) => {
        await buchbarerLagerort(tx, lagerortId);
        const offen = await gibtEs(
          tx,
          inventuren,
          and(eq(inventuren.lagerortId, lagerortId), eq(inventuren.status, 'offen')),
        );
        if (offen) {
          throw new WarenKonflikt('Für diesen Lagerort läuft bereits eine Inventur.');
        }
        const id = randomUUID();
        await tx.insert(inventuren).values({ id, lagerortId, status: 'offen', gestartetVon: sub });
        return id;
      });
    },
    async inventurHolen(id) {
      const kontext = await inventurKontext(db, id);
      if (!kontext) return undefined;
      const { inventur, alle, knotenIds } = kontext;
      const [zaehlungen, listen, buchungen, alleGebinde, uebersicht] = await Promise.all([
        db.select().from(inventurZaehlungen).where(eq(inventurZaehlungen.inventurId, id)),
        db
          .select()
          .from(lagerortWaren)
          .where(inListe(lagerortWaren.lagerortId, knotenIds))
          .orderBy(asc(lagerortWaren.position)),
        buchungenLaden(db, inListe(bestandsbuchungen.lagerortId, knotenIds)),
        db.select().from(gebinde),
        inventurUebersichten([inventur]),
      ]);
      const soll = bestandZu(buchungen, new Date().toISOString());
      const wareIds = [
        ...new Set([
          ...listen.map((l) => l.wareId),
          ...soll.map((p) => p.wareId),
          ...zaehlungen.map((z) => z.wareId),
        ]),
      ];
      const nachId = new Map(alle.map((l) => [l.id, l]));
      return {
        ...uebersicht[0]!,
        knoten: knotenIds.map((lagerortId) => ({
          lagerortId,
          name: nachId.get(lagerortId)?.name ?? '',
          pfad: pfad(alle, lagerortId),
          wareIds: listen.filter((l) => l.lagerortId === lagerortId).map((l) => l.wareId),
          soll: soll
            .filter((p) => p.lagerortId === lagerortId)
            .map(({ wareId, gebindeId, mhd, menge }) => ({ wareId, gebindeId, mhd, menge })),
          zaehlungen: zaehlungen
            .filter((z) => z.lagerortId === lagerortId)
            .map(({ wareId, gebindeId, mhd, anzahl }) => ({ wareId, gebindeId, mhd, anzahl })),
        })),
        waren: await warenKurz(db, wareIds),
        gebinde: alleGebinde,
      };
    },
    async inventurKnotenSpeichern(id, lagerortId, zaehlungen, inListeAufnehmen) {
      return db.transaction(async (tx) => {
        const kontext = await inventurKontext(tx, id);
        if (!kontext) return false;
        nurOffen(kontext.inventur);
        if (!kontext.knotenIds.includes(lagerortId)) {
          throw new WarenUngueltig('Der Lagerort gehört nicht zu dieser Inventur.');
        }
        const wareIds = [...new Set([...zaehlungen.map((z) => z.wareId), ...inListeAufnehmen])];
        const bekannt = await warenKurz(tx, wareIds);
        const normalisiert = zaehlungenNormalisieren(
          zaehlungen,
          new Map(bekannt.map((w) => [w.id, w])),
        );
        const liste = await tx
          .select()
          .from(lagerortWaren)
          .where(eq(lagerortWaren.lagerortId, lagerortId));
        const neu = inListeAufnehmen.filter((w) => !liste.some((l) => l.wareId === w));
        for (const wareId of neu) {
          const ware = bekannt.find((w) => w.id === wareId);
          if (!ware) throw new WarenUngueltig('Die Ware gibt es nicht.');
          if (ware.archiviert) throw new WarenUngueltig('Die Ware ist archiviert.');
        }
        const gebindeIds = [...new Set(normalisiert.map((z) => z.gebindeId))];
        if (gebindeIds.length > 0) {
          const gebindeRows = await tx
            .select()
            .from(gebinde)
            .where(inArray(gebinde.id, gebindeIds));
          if (gebindeRows.length !== gebindeIds.length) {
            throw new WarenUngueltig('Ein Gebinde existiert nicht.');
          }
        }

        await tx
          .delete(inventurZaehlungen)
          .where(
            and(
              eq(inventurZaehlungen.inventurId, id),
              eq(inventurZaehlungen.lagerortId, lagerortId),
            ),
          );
        if (normalisiert.length > 0) {
          await tx.insert(inventurZaehlungen).values(
            normalisiert.map((z) => ({
              id: randomUUID(),
              inventurId: id,
              lagerortId,
              ...z,
            })),
          );
        }
        if (neu.length > 0) {
          const start = naechstePosition(liste);
          await tx
            .insert(lagerortWaren)
            .values(neu.map((wareId, i) => ({ lagerortId, wareId, position: start + i })));
        }
        return true;
      });
    },
    async inventurZusammenfassung(id, zeitpunkt = new Date().toISOString()) {
      const kontext = await inventurKontext(db, id);
      if (!kontext) return undefined;
      nurOffen(kontext.inventur);
      const { alle, knotenIds } = kontext;
      const [buchungen, ist, alleGebinde] = await Promise.all([
        buchungenLaden(db, inListe(bestandsbuchungen.lagerortId, knotenIds)),
        istZaehlungen(db, id),
        db.select().from(gebinde),
      ]);
      const zeilen = inventurAbgleich(bestandZu(buchungen, zeitpunkt), ist, knotenIds);
      return {
        zeitpunkt,
        zeilen: zeilen.map((z) => ({
          lagerortId: z.lagerortId,
          wareId: z.wareId,
          gebindeId: z.gebindeId,
          mhd: z.mhd,
          soll: z.soll,
          ist: z.ist,
          differenz: z.differenz,
          lagerortPfad: pfad(alle, z.lagerortId),
        })),
        waren: await warenKurz(db, [...new Set(zeilen.map((z) => z.wareId))]),
        gebinde: alleGebinde,
      };
    },
    async inventurAbschliessen(id, zeitpunkt, sub) {
      return db.transaction(async (tx) => {
        const kontext = await inventurKontext(tx, id);
        if (!kontext) return undefined;
        nurOffen(kontext.inventur);
        const { knotenIds } = kontext;
        const [buchungen, ist] = await Promise.all([
          buchungenLaden(tx, inListe(bestandsbuchungen.lagerortId, knotenIds)),
          istZaehlungen(tx, id),
        ]);
        // Soll keys without a stored count are taken as correct; only counts yield corrections.
        const korrekturen = inventurKorrekturen(bestandZu(buchungen, zeitpunkt), ist, knotenIds);
        const vorgangId = await vorgangAnlegen(
          tx,
          { typ: 'inventur', quelle: 'inventur', zeitpunkt, kommentar: null, erstelltVon: sub },
          korrekturen,
        );
        await tx
          .update(inventuren)
          .set({ status: 'abgeschlossen', vorgangId })
          .where(eq(inventuren.id, id));
        return vorgangId;
      });
    },
    async inventurVerwerfen(id) {
      return db.transaction(async (tx) => {
        const [inventur] = await tx.select().from(inventuren).where(eq(inventuren.id, id));
        if (!inventur) return false;
        nurOffen(inventur);
        await tx.delete(inventurZaehlungen).where(eq(inventurZaehlungen.inventurId, id));
        await tx.delete(inventurKnoten).where(eq(inventurKnoten.inventurId, id));
        await tx.delete(inventuren).where(eq(inventuren.id, id));
        return true;
      });
    },
  };
}
