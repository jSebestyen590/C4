import { z } from 'zod';
import {
  anzahlSchema,
  beschreibung,
  eindeutig,
  idSchema,
  kommentarSchema,
  name,
  parentIdSchema,
  zeitpunktSchema,
} from './bausteine';
import { datumSchema } from './schemas';

export const MHD_ARTEN = ['keins', 'tag', 'monat'] as const;
export type MhdArt = (typeof MHD_ARTEN)[number];

export const BUCHUNGS_ARTEN = ['zugang', 'abgang', 'anbruch', 'korrektur', 'umlagerung'] as const;
export type BuchungsArt = (typeof BUCHUNGS_ARTEN)[number];

const ANZEIGE_ART: Record<BuchungsArt, number> = {
  anbruch: 0,
  zugang: 1,
  abgang: 2,
  umlagerung: 3,
  korrektur: 4,
};

/** Display order of booking lines in one Vorgang: Anbruch (Obergebinde −, then +), Zugang, Abgang, Umlagerung, Korrektur. */
export function vergleicheBuchungsZeilen(
  a: { art: BuchungsArt; menge: number },
  b: { art: BuchungsArt; menge: number },
): number {
  return (
    ANZEIGE_ART[a.art] - ANZEIGE_ART[b.art] ||
    (a.art === 'anbruch' ? Math.sign(a.menge) - Math.sign(b.menge) : 0)
  );
}

export const VORGANG_TYPEN = ['einlagerung', 'entnahme', 'umlagerung', 'inventur'] as const;
export type VorgangTyp = (typeof VORGANG_TYPEN)[number];

export const QUELLEN = ['manuell', 'inventur'] as const;
export type Quelle = (typeof QUELLEN)[number];

export const EINHEITEN = ['l', 'kg', 'stk'] as const;
export type Einheit = (typeof EINHEITEN)[number];
export const EINHEIT_LABELS: Record<Einheit, string> = {
  l: 'l',
  kg: 'kg',
  stk: 'Stk',
};

export const VERPACKUNGSEINHEITEN = [
  'flasche',
  'dose',
  'tetrapak',
  'kasten',
  'kolli',
  'fass',
  'packung',
] as const;
export type Verpackungseinheit = (typeof VERPACKUNGSEINHEITEN)[number];
/** Singular and plural of a Verpackungseinheit; the form follows the amount (see `gebindeKurz`). */
export const VERPACKUNGSEINHEIT_LABELS: Record<
  Verpackungseinheit,
  { einzahl: string; mehrzahl: string }
> = {
  flasche: { einzahl: 'Flasche', mehrzahl: 'Flaschen' },
  dose: { einzahl: 'Dose', mehrzahl: 'Dosen' },
  tetrapak: { einzahl: 'TetraPak', mehrzahl: 'TetraPaks' },
  kasten: { einzahl: 'Kasten', mehrzahl: 'Kästen' },
  kolli: { einzahl: 'Kolli', mehrzahl: 'Kollis' },
  fass: { einzahl: 'Fass', mehrzahl: 'Fässer' },
  packung: { einzahl: 'Packung', mehrzahl: 'Packungen' },
};

/**
 * Packaging unit. A Basisgebinde has `menge` + `einheit` (e.g. 0,5 l); an Obergebinde has no
 * content of its own but contains `unterAnzahl` of its `unterGebindeId`. Both have a
 * `verpackungseinheit` and an optional deposit (`null` = kein Pfand).
 */
export interface Gebinde {
  id: string;
  menge: number | null;
  einheit: Einheit | null;
  verpackungseinheit: Verpackungseinheit;
  pfandCent: number | null;
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

const mhdSchema = datumSchema.nullish().transform((v) => v ?? null);

/** Special kinds of Lagerort; null (no `art`) is a normal Lagerort. */
export const LAGERORT_ARTEN = ['regal', 'regalboden'] as const;
export type LagerortArt = (typeof LAGERORT_ARTEN)[number];

/** German labels of the kinds; a normal Lagerort has no `art` and uses the key `normal`. */
export const LAGERORT_ART_LABELS: Record<LagerortArt | 'normal', string> = {
  normal: 'Lagerort',
  regal: 'Regal',
  regalboden: 'Regalboden',
};

export const MAX_BOEDEN = 50;

const bodenNamenSchema = z
  .array(name('einen Namen für den Regalboden'))
  .min(1, 'Gib mindestens einen Regalboden an.')
  .max(MAX_BOEDEN, `Höchstens ${MAX_BOEDEN} Regalböden erlaubt.`)
  .refine(
    (namen) => eindeutig(namen.map((n) => n.toLowerCase())),
    'Jeder Regalboden darf nur einmal vorkommen.',
  );

export const lagerortSchema = z.object({
  name: name(),
  beschreibung,
  parentId: parentIdSchema,
  /** On update: undefined keeps the kind. On create: null/undefined = normal Lagerort. */
  art: z.enum(LAGERORT_ARTEN, 'Ungültige Art.').nullish(),
});
export type LagerortEingabe = z.input<typeof lagerortSchema>;

/** Create: a Regal comes with its Regalböden (`boeden`), nothing else may bring them. */
export const lagerortAnlegenSchema = lagerortSchema
  .extend({ boeden: bodenNamenSchema.optional() })
  .refine((l) => (l.art === 'regal') === (l.boeden !== undefined), {
    message: 'Ein Regal braucht Regalböden, andere Lagerorte nicht.',
    path: ['boeden'],
  });
export type LagerortAnlegenEingabe = z.input<typeof lagerortAnlegenSchema>;

export const boedenHinzufuegenSchema = z.object({ namen: bodenNamenSchema });

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

const nullish = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => v ?? null);

export const gebindeSchema = z
  .object({
    menge: nullish(
      z
        .number('Bitte gib eine Menge an.')
        .positive('Die Menge muss größer als 0 sein.')
        .max(1_000_000, 'Die Menge ist zu groß.')
        .refine((v) => Math.round(v * 1000) / 1000 === v, 'Höchstens 3 Nachkommastellen erlaubt.'),
    ),
    einheit: nullish(z.enum(EINHEITEN, 'Ungültige Einheit.')),
    verpackungseinheit: z.enum(VERPACKUNGSEINHEITEN, 'Bitte wähle eine Verpackungseinheit.'),
    pfandCent: nullish(
      z
        .number('Bitte gib das Pfand an.')
        .int('Das Pfand muss in ganzen Cent angegeben werden.')
        .min(0, 'Das Pfand darf nicht negativ sein.'),
    ),
    unterGebindeId: parentIdSchema,
    unterAnzahl: nullish(
      z
        .number('Bitte gib eine Anzahl an.')
        .int('Die Anzahl muss eine ganze Zahl sein.')
        .min(2, 'Die Anzahl muss mindestens 2 sein.'),
    ),
  })
  .superRefine((g, ctx) => {
    const fehler = gebindeKombinationFehler(g);
    if (fehler) ctx.addIssue({ code: 'custom', message: fehler.message, path: [fehler.feld] });
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

const wareIdSchema = idSchema('Bitte wähle eine Ware.');
const lagerortIdSchema = idSchema('Bitte wähle einen Lagerort.');
const gebindeIdSchema = idSchema('Bitte wähle ein Gebinde.');
const positionen = <T extends z.ZodType>(position: T) =>
  z.array(position).min(1, 'Bitte gib mindestens eine Position an.');

export const einlagerungenSchema = z.object({
  zeitpunkt: zeitpunktSchema,
  kommentar: kommentarSchema,
  positionen: positionen(
    z.object({
      wareId: wareIdSchema,
      lagerortId: lagerortIdSchema,
      gebindeId: gebindeIdSchema,
      mhd: mhdSchema,
      anzahl: anzahlSchema,
    }),
  ),
});
export type EinlagerungenEingabe = z.input<typeof einlagerungenSchema>;

export const entnahmenSchema = z.object({
  zeitpunkt: zeitpunktSchema,
  kommentar: kommentarSchema,
  positionen: positionen(
    z.object({
      wareId: wareIdSchema,
      lagerortId: lagerortIdSchema,
      gebindeId: gebindeIdSchema,
      anzahl: anzahlSchema,
    }),
  ),
  /** Refill the withdrawn amounts of `lagerortId` from `quelleId` (an Umlagerung). */
  nachfuellen: z
    .array(
      z
        .object({ lagerortId: lagerortIdSchema, quelleId: idSchema('Bitte wähle eine Quelle.') })
        .refine((n) => n.lagerortId !== n.quelleId, 'Die Quelle muss ein anderer Platz sein.'),
    )
    .default([])
    .refine(
      (liste) => eindeutig(liste.map((n) => n.lagerortId)),
      'Jeder Platz darf nur einmal nachgefüllt werden.',
    ),
});
export type EntnahmenEingabe = z.input<typeof entnahmenSchema>;

export const umlagerungenSchema = z.object({
  zeitpunkt: zeitpunktSchema,
  kommentar: kommentarSchema,
  positionen: positionen(
    z
      .object({
        wareId: wareIdSchema,
        gebindeId: gebindeIdSchema,
        anzahl: anzahlSchema,
        vonId: idSchema('Bitte wähle den Quellplatz.'),
        nachId: idSchema('Bitte wähle den Zielplatz.'),
      })
      .refine((p) => p.vonId !== p.nachId, 'Quelle und Ziel müssen verschieden sein.'),
  ),
});
export type UmlagerungenEingabe = z.input<typeof umlagerungenSchema>;

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

export const inventurStartenSchema = z.object({
  lagerortId: idSchema('Bitte wähle einen Lagerort.'),
});

export const inventurAbschlussSchema = z.object({ zeitpunkt: zeitpunktSchema });

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

/** A tree node with its Lagerort kind (null = normal Lagerort). */
export interface ArtKnoten extends BaumKnoten {
  art: LagerortArt | null;
}

/**
 * German error unless a node of kind `art` may sit below `parent` (null = top level), otherwise
 * null: a Regal only holds Regalböden, a Regalboden belongs to a Regal and has no children, a Regal
 * sits on the top level or below a normal Lagerort.
 */
export function lagerortArtFehler(
  art: LagerortArt | null,
  parent: Pick<ArtKnoten, 'art'> | null,
): string | null {
  const elternArt = parent?.art ?? null;
  if (elternArt === 'regalboden') return 'Ein Regalboden kann keine Unterebenen haben.';
  if (elternArt === 'regal') {
    return art === 'regalboden' ? null : 'Unter einem Regal sind nur Regalböden erlaubt.';
  }
  if (art === 'regalboden') return 'Ein Regalboden gehört in ein Regal.';
  return null;
}

/**
 * German error unless the kind of `knoten` may change to `neu` (checked against the tree `alle`),
 * otherwise null. Normal -> Regal needs children without children of their own; a Regalboden
 * keeps its kind.
 */
export function lagerortArtAenderungFehler(
  knoten: ArtKnoten,
  neu: LagerortArt | null,
  alle: ArtKnoten[],
): string | null {
  if (neu === knoten.art) return null;
  if (knoten.art === 'regalboden') return 'Die Art eines Regalbodens lässt sich nicht ändern.';
  if (neu === 'regalboden') return 'Ein Regalboden entsteht nur in einem Regal.';
  if (neu === 'regal') {
    const kinder = alle.filter((n) => n.parentId === knoten.id);
    if (kinder.some((k) => alle.some((n) => n.parentId === k.id))) {
      return 'Ein Regal besteht nur aus Regalböden: Die Unterebenen dürfen keine eigenen Unterebenen haben.';
    }
  }
  return null;
}

/** Kind the children of a node get when its kind changes from `bisher` to `neu`, or undefined if unchanged. */
export function kinderArtNach(
  bisher: LagerortArt | null,
  neu: LagerortArt | null,
): LagerortArt | null | undefined {
  if (bisher === neu) return undefined;
  if (neu === 'regal') return 'regalboden';
  if (bisher === 'regal') return null;
  return undefined;
}

/**
 * Names of the Regalböden of `reihen` rows with `plaetze` places each, row by row (r=1 p=1..P,
 * r=2 ...). In `muster` `{r}` is the row, `{p}` the place in the row and `{n}` the running number
 * over all (starting at `start`). A pattern without any placeholder gets ` {n}` appended.
 */
export function bodenNamen(
  muster: string,
  reihen: number,
  plaetze: number,
  start: number,
): string[] {
  const hatPlatzhalter = /\{[rpn]\}/.test(muster);
  const vorlage = hatPlatzhalter ? muster : `${muster.trimEnd()} {n}`;
  const namen: string[] = [];
  for (let r = 1; r <= Math.max(0, reihen); r++) {
    for (let p = 1; p <= Math.max(0, plaetze); p++) {
      namen.push(
        vorlage
          .replaceAll('{r}', String(r))
          .replaceAll('{p}', String(p))
          .replaceAll('{n}', String(start + namen.length))
          .trim(),
      );
    }
  }
  return namen;
}

/**
 * German error per name (null = fine): empty, or already taken (case-insensitive) by an earlier
 * name of the list or by one of the `vorhanden` names.
 */
export function bodenNamenFehler(namen: string[], vorhanden: string[]): (string | null)[] {
  const vergeben = new Set(vorhanden.map((n) => n.trim().toLowerCase()));
  return namen.map((n) => {
    const key = n.trim().toLowerCase();
    if (key === '') return 'Bitte gib einen Namen ein.';
    if (vergeben.has(key)) return 'Diesen Namen gibt es schon im Regal.';
    vergeben.add(key);
    return null;
  });
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

/** The attributes that define a Gebinde (everything but id and archive flag). */
export type GebindeDaten = Omit<Gebinde, 'id'>;

const gebindeIndex = (alle: Gebinde[]) => new Map(alle.map((g) => [g.id, g]));

const istOber = (g: Pick<Gebinde, 'unterGebindeId'>) => g.unterGebindeId !== null;

/** `0.5` -> `0,5`, `1` -> `1`, `1000.25` -> `1.000,25`; at most 3 decimals. */
export function mengeAnzeigen(menge: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(menge);
}

/** Deposit of the Gebinde including the contained Untergebinde; null if there is no deposit at all. */
export function pfandGesamtCent(gebinde: Gebinde, alle: Gebinde[]): number | null {
  const unter = gebinde.unterGebindeId ? gebindeIndex(alle).get(gebinde.unterGebindeId) : undefined;
  if (gebinde.pfandCent === null && (unter?.pfandCent ?? null) === null) return null;
  return (
    (gebinde.pfandCent ?? 0) + (unter ? (gebinde.unterAnzahl ?? 0) * (unter.pfandCent ?? 0) : 0)
  );
}

/** `310` -> `3,10 €` */
export function centAnzeigen(cent: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    .format(cent / 100)
    .replaceAll(String.fromCharCode(160), ' ');
}

/** `0,5l`, `0,33l`, `6 Stk`; empty for an Obergebinde. */
export function inhaltAnzeigen(g: Pick<Gebinde, 'menge' | 'einheit'>): string {
  if (g.menge === null || g.einheit === null) return '';
  return `${mengeAnzeigen(g.menge)}${g.einheit === 'stk' ? ' ' : ''}${EINHEIT_LABELS[g.einheit]}`;
}

/**
 * Short name used where space is tight: the Verpackungseinheit (`Flasche`, `Kasten`). Singular when
 * `menge` is ±1 or not given, plural otherwise (also for 0).
 */
export function gebindeKurz(g: Pick<Gebinde, 'verpackungseinheit'>, menge?: number): string {
  const l = VERPACKUNGSEINHEIT_LABELS[g.verpackungseinheit];
  return menge === undefined || Math.abs(menge) === 1 ? l.einzahl : l.mehrzahl;
}

/** Plural short name for column captions (`Kästen`, `Flaschen`). */
export function gebindeKurzMehrzahl(g: Pick<Gebinde, 'verpackungseinheit'>): string {
  return VERPACKUNGSEINHEIT_LABELS[g.verpackungseinheit].mehrzahl;
}

function basisBezeichnung(g: Gebinde, pfand: boolean): string {
  const text = `${inhaltAnzeigen(g)} ${gebindeKurz(g)}`.trim();
  return pfand && g.pfandCent !== null ? `${text} ${centAnzeigen(g.pfandCent)}` : text;
}

/**
 * Full name: `0,5l Flasche 0,08 €`, `1l Packung`, `20 x 0,5l Flasche 3,10 €`. An Obergebinde is
 * described by its content and the aggregated deposit; its own Verpackungseinheit is not part of it.
 */
export function gebindeBezeichnung(g: Gebinde, alle: Gebinde[]): string {
  if (!istOber(g)) return basisBezeichnung(g, true);
  const unter = gebindeIndex(alle).get(g.unterGebindeId!);
  const text = `${g.unterAnzahl} x ${unter ? basisBezeichnung(unter, false) : '?'}`;
  const pfand = pfandGesamtCent(g, alle);
  return pfand === null ? text : `${text} ${centAnzeigen(pfand)}`;
}

/** Orders Basisgebinde (Verpackung, Einheit, Menge, Pfand) before Obergebinde (content, count, Verpackung). */
export function vergleicheGebinde(a: Gebinde, b: Gebinde, alle: Gebinde[]): number {
  const index = gebindeIndex(alle);
  const basis = (g: Gebinde) => (istOber(g) ? (index.get(g.unterGebindeId!) ?? g) : g);
  const verpackung = (g: Gebinde) => VERPACKUNGSEINHEITEN.indexOf(g.verpackungseinheit);
  const einheit = (g: Gebinde) => (g.einheit === null ? -1 : EINHEITEN.indexOf(g.einheit));
  return (
    Number(istOber(a)) - Number(istOber(b)) ||
    (istOber(a)
      ? verpackung(basis(a)) - verpackung(basis(b)) ||
        einheit(basis(a)) - einheit(basis(b)) ||
        (basis(a).menge ?? 0) - (basis(b).menge ?? 0) ||
        (a.unterAnzahl ?? 0) - (b.unterAnzahl ?? 0) ||
        verpackung(a) - verpackung(b)
      : verpackung(a) - verpackung(b) ||
        einheit(a) - einheit(b) ||
        (a.menge ?? 0) - (b.menge ?? 0)) ||
    (a.pfandCent ?? -1) - (b.pfandCent ?? -1) ||
    a.id.localeCompare(b.id)
  );
}

/** Basisgebinde first, then Obergebinde; see `vergleicheGebinde`. */
export function gebindeSortieren<T extends Gebinde>(liste: T[], alle: Gebinde[] = liste): T[] {
  return [...liste].sort((a, b) => vergleicheGebinde(a, b, alle));
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

/**
 * `9 Kästen, 13 Flaschen` (`1 Kasten`); Obergebinde first, zero amounts skipped. Short names that
 * occur more than once in the list are replaced by `2 × <full Bezeichnung>` so they stay distinguishable.
 */
export function bestandAnzeigen(
  mengen: { gebindeId: string; menge: number }[],
  alle: Gebinde[],
): string {
  const index = gebindeIndex(alle);
  const summen = new Map<string, number>();
  for (const m of mengen) summen.set(m.gebindeId, (summen.get(m.gebindeId) ?? 0) + m.menge);
  const eintraege = [...summen]
    .filter(([, menge]) => menge !== 0)
    .map(([id, menge]) => {
      const g = index.get(id);
      return {
        g,
        menge,
        kurz: g ? gebindeKurz(g) : id,
        kurzMenge: g ? gebindeKurz(g, menge) : id,
        lang: g ? gebindeBezeichnung(g, alle) : id,
      };
    })
    .sort(
      (a, b) =>
        Number(!!b.g?.unterGebindeId) - Number(!!a.g?.unterGebindeId) ||
        (a.g && b.g ? vergleicheGebinde(a.g, b.g, alle) : a.lang.localeCompare(b.lang, 'de')),
    );
  const kurzAnzahl = new Map<string, number>();
  for (const e of eintraege) kurzAnzahl.set(e.kurz, (kurzAnzahl.get(e.kurz) ?? 0) + 1);
  const teile = eintraege.map((e) =>
    (kurzAnzahl.get(e.kurz) ?? 0) > 1 ? `${e.menge} × ${e.lang}` : `${e.menge} ${e.kurzMenge}`,
  );
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

type GebindeKombination = Pick<
  GebindeDaten,
  'menge' | 'einheit' | 'unterGebindeId' | 'unterAnzahl'
>;

/** Checks that a Gebinde is either a complete Basisgebinde or a complete Obergebinde. */
export function gebindeKombinationFehler(
  g: GebindeKombination,
): { feld: keyof GebindeKombination; message: string } | null {
  if (g.unterGebindeId === null) {
    if (g.unterAnzahl !== null) {
      return { feld: 'unterAnzahl', message: 'Ein Einzelgebinde hat keine Untergebinde.' };
    }
    if (g.menge === null) return { feld: 'menge', message: 'Bitte gib eine Menge an.' };
    if (g.einheit === null) return { feld: 'einheit', message: 'Bitte wähle eine Einheit.' };
    return null;
  }
  if (g.unterAnzahl === null) {
    return { feld: 'unterAnzahl', message: 'Bitte gib an, wie viele Untergebinde enthalten sind.' };
  }
  if (g.menge !== null || g.einheit !== null) {
    return { feld: 'menge', message: 'Ein Gebinde mit Untergebinden hat keine eigene Menge.' };
  }
  return null;
}

/** German error message if the Gebinde may not be saved in this form, otherwise null. */
export function gebindeFehler(
  neu: GebindeKombination & { id?: string },
  alle: Gebinde[],
): string | null {
  const kombination = gebindeKombinationFehler(neu);
  if (kombination) return kombination.message;
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

/** The existing Gebinde with identical attributes (incl. deposit), ignoring `ignoriereId`. */
export function gebindeDoppelt(
  neu: GebindeDaten,
  alle: Gebinde[],
  ignoriereId?: string,
): Gebinde | undefined {
  return alle.find(
    (g) =>
      g.id !== ignoriereId &&
      g.menge === neu.menge &&
      g.einheit === neu.einheit &&
      g.verpackungseinheit === neu.verpackungseinheit &&
      g.pfandCent === neu.pfandCent &&
      g.unterGebindeId === neu.unterGebindeId &&
      g.unterAnzahl === neu.unterAnzahl,
  );
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

/**
 * Plans moving `anzahl` of a Gebinde from the node `vonId` to `nachId`, FIFO at the source only
 * (not its subtree). Withdrawn lines become negative `umlagerung` lines at the source with a mirrored
 * positive line (same Gebinde and MHD) at the target; `anbruch` lines stay at the source. Missing stock
 * goes negative at the source (MHD null) and is mirrored the same way.
 */
export function umlagerungPlanen(eingabe: {
  /** Stock of ONE ware; only the postings AT `vonId` are used. */
  posten: FifoPosten[];
  gebinde: Gebinde[];
  gebindeId: string;
  anzahl: number;
  vonId: string;
  nachId: string;
}): Buchungszeile[] {
  const { vonId, nachId } = eingabe;
  const geplant = entnahmePlanen({
    posten: eingabe.posten.filter((p) => p.lagerortId === vonId),
    gebinde: eingabe.gebinde,
    gebindeId: eingabe.gebindeId,
    anzahl: eingabe.anzahl,
    lagerortId: vonId,
  });
  const zeilen: Buchungszeile[] = [];
  for (const z of geplant) {
    if (z.art === 'abgang') {
      zeilen.push({ ...z, art: 'umlagerung' });
      zeilen.push({ ...z, lagerortId: nachId, menge: -z.menge, art: 'umlagerung' });
    } else {
      zeilen.push(z);
    }
  }
  return zusammenfassen(zeilen);
}

/**
 * Applies planned lines to a stock list (for planning several positions of one request one after
 * the other). Returns a new list; zero rows are dropped, new keys get `zeitpunkt` as arrival time.
 */
export function postenFortschreiben(
  posten: FifoPosten[],
  zeilen: Buchungszeile[],
  zeitpunkt: string,
): FifoPosten[] {
  const key = (p: Pick<FifoPosten, 'lagerortId' | 'gebindeId' | 'mhd'>) =>
    schluessel(p.lagerortId, p.gebindeId, p.mhd);
  const map = new Map<string, FifoPosten>();
  for (const p of posten) {
    map.set(key(p), {
      lagerortId: p.lagerortId,
      gebindeId: p.gebindeId,
      mhd: p.mhd,
      menge: p.menge,
      ersterZugang: p.ersterZugang,
    });
  }
  for (const z of zeilen) {
    const vorhanden = map.get(key(z));
    if (vorhanden) {
      // Stock that was empty or negative starts a new arrival.
      if (z.menge > 0 && vorhanden.menge <= 0) vorhanden.ersterZugang = zeitpunkt;
      vorhanden.menge += z.menge;
    } else {
      map.set(key(z), {
        lagerortId: z.lagerortId,
        gebindeId: z.gebindeId,
        mhd: z.mhd,
        menge: z.menge,
        ersterZugang: zeitpunkt,
      });
    }
  }
  return [...map.values()].filter((p) => p.menge !== 0);
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

/**
 * Compares counted stock with the expected stock on the given nodes; one row per key.
 * A Soll key without a counted value is taken as correct (ist = soll); only stored counts differ.
 */
export function inventurAbgleich(
  soll: Bestandsposten[],
  ist: InventurIst[],
  knotenIds: string[],
): InventurZeile[] {
  const knoten = new Set(knotenIds);
  const zeilen = new Map<string, InventurZeile & { gezaehlt: boolean }>();
  const zeile = (k: Pick<InventurZeile, 'lagerortId' | 'wareId' | 'gebindeId' | 'mhd'>) => {
    const key = schluessel(k.lagerortId, k.wareId, k.gebindeId, k.mhd);
    let z = zeilen.get(key);
    if (!z) {
      z = { ...k, soll: 0, ist: 0, differenz: 0, gezaehlt: false };
      zeilen.set(key, z);
    }
    return z;
  };
  for (const p of soll) {
    if (knoten.has(p.lagerortId)) zeile(p).soll += p.menge;
  }
  for (const i of ist) {
    const z = zeile({
      lagerortId: i.lagerortId,
      wareId: i.wareId,
      gebindeId: i.gebindeId,
      mhd: i.mhd,
    });
    z.ist += i.anzahl;
    z.gezaehlt = true;
  }
  return [...zeilen.values()]
    .map(({ gezaehlt, ...z }) => {
      const ist = gezaehlt ? z.ist : z.soll;
      return { ...z, ist, differenz: ist - z.soll };
    })
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
