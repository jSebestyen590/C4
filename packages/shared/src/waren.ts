import { z } from 'zod';
import { datumSchema } from './schemas';

export const MHD_ARTEN = ['keins', 'tag', 'monat'] as const;
export type MhdArt = (typeof MHD_ARTEN)[number];

export const BUCHUNGS_ARTEN = ['zugang', 'abgang', 'anbruch', 'korrektur'] as const;
export type BuchungsArt = (typeof BUCHUNGS_ARTEN)[number];

export const VORGANG_TYPEN = ['einlagerung', 'entnahme', 'inventur'] as const;
export type VorgangTyp = (typeof VORGANG_TYPEN)[number];

export const QUELLEN = ['manuell', 'inventur'] as const;
export type Quelle = (typeof QUELLEN)[number];

export interface Gebinde {
  id: string;
  name: string;
  pfandCent: number;
  unterGebindeId: string | null;
  unterAnzahl: number | null;
}

/** One booking row; stock is the sum of `menge` per (wareId, lagerortId, gebindeId, mhd). */
export interface Buchung {
  vorgangId: string;
  /** ISO timestamp. */
  zeitpunkt: string;
  wareId: string;
  lagerortId: string;
  gebindeId: string;
  mhd: string | null;
  menge: number;
  art: BuchungsArt;
}

/** Aggregated stock of one (wareId, lagerortId, gebindeId, mhd) combination. */
export interface Bestandsposten {
  wareId: string;
  lagerortId: string;
  gebindeId: string;
  mhd: string | null;
  menge: number;
  /** Earliest timestamp of a positive booking; FIFO tiebreaker after the MHD. */
  ersterZugang: string;
}

/** A booking line without vorgang/ware/time, as planned by `entnahmePlanen`. */
export interface Buchungszeile {
  lagerortId: string;
  gebindeId: string;
  mhd: string | null;
  menge: number;
  art: BuchungsArt;
}

// ---------------------------------------------------------------------------
// Schemas

const name = (feld = 'einen Namen') =>
  z.string().trim().min(1, `Bitte gib ${feld} ein.`).max(100, 'Höchstens 100 Zeichen erlaubt.');

const beschreibung = z
  .string()
  .trim()
  .max(2000, 'Höchstens 2000 Zeichen erlaubt.')
  .transform((v) => (v === '' ? null : v))
  .nullish()
  .transform((v) => v ?? null);

const idSchema = (meldung: string) => z.string().min(1, meldung);
const parentIdSchema = z
  .string()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

const anzahlSchema = z
  .number('Bitte gib eine Anzahl an.')
  .int('Die Anzahl muss eine ganze Zahl sein.')
  .min(1, 'Die Anzahl muss mindestens 1 sein.');

const zeitpunktSchema = z.iso.datetime({ offset: true, error: 'Ungültiger Zeitpunkt.' });

const mhdSchema = datumSchema.nullish().transform((v) => v ?? null);

const kommentarSchema = z
  .string()
  .trim()
  .max(500, 'Höchstens 500 Zeichen erlaubt.')
  .transform((v) => (v === '' ? null : v))
  .nullish()
  .transform((v) => v ?? null);

const eindeutig = (ids: string[]) => new Set(ids).size === ids.length;

export const lagerortSchema = z.object({
  name: name(),
  beschreibung,
  parentId: parentIdSchema,
});
export type LagerortEingabe = z.input<typeof lagerortSchema>;

export const lagerortReihenfolgeSchema = z.object({
  ids: z
    .array(idSchema('Ungültige Id.'))
    .refine(eindeutig, 'Jeder Eintrag darf nur einmal vorkommen.'),
});

export const lagerortWarenSchema = z.object({
  wareIds: z
    .array(idSchema('Ungültige Id.'))
    .refine(eindeutig, 'Jede Ware darf nur einmal vorkommen.'),
});

export const warengruppeSchema = z.object({
  name: name(),
  parentId: parentIdSchema,
});
export type WarengruppeEingabe = z.input<typeof warengruppeSchema>;

export const gebindeSchema = z
  .object({
    name: name(),
    pfandCent: z
      .number('Bitte gib das Pfand an.')
      .int('Das Pfand muss in ganzen Cent angegeben werden.')
      .min(0, 'Das Pfand darf nicht negativ sein.'),
    unterGebindeId: parentIdSchema,
    unterAnzahl: z
      .number()
      .int('Die Anzahl muss eine ganze Zahl sein.')
      .min(2, 'Die Anzahl muss mindestens 2 sein.')
      .nullish()
      .transform((v) => v ?? null),
  })
  .refine((g) => (g.unterGebindeId === null) === (g.unterAnzahl === null), {
    message: 'Gib Untergebinde und Anzahl entweder beide an oder keins von beiden.',
    path: ['unterAnzahl'],
  });
export type GebindeEingabe = z.input<typeof gebindeSchema>;

export const wareSchema = z.object({
  name: name(),
  warengruppeId: idSchema('Bitte wähle eine Warengruppe.'),
  mhdArt: z.enum(MHD_ARTEN, 'Ungültige MHD-Art.'),
  gebindeIds: z
    .array(idSchema('Ungültiges Gebinde.'))
    .min(1, 'Bitte wähle mindestens ein Gebinde.')
    .refine(eindeutig, 'Jedes Gebinde darf nur einmal vorkommen.'),
  aliase: z
    .array(z.string().trim().min(1, 'Ein Alias darf nicht leer sein.').max(100))
    .default([])
    .refine(
      (a) => new Set(a.map((x) => x.toLowerCase())).size === a.length,
      'Jeder Alias darf nur einmal vorkommen.',
    ),
});
export type WareEingabe = z.input<typeof wareSchema>;

export const einlagerungSchema = z.object({
  wareId: idSchema('Bitte wähle eine Ware.'),
  lagerortId: idSchema('Bitte wähle einen Lagerort.'),
  gebindeId: idSchema('Bitte wähle ein Gebinde.'),
  anzahl: anzahlSchema,
  mhd: mhdSchema,
  zeitpunkt: zeitpunktSchema,
  kommentar: kommentarSchema,
});
export type EinlagerungEingabe = z.input<typeof einlagerungSchema>;

export const entnahmeSchema = z.object({
  wareId: idSchema('Bitte wähle eine Ware.'),
  lagerortId: idSchema('Bitte wähle einen Lagerort.'),
  gebindeId: idSchema('Bitte wähle ein Gebinde.'),
  anzahl: anzahlSchema,
  zeitpunkt: zeitpunktSchema,
  kommentar: kommentarSchema,
});
export type EntnahmeEingabe = z.input<typeof entnahmeSchema>;

export const inventurZaehlungSchema = z.object({
  zaehlungen: z.array(
    z.object({
      wareId: idSchema('Bitte wähle eine Ware.'),
      gebindeId: idSchema('Bitte wähle ein Gebinde.'),
      mhd: mhdSchema,
      anzahl: z
        .number('Bitte gib eine Anzahl an.')
        .int('Die Anzahl muss eine ganze Zahl sein.')
        .min(0, 'Die Anzahl darf nicht negativ sein.'),
    }),
  ),
  inListeAufnehmen: z
    .array(idSchema('Ungültige Id.'))
    .default([])
    .refine(eindeutig, 'Jede Ware darf nur einmal vorkommen.'),
});
export type InventurZaehlungEingabe = z.input<typeof inventurZaehlungSchema>;

// ---------------------------------------------------------------------------
// Trees (Lagerorte, Warengruppen)

export interface BaumKnoten {
  id: string;
  parentId: string | null;
  name: string;
  position?: number;
}

export interface BaumEintrag<T extends BaumKnoten> {
  node: T;
  kinder: BaumEintrag<T>[];
}

const nachPosition = (a: BaumKnoten, b: BaumKnoten) =>
  (a.position ?? 0) - (b.position ?? 0) ||
  a.name.localeCompare(b.name, 'de') ||
  a.id.localeCompare(b.id);

function kinderIndex<T extends BaumKnoten>(nodes: T[]): Map<string | null, T[]> {
  const ids = new Set(nodes.map((n) => n.id));
  const index = new Map<string | null, T[]>();
  for (const n of nodes) {
    // A node whose parent is unknown is treated as a top-level node.
    const key = n.parentId !== null && ids.has(n.parentId) ? n.parentId : null;
    const liste = index.get(key) ?? [];
    liste.push(n);
    index.set(key, liste);
  }
  for (const liste of index.values()) liste.sort(nachPosition);
  return index;
}

/** Forest of the nodes; children sorted by position, then name. Nodes inside cycles are dropped. */
export function baumBauen<T extends BaumKnoten>(nodes: T[]): BaumEintrag<T>[] {
  const index = kinderIndex(nodes);
  const besucht = new Set<string>();
  const bauen = (n: T): BaumEintrag<T> => {
    besucht.add(n.id);
    return {
      node: n,
      kinder: (index.get(n.id) ?? []).filter((k) => !besucht.has(k.id)).map(bauen),
    };
  };
  return (index.get(null) ?? []).filter((n) => !besucht.has(n.id)).map(bauen);
}

/** Preorder list of the subtree below `rootId` (root first, siblings by position). */
export function tiefensuche<T extends BaumKnoten>(nodes: T[], rootId: string): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = byId.get(rootId);
  if (!root) return [];
  const index = kinderIndex(nodes);
  const besucht = new Set<string>();
  const ergebnis: T[] = [];
  const gehe = (n: T) => {
    if (besucht.has(n.id)) return;
    besucht.add(n.id);
    ergebnis.push(n);
    for (const k of index.get(n.id) ?? []) gehe(k);
  };
  gehe(root);
  return ergebnis;
}

/** Ids of the subtree including the root. */
export function teilbaumIds(nodes: BaumKnoten[], rootId: string): string[] {
  return tiefensuche(nodes, rootId).map((n) => n.id);
}

function vorfahren(nodes: BaumKnoten[], id: string): BaumKnoten[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kette: BaumKnoten[] = [];
  const besucht = new Set<string>();
  let aktuell = byId.get(id);
  while (aktuell && !besucht.has(aktuell.id)) {
    besucht.add(aktuell.id);
    kette.unshift(aktuell);
    aktuell = aktuell.parentId === null ? undefined : byId.get(aktuell.parentId);
  }
  return kette;
}

/** Id of the top-level ancestor (the Lager) of a node; the node itself if unknown. */
export function oberstesLager(nodes: BaumKnoten[], id: string): string {
  return vorfahren(nodes, id)[0]?.id ?? id;
}

/** `Lager › Regal › Etage 1` */
export function pfad(nodes: BaumKnoten[], id: string): string {
  return vorfahren(nodes, id)
    .map((n) => n.name)
    .join(' › ');
}

// ---------------------------------------------------------------------------
// Gebinde

const gebindeIndex = (alle: Gebinde[]) => new Map(alle.map((g) => [g.id, g]));

/** Deposit of the Gebinde including the contained Untergebinde. */
export function gesamtPfandCent(gebinde: Gebinde, alle: Gebinde[]): number {
  const unter = gebinde.unterGebindeId ? gebindeIndex(alle).get(gebinde.unterGebindeId) : undefined;
  return gebinde.pfandCent + (unter ? (gebinde.unterAnzahl ?? 0) * unter.pfandCent : 0);
}

/** `310` -> `3,10 €` */
export function centAnzeigen(cent: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    .format(cent / 100)
    .replaceAll(String.fromCharCode(160), ' ');
}

/** Id of the base Gebinde (the Untergebinde of an Obergebinde, otherwise the Gebinde itself). */
export function basisGebinde(gebinde: Gebinde): string {
  return gebinde.unterGebindeId ?? gebinde.id;
}

/** Amount expressed in base units (1 Kasten of 20 -> 20). */
export function inBasiseinheiten(gebindeId: string, menge: number, alle: Gebinde[]): number {
  const g = gebindeIndex(alle).get(gebindeId);
  return menge * (g?.unterGebindeId ? (g.unterAnzahl ?? 1) : 1);
}

/** `9 × 20×0,5l Kasten, 13 × 0,5l Flasche`; Obergebinde first, zero amounts skipped. */
export function bestandAnzeigen(
  mengen: { gebindeId: string; menge: number }[],
  alle: Gebinde[],
): string {
  const index = gebindeIndex(alle);
  const summen = new Map<string, number>();
  for (const m of mengen) summen.set(m.gebindeId, (summen.get(m.gebindeId) ?? 0) + m.menge);
  const teile = [...summen]
    .filter(([, menge]) => menge !== 0)
    .map(([id, menge]) => ({ g: index.get(id), id, menge }))
    .sort(
      (a, b) =>
        Number(!!b.g?.unterGebindeId) - Number(!!a.g?.unterGebindeId) ||
        (a.g?.name ?? a.id).localeCompare(b.g?.name ?? b.id, 'de'),
    )
    .map((t) => `${t.menge} × ${t.g?.name ?? t.id}`);
  return teile.length === 0 ? 'kein Bestand' : teile.join(', ');
}

/** Adds the Untergebinde of every selected Obergebinde (without duplicates). */
export function gebindeErgaenzen(gebindeIds: string[], alle: Gebinde[]): string[] {
  const index = gebindeIndex(alle);
  const ergebnis = new Set(gebindeIds);
  for (const id of gebindeIds) {
    const unter = index.get(id)?.unterGebindeId;
    if (unter) ergebnis.add(unter);
  }
  return [...ergebnis];
}

/** German error message if the Gebinde may not be saved with this Untergebinde, otherwise null. */
export function gebindeFehler(
  neu: { id?: string; unterGebindeId: string | null },
  alle: Gebinde[],
): string | null {
  if (neu.unterGebindeId === null) return null;
  if (neu.id !== undefined && neu.unterGebindeId === neu.id) {
    return 'Ein Gebinde kann nicht sich selbst enthalten.';
  }
  const unter = alle.find((g) => g.id === neu.unterGebindeId);
  if (!unter) return 'Das Untergebinde existiert nicht.';
  if (unter.unterGebindeId !== null) {
    return 'Das Untergebinde darf selbst kein Untergebinde haben (nur eine Ebene erlaubt).';
  }
  if (neu.id !== undefined && alle.some((g) => g.unterGebindeId === neu.id)) {
    return 'Dieses Gebinde ist bereits Untergebinde eines anderen Gebindes und kann daher kein eigenes haben.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// MHD

/** Month-based MHD are stored as the first of the month, `keins` as null. */
export function mhdNormalisieren(iso: string | null | undefined, mhdArt: MhdArt): string | null {
  if (mhdArt === 'keins' || !iso) return null;
  return mhdArt === 'monat' ? `${iso.slice(0, 7)}-01` : iso;
}

/** `dd.MM.yyyy` / `MM.yyyy` / empty. */
export function mhdAnzeigen(mhd: string | null | undefined, mhdArt: MhdArt): string {
  if (!mhd || mhdArt === 'keins') return '';
  const [jahr, monat, tag] = mhd.split('-');
  return mhdArt === 'monat' ? `${monat}.${jahr}` : `${tag}.${monat}.${jahr}`;
}

// ---------------------------------------------------------------------------
// Stock

const zeit = (iso: string) => Date.parse(iso);
const schluessel = (...teile: (string | null)[]) => teile.map((t) => t ?? '').join('\u0000');

/**
 * Aggregates bookings (rows up to and including `zeitpunkt`) per ware, Lagerort, Gebinde and MHD.
 * Zero rows are dropped.
 */
export function bestandZu(buchungen: Buchung[], zeitpunkt?: string): Bestandsposten[] {
  const grenze = zeitpunkt === undefined ? Infinity : zeit(zeitpunkt);
  const posten = new Map<string, Bestandsposten & { positiv: boolean }>();
  for (const b of buchungen) {
    if (zeit(b.zeitpunkt) > grenze) continue;
    const key = schluessel(b.wareId, b.lagerortId, b.gebindeId, b.mhd);
    const p = posten.get(key) ?? {
      wareId: b.wareId,
      lagerortId: b.lagerortId,
      gebindeId: b.gebindeId,
      mhd: b.mhd,
      menge: 0,
      ersterZugang: b.zeitpunkt,
      positiv: false,
    };
    p.menge += b.menge;
    // Positive rows take precedence over negative ones for the first-in time.
    if (b.menge > 0 && (!p.positiv || zeit(b.zeitpunkt) < zeit(p.ersterZugang))) {
      p.ersterZugang = b.zeitpunkt;
      p.positiv = true;
    } else if (!p.positiv && zeit(b.zeitpunkt) < zeit(p.ersterZugang)) {
      p.ersterZugang = b.zeitpunkt;
    }
    posten.set(key, p);
  }
  return [...posten.values()]
    .filter((p) => p.menge !== 0)
    .map((p) => ({
      wareId: p.wareId,
      lagerortId: p.lagerortId,
      gebindeId: p.gebindeId,
      mhd: p.mhd,
      menge: p.menge,
      ersterZugang: p.ersterZugang,
    }));
}

type FifoPosten = Pick<
  Bestandsposten,
  'lagerortId' | 'gebindeId' | 'mhd' | 'menge' | 'ersterZugang'
>;

function fifoVergleich(a: FifoPosten, b: FifoPosten): number {
  if (a.mhd !== b.mhd) {
    if (a.mhd === null) return 1;
    if (b.mhd === null) return -1;
    return a.mhd < b.mhd ? -1 : 1;
  }
  return (
    zeit(a.ersterZugang) - zeit(b.ersterZugang) ||
    a.lagerortId.localeCompare(b.lagerortId) ||
    a.gebindeId.localeCompare(b.gebindeId)
  );
}

function zusammenfassen(zeilen: Buchungszeile[]): Buchungszeile[] {
  const map = new Map<string, Buchungszeile>();
  for (const z of zeilen) {
    const key = schluessel(z.lagerortId, z.gebindeId, z.mhd, z.art);
    const vorhanden = map.get(key);
    if (vorhanden) vorhanden.menge += z.menge;
    else map.set(key, { ...z });
  }
  return [...map.values()].filter((z) => z.menge !== 0);
}

/**
 * Plans a withdrawal FIFO (earliest MHD first, then earliest arrival). Uses loose units of the
 * requested Gebinde first, then opens Obergebinde (`anbruch`); a remainder goes negative on the
 * chosen Lagerort.
 */
export function entnahmePlanen(eingabe: {
  /** Stock of ONE ware, already restricted to the subtree of the chosen node. */
  posten: FifoPosten[];
  gebinde: Gebinde[];
  gebindeId: string;
  anzahl: number;
  /** The node the user chose; receives the negative remainder. */
  lagerortId: string;
}): Buchungszeile[] {
  const { gebindeId, lagerortId } = eingabe;
  const index = gebindeIndex(eingabe.gebinde);
  const arbeit = eingabe.posten
    .filter((p) => p.menge > 0)
    .map((p) => ({ ...p }))
    .sort(fifoVergleich);
  const zeilen: Buchungszeile[] = [];
  let rest = eingabe.anzahl;

  for (const p of arbeit) {
    if (rest <= 0) break;
    if (p.gebindeId !== gebindeId) continue;
    const nimm = Math.min(p.menge, rest);
    zeilen.push({ lagerortId: p.lagerortId, gebindeId, mhd: p.mhd, menge: -nimm, art: 'abgang' });
    rest -= nimm;
  }

  for (const p of arbeit) {
    if (rest <= 0) break;
    const ober = index.get(p.gebindeId);
    if (ober?.unterGebindeId !== gebindeId || !ober.unterAnzahl) continue;
    while (rest > 0 && p.menge > 0) {
      p.menge -= 1;
      zeilen.push({
        lagerortId: p.lagerortId,
        gebindeId: p.gebindeId,
        mhd: p.mhd,
        menge: -1,
        art: 'anbruch',
      });
      zeilen.push({
        lagerortId: p.lagerortId,
        gebindeId,
        mhd: p.mhd,
        menge: ober.unterAnzahl,
        art: 'anbruch',
      });
      const nimm = Math.min(ober.unterAnzahl, rest);
      zeilen.push({ lagerortId: p.lagerortId, gebindeId, mhd: p.mhd, menge: -nimm, art: 'abgang' });
      rest -= nimm;
    }
  }

  if (rest > 0) zeilen.push({ lagerortId, gebindeId, mhd: null, menge: -rest, art: 'abgang' });
  return zusammenfassen(zeilen);
}

// ---------------------------------------------------------------------------
// Verlauf

export interface VerlaufPunkt {
  zeitpunkt: string;
  /** Cumulative stock after this point, per top-level Lager and Gebinde (zero amounts omitted). */
  mengen: { lagerId: string; gebindeId: string; menge: number }[];
}

export function verlauf(
  buchungen: Buchung[],
  lagerorte: BaumKnoten[],
  gebinde: Gebinde[],
): VerlaufPunkt[] {
  void gebinde;
  const lager = new Map<string, string>();
  const lagerVon = (id: string) => {
    let l = lager.get(id);
    if (l === undefined) {
      l = oberstesLager(lagerorte, id);
      lager.set(id, l);
    }
    return l;
  };
  const sortiert = [...buchungen].sort((a, b) => zeit(a.zeitpunkt) - zeit(b.zeitpunkt));
  const summen = new Map<string, { lagerId: string; gebindeId: string; menge: number }>();
  const punkte: VerlaufPunkt[] = [];
  const schnappschuss = (zeitpunkt: string) =>
    punkte.push({
      zeitpunkt,
      mengen: [...summen.values()].filter((m) => m.menge !== 0).map((m) => ({ ...m })),
    });
  let aktuell: string | null = null;
  for (const b of sortiert) {
    if (aktuell !== null && zeit(b.zeitpunkt) !== zeit(aktuell)) schnappschuss(aktuell);
    aktuell = aktuell !== null && zeit(b.zeitpunkt) === zeit(aktuell) ? aktuell : b.zeitpunkt;
    const lagerId = lagerVon(b.lagerortId);
    const key = schluessel(lagerId, b.gebindeId);
    const m = summen.get(key) ?? { lagerId, gebindeId: b.gebindeId, menge: 0 };
    m.menge += b.menge;
    summen.set(key, m);
  }
  if (aktuell !== null) schnappschuss(aktuell);
  return punkte;
}

export interface VerlaufSerie {
  /** `${basisGebindeId}` (total) or `${basisGebindeId}|${lagerId}`. */
  key: string;
  basisGebindeId: string;
  lagerId: string | null;
}

export type VerlaufZeile = { zeitpunkt: string } & Record<string, number | string>;

/** Chart rows in base units plus the descriptors of all series (total and per Lager). */
export function verlaufSerien(
  punkte: VerlaufPunkt[],
  gebinde: Gebinde[],
): { serien: VerlaufSerie[]; zeilen: VerlaufZeile[] } {
  const index = gebindeIndex(gebinde);
  const basisVon = (id: string) => {
    const g = index.get(id);
    return g ? basisGebinde(g) : id;
  };
  const serien = new Map<string, VerlaufSerie>();
  const zeilen = punkte.map((p) => {
    const werte = new Map<string, number>();
    for (const m of p.mengen) {
      const basis = basisVon(m.gebindeId);
      const einheiten = inBasiseinheiten(m.gebindeId, m.menge, gebinde);
      const gesamt = basis;
      const proLager = `${basis}|${m.lagerId}`;
      serien.set(gesamt, { key: gesamt, basisGebindeId: basis, lagerId: null });
      serien.set(proLager, { key: proLager, basisGebindeId: basis, lagerId: m.lagerId });
      werte.set(gesamt, (werte.get(gesamt) ?? 0) + einheiten);
      werte.set(proLager, (werte.get(proLager) ?? 0) + einheiten);
    }
    return { zeitpunkt: p.zeitpunkt, werte };
  });
  const liste = [...serien.values()].sort(
    (a, b) =>
      a.basisGebindeId.localeCompare(b.basisGebindeId) ||
      (a.lagerId ?? '').localeCompare(b.lagerId ?? ''),
  );
  return {
    serien: liste,
    zeilen: zeilen.map(({ zeitpunkt, werte }) => {
      const zeile: VerlaufZeile = { zeitpunkt };
      for (const s of liste) zeile[s.key] = werte.get(s.key) ?? 0;
      return zeile;
    }),
  };
}

// ---------------------------------------------------------------------------
// Inventur

export interface InventurIst {
  lagerortId: string;
  wareId: string;
  gebindeId: string;
  mhd: string | null;
  anzahl: number;
}

export interface InventurZeile {
  lagerortId: string;
  wareId: string;
  gebindeId: string;
  mhd: string | null;
  soll: number;
  ist: number;
  /** ist - soll */
  differenz: number;
}

/** Compares counted stock with the expected stock on the given nodes; one row per key. */
export function inventurAbgleich(
  soll: Bestandsposten[],
  ist: InventurIst[],
  knotenIds: string[],
): InventurZeile[] {
  const knoten = new Set(knotenIds);
  const zeilen = new Map<string, InventurZeile>();
  const zeile = (k: Pick<InventurZeile, 'lagerortId' | 'wareId' | 'gebindeId' | 'mhd'>) => {
    const key = schluessel(k.lagerortId, k.wareId, k.gebindeId, k.mhd);
    let z = zeilen.get(key);
    if (!z) {
      z = { ...k, soll: 0, ist: 0, differenz: 0 };
      zeilen.set(key, z);
    }
    return z;
  };
  for (const p of soll) {
    if (knoten.has(p.lagerortId)) zeile(p).soll += p.menge;
  }
  for (const i of ist) {
    zeile({ lagerortId: i.lagerortId, wareId: i.wareId, gebindeId: i.gebindeId, mhd: i.mhd }).ist +=
      i.anzahl;
  }
  return [...zeilen.values()]
    .map((z) => ({ ...z, differenz: z.ist - z.soll }))
    .sort(
      (a, b) =>
        a.lagerortId.localeCompare(b.lagerortId) ||
        a.wareId.localeCompare(b.wareId) ||
        (a.mhd === b.mhd ? 0 : a.mhd === null ? 1 : b.mhd === null ? -1 : a.mhd < b.mhd ? -1 : 1) ||
        a.gebindeId.localeCompare(b.gebindeId),
    );
}

/** Correction lines (`korrektur`, ist - soll) for every difference. */
export function inventurKorrekturen(
  soll: Bestandsposten[],
  ist: InventurIst[],
  knotenIds: string[],
): (Buchungszeile & { wareId: string })[] {
  return inventurAbgleich(soll, ist, knotenIds)
    .filter((z) => z.differenz !== 0)
    .map((z) => ({
      wareId: z.wareId,
      lagerortId: z.lagerortId,
      gebindeId: z.gebindeId,
      mhd: z.mhd,
      menge: z.differenz,
      art: 'korrektur' as const,
    }));
}
