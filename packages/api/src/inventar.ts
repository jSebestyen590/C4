import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  ausleihFehler,
  bestandZu,
  ifcoPlatzHatWareFehler,
  ausleiheTage,
  gefaehrdungen,
  ganzeIfcoFehler,
  istVorgemerkt,
  type Anrede,
  type IfcoMass,
  type MitgliedStatus,
  ausleiheStatus,
  offenAufteilen,
  platzKey,
  platzText,
  teilbaumIds,
  verliehenFehler,
  verliehenJePlatz,
  zielKey,
  type AusleiheStatus,
  type Beschriftung,
  type Gefaehrdung,
  type OffenePosition,
  type PlatzMenge,
  type PlatzZiel,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  ausleihen,
  ausleihePositionen,
  bestandsbuchungen,
  gegenstaende,
  gegenstandPlaetze,
  ifcos,
  inventarKategorien,
  ifcoTypen,
  lagerorte,
  mitglieder,
  type IfcoTypRow,
  type AusleihePositionRow,
  type AusleiheRow,
  type GegenstandRow,
  type IfcoRow,
  type InventarKategorieRow,
} from './db/schema';
import { ifcoPlatzMasse, ifcoPlatzPruefen } from './ifcoPlatz';
import {
  elternFehler,
  blockiertVon,
  buchungenLaden,
  gibtEs,
  offenLaden,
  sortiert,
  verwendetMeldung,
  WarenKonflikt,
  WarenUngueltig,
  zyklusFehler,
  type Q,
} from './waren';

// ---------------------------------------------------------------------------
// Types

export interface KategorieDaten {
  name: string;
  parentId: string | null;
}

export interface GegenstandDaten {
  name: string;
  beschreibung: string | null;
  kategorieId: string;
  anzahl: number;
}

export interface IfcoDaten {
  name: string;
  beschreibung: string | null;
  lagerortId: string | null;
  /** IFCO type; required on an IFCO-Lagerplatz. */
  typId: string | null;
}

export interface IfcoTypDaten extends IfcoMass {
  name: string;
}

/** `anzahl` pieces at a place: exactly one of `lagerortId` and `ifcoId` is set. */
export interface PlatzDaten extends PlatzZiel {
  anzahl: number;
}

export interface GegenstandAnlegenDaten extends GegenstandDaten {
  /** Optional first place of the new Gegenstand. */
  platz: PlatzDaten | null;
}

export interface AusleihePositionDaten extends PlatzDaten {
  gegenstandId: string;
  /** Part of lending a whole IFCO (needs `ifcoId`). */
  ganzeIfco?: true;
}

export interface AusleiheKopfDaten {
  an: string;
  /** Cognito sub of the organising Mitglied. */
  organisiertVon: string;
  /** ISO timestamp. */
  ausgeliehenAm: string;
  /** Required day (`YYYY-MM-DD`) the pieces come back; that day itself is free again. */
  rueckgabeGeplant: string;
  kommentar: string | null;
}

export interface AusleiheDaten extends AusleiheKopfDaten {
  positionen: AusleihePositionDaten[];
}

/**
 * An assignment of a Gegenstand to a place; `verliehen` is the open amount that is away now,
 * `vorgemerkt` the open amount of Ausleihen that start in the future (still reserved).
 */
export interface PlatzDetails extends PlatzDaten {
  id: string;
  verliehen: number;
  vorgemerkt: number;
}

export interface GegenstandDetails extends GegenstandRow {
  plaetze: PlatzDetails[];
  /** Total open amount that is away now, over all places. */
  verliehen: number;
  /** Total open amount of Ausleihen starting in the future. */
  vorgemerkt: number;
}

/** The open Ausleihe that lends a whole IFCO (`geplant` = starts in the future). */
export interface IfcoAusleihe {
  id: string;
  an: string;
  status: 'geplant' | 'verliehen';
  ausgeliehenAm: Date;
}

export interface IfcoDetails extends IfcoRow {
  inhalt: { gegenstandId: string; anzahl: number }[];
  /** Open whole-IFCO Ausleihe (the one away now first), or null. */
  ausleihe: IfcoAusleihe | null;
}

/** The Mitglied who organised an Ausleihe. */
export interface Organisator {
  sub: string;
  /** Cognito username; the store leaves it null, the route fills it in. */
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
  anrede: Anrede;
}

export interface AusleiheDetails extends AusleiheRow {
  /** True when every Position was returned. */
  erledigt: boolean;
  /** `erledigt`, `geplant` (starts in the future) or `verliehen`. */
  status: AusleiheStatus;
  positionen: AusleihePositionRow[];
  /**
   * Overdue open Ausleihen that endanger this not yet started one ("gefährdet"): it would no longer
   * fit if their pieces never came back. Empty otherwise.
   */
  gefaehrdetDurch: Gefaehrdung[];
  /** Organising Mitglied (`erstelltVon` as fallback); null if neither is a known Mitglied. */
  organisator: Organisator | null;
}

/**
 * Like `WarenStore`: the mutations return false (or undefined) when the entry itself does not
 * exist, and throw `WarenUngueltig` / `WarenKonflikt` for the domain rules.
 */
export interface InventarStore {
  // Kategorien
  kategorien(mitArchiv: boolean): Promise<InventarKategorieRow[]>;
  kategorieAnlegen(daten: KategorieDaten): Promise<string>;
  kategorieAktualisieren(id: string, daten: KategorieDaten): Promise<boolean>;
  kategorieLoeschen(id: string): Promise<boolean>;
  /** Archives (or restores) the whole subtree. */
  kategorieArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  // Gegenstände
  gegenstaende(mitArchiv: boolean): Promise<GegenstandDetails[]>;
  gegenstandHolen(id: string): Promise<GegenstandDetails | undefined>;
  gegenstandAnlegen(daten: GegenstandAnlegenDaten): Promise<string>;
  gegenstandAktualisieren(id: string, daten: GegenstandDaten): Promise<boolean>;
  gegenstandLoeschen(id: string): Promise<boolean>;
  gegenstandArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  /** Replaces all Plätze of the Gegenstand. */
  gegenstandPlaetzeSetzen(id: string, plaetze: PlatzDaten[]): Promise<boolean>;
  // IFCO-Typen
  ifcoTypen(mitArchiv: boolean): Promise<IfcoTypRow[]>;
  ifcoTypAnlegen(daten: IfcoTypDaten): Promise<string>;
  /** Changing footprint or height needs every IFCO-Lagerplatz with IFCOs of this type to still fit. */
  ifcoTypAktualisieren(id: string, daten: IfcoTypDaten): Promise<boolean>;
  ifcoTypLoeschen(id: string): Promise<boolean>;
  ifcoTypArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  // IFCOs
  ifcos(mitArchiv: boolean): Promise<IfcoDetails[]>;
  ifcoHolen(id: string): Promise<IfcoDetails | undefined>;
  ifcoAnlegen(daten: IfcoDaten): Promise<string>;
  ifcoAktualisieren(id: string, daten: IfcoDaten): Promise<boolean>;
  ifcoLoeschen(id: string): Promise<boolean>;
  /** Archiving needs an empty IFCO without open Ausleihe. */
  ifcoArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  ifcoPlatzSetzen(id: string, lagerortId: string | null): Promise<boolean>;
  /** Replaces all assignments with `ifco_id = id`. */
  ifcoInhaltSetzen(
    id: string,
    positionen: { gegenstandId: string; anzahl: number }[],
  ): Promise<boolean>;
  // Ausleihen
  ausleihen(nurOffen: boolean): Promise<AusleiheDetails[]>;
  ausleiheHolen(id: string): Promise<AusleiheDetails | undefined>;
  ausleiheAnlegen(daten: AusleiheDaten, sub: string): Promise<string>;
  ausleiheAktualisieren(id: string, daten: AusleiheKopfDaten): Promise<boolean>;
  ausleiheRueckgabe(id: string, positionIds: string[], zurueckAm: string): Promise<boolean>;
  ausleiheLoeschen(id: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in inventar.test.ts)

/** Plätze with the open amounts of their place (away now / reserved), plus the totals of the Gegenstand. */
export function gegenstandDetails(
  g: GegenstandRow,
  plaetze: { id: string; lagerortId: string | null; ifcoId: string | null; anzahl: number }[],
  offen: OffenePosition[],
  jetzt: Date = new Date(),
): GegenstandDetails {
  const eigene = offen.filter((o) => o.gegenstandId === g.id);
  const teile = offenAufteilen(eigene, jetzt);
  const verliehen = verliehenJePlatz(teile.verliehen);
  const vorgemerkt = verliehenJePlatz(teile.vorgemerkt);
  const mitMengen = plaetze.map(({ id, lagerortId, ifcoId, anzahl }) => {
    const key = platzKey({ gegenstandId: g.id, lagerortId, ifcoId });
    return {
      id,
      lagerortId,
      ifcoId,
      anzahl,
      verliehen: verliehen.get(key) ?? 0,
      vorgemerkt: vorgemerkt.get(key) ?? 0,
    };
  });
  return {
    ...g,
    plaetze: mitMengen,
    verliehen: mitMengen.reduce((s, p) => s + p.verliehen, 0),
    vorgemerkt: mitMengen.reduce((s, p) => s + p.vorgemerkt, 0),
  };
}

/** German error for a place that does not exist or is archived (unless it was already used), else null. */
export function zielFehler(
  ziele: PlatzZiel[],
  lagerorteVorhanden: { id: string; archiviert: boolean }[],
  ifcosVorhanden: { id: string; archiviert: boolean }[],
  bisher: PlatzZiel[] = [],
): string | null {
  const alt = new Set(bisher.map(zielKey));
  for (const z of ziele) {
    const istLagerort = z.lagerortId !== null;
    const gefunden = (istLagerort ? lagerorteVorhanden : ifcosVorhanden).find(
      (x) => x.id === (z.lagerortId ?? z.ifcoId),
    );
    if (!gefunden)
      return istLagerort ? 'Der Lagerort existiert nicht.' : 'Die IFCO existiert nicht.';
    if (gefunden.archiviert && !alt.has(zielKey(z))) {
      return istLagerort ? 'Der Lagerort ist archiviert.' : 'Die IFCO ist archiviert.';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Store

const inListe = <T>(spalte: Parameters<typeof inArray>[0], werte: T[]) =>
  inArray(spalte, werte as never[]);

/** Names for error messages. */
async function beschriftungLaden(q: Q): Promise<Beschriftung> {
  const [orte, kisten, dinge] = await Promise.all([
    q.select().from(lagerorte),
    q.select().from(ifcos),
    q.select().from(gegenstaende),
  ]);
  return {
    gegenstand: (id) => dinge.find((g) => g.id === id)?.name ?? id,
    platz: (ziel) => platzText(orte, kisten, ziel),
  };
}

/** Runs `pruefen` without names first and again with names only when it reports an error. */
async function fehlerMitNamen(
  q: Q,
  pruefen: (beschriftung?: Beschriftung) => string | null,
): Promise<string | null> {
  if (!pruefen()) return null;
  return pruefen(await beschriftungLaden(q));
}

/** Throws `WarenUngueltig` unless every place exists and is usable (archived ones only if in `bisher`). */
async function zieleExistieren(q: Q, ziele: PlatzZiel[], bisher: PlatzZiel[] = []): Promise<void> {
  const lagerortIds = ziele.flatMap((z) => (z.lagerortId !== null ? [z.lagerortId] : []));
  const ifcoIds = ziele.flatMap((z) => (z.ifcoId !== null ? [z.ifcoId] : []));
  const orte = lagerortIds.length
    ? await q.select().from(lagerorte).where(inListe(lagerorte.id, lagerortIds))
    : [];
  const kisten = ifcoIds.length
    ? await q.select().from(ifcos).where(inListe(ifcos.id, ifcoIds))
    : [];
  const fehler = zielFehler(ziele, orte, kisten, bisher);
  if (fehler) throw new WarenUngueltig(fehler);
}

const alsMenge = (gegenstandId: string, p: PlatzDaten): PlatzMenge => ({
  gegenstandId,
  lagerortId: p.lagerortId,
  ifcoId: p.ifcoId,
  anzahl: p.anzahl,
});

async function kategorieMussNutzbarSein(q: Q, id: string): Promise<void> {
  const [k] = await q.select().from(inventarKategorien).where(eq(inventarKategorien.id, id));
  if (!k) throw new WarenUngueltig('Die Kategorie existiert nicht.');
  if (k.archiviert) throw new WarenUngueltig('Die Kategorie ist archiviert.');
}

async function typMussNutzbarSein(q: Q, id: string): Promise<void> {
  const [t] = await q.select().from(ifcoTypen).where(eq(ifcoTypen.id, id));
  if (!t) throw new WarenUngueltig('Der IFCO-Typ existiert nicht.');
  if (t.archiviert) throw new WarenUngueltig('Der IFCO-Typ ist archiviert.');
}

/**
 * Throws `WarenUngueltig` when the target place is an IFCO-Lagerplatz the IFCO (with `typId`) does
 * not fit on next to what already stands there. `ifcoId` is null for a new IFCO.
 */
async function passtAufPlatz(
  q: Q,
  ifcoId: string | null,
  name: string,
  typId: string | null,
  lagerortId: string | null,
): Promise<void> {
  if (lagerortId === null) return;
  const [ort] = await q.select().from(lagerorte).where(eq(lagerorte.id, lagerortId));
  const masse = ort && ifcoPlatzMasse(ort);
  if (!ort || !masse) return;
  // Waren and IFCOs do not share a place: an IFCO cannot go where Waren lie.
  const bestand = bestandZu(await buchungenLaden(q, eq(bestandsbuchungen.lagerortId, ort.id)));
  if (bestand.length > 0) throw new WarenUngueltig(ifcoPlatzHatWareFehler(ort.name));
  const fehler = await ifcoPlatzPruefen(q, ort, masse, {
    ohne: ifcoId === null ? [] : [ifcoId],
    neu: [{ name, typId }],
  });
  if (fehler) throw new WarenUngueltig(fehler);
}

async function gegenstaendeLaden(q: Q, nurId?: string): Promise<GegenstandDetails[]> {
  const [rows, plaetze, offen] = await Promise.all([
    q
      .select()
      .from(gegenstaende)
      .where(nurId ? eq(gegenstaende.id, nurId) : undefined),
    q
      .select()
      .from(gegenstandPlaetze)
      .where(nurId ? eq(gegenstandPlaetze.gegenstandId, nurId) : undefined),
    offenLaden(q, nurId ? eq(ausleihePositionen.gegenstandId, nurId) : undefined),
  ]);
  return rows.map((g) =>
    gegenstandDetails(
      g,
      plaetze.filter((p) => p.gegenstandId === g.id),
      offen,
    ),
  );
}

/** Per IFCO the open whole-IFCO Ausleihe: the one away now first, else the earliest reserved one. */
export function ifcoAusleihen(
  offeneGanze: { ifcoId: string | null; ausleiheId: string; an: string; ausgeliehenAm: Date }[],
  jetzt: Date = new Date(),
): Map<string, IfcoAusleihe> {
  const karte = new Map<string, IfcoAusleihe>();
  const sortiert = [...offeneGanze].sort(
    (a, b) => a.ausgeliehenAm.getTime() - b.ausgeliehenAm.getTime(),
  );
  for (const p of sortiert) {
    if (p.ifcoId === null) continue;
    const geplant = istVorgemerkt(p.ausgeliehenAm, jetzt);
    const bisher = karte.get(p.ifcoId);
    // Away now beats reserved; among equals the earliest start wins (sorted ascending).
    if (bisher && (bisher.status === 'verliehen' || geplant)) continue;
    karte.set(p.ifcoId, {
      id: p.ausleiheId,
      an: p.an,
      status: geplant ? 'geplant' : 'verliehen',
      ausgeliehenAm: p.ausgeliehenAm,
    });
  }
  return karte;
}

/** The organising Mitglied of an Ausleihe: `organisiertVon`, else `erstelltVon`; null if unknown. */
export function organisatorVon(
  a: Pick<AusleiheRow, 'organisiertVon' | 'erstelltVon'>,
  mitgliederListe: {
    sub: string;
    vorname: string;
    nachname: string;
    status: MitgliedStatus;
    anrede: Anrede | null;
  }[],
): Organisator | null {
  const m = mitgliederListe.find((x) => x.sub === (a.organisiertVon ?? a.erstelltVon));
  return m
    ? {
        sub: m.sub,
        username: null,
        vorname: m.vorname,
        nachname: m.nachname,
        status: m.status,
        anrede: m.anrede ?? 'neutral',
      }
    : null;
}

async function ifcosLaden(q: Q, nurId?: string): Promise<IfcoDetails[]> {
  const [rows, plaetze, ganze] = await Promise.all([
    q
      .select()
      .from(ifcos)
      .where(nurId ? eq(ifcos.id, nurId) : undefined),
    q
      .select()
      .from(gegenstandPlaetze)
      .where(nurId ? eq(gegenstandPlaetze.ifcoId, nurId) : undefined),
    offenLaden(
      q,
      and(
        eq(ausleihePositionen.ganzeIfco, true),
        nurId ? eq(ausleihePositionen.ifcoId, nurId) : undefined,
      ),
    ),
  ]);
  const ausleihenJeIfco = ifcoAusleihen(
    ganze.map((p) => ({
      ifcoId: p.ifcoId,
      ausleiheId: p.ausleiheId,
      an: p.an,
      ausgeliehenAm: p.ausgeliehenAm,
    })),
  );
  return rows.map((i) => ({
    ...i,
    inhalt: plaetze
      .filter((p) => p.ifcoId === i.id)
      .map((p) => ({ gegenstandId: p.gegenstandId, anzahl: p.anzahl })),
    ausleihe: ausleihenJeIfco.get(i.id) ?? null,
  }));
}

async function ausleihenLaden(q: Q, nurId?: string): Promise<AusleiheDetails[]> {
  const [rows, positionen] = await Promise.all([
    q
      .select()
      .from(ausleihen)
      .where(nurId ? eq(ausleihen.id, nurId) : undefined),
    q
      .select()
      .from(ausleihePositionen)
      .where(nurId ? eq(ausleihePositionen.ausleiheId, nurId) : undefined),
  ]);
  const subs = [...new Set(rows.map((a) => a.organisiertVon ?? a.erstelltVon))];
  const personen = subs.length
    ? await q.select().from(mitglieder).where(inListe(mitglieder.sub, subs))
    : [];
  const jetzt = new Date();
  const [alleOffen, alllePlaetze] = await Promise.all([
    offenLaden(q),
    q.select().from(gegenstandPlaetze),
  ]);
  const gefaehrdet = gefaehrdungen(
    alllePlaetze.map((p) => alsMenge(p.gegenstandId, p)),
    alleOffen,
    jetzt,
  );
  return rows
    .map((a) => {
      const eigene = positionen.filter((p) => p.ausleiheId === a.id);
      const status = ausleiheStatus(a.ausgeliehenAm, eigene, jetzt);
      return {
        ...a,
        erledigt: status === 'erledigt',
        status,
        positionen: eigene,
        gefaehrdetDurch: gefaehrdet.get(a.id) ?? [],
        organisator: organisatorVon(a, personen),
      };
    })
    .sort(
      (a, b) => b.ausgeliehenAm.getTime() - a.ausgeliehenAm.getTime() || a.id.localeCompare(b.id),
    );
}

/** Throws `WarenUngueltig` unless `sub` belongs to a Mitglied. */
async function organisatorPruefen(q: Q, sub: string): Promise<void> {
  if (!(await gibtEs(q, mitglieder, eq(mitglieder.sub, sub)))) {
    throw new WarenUngueltig('Die organisierende Person ist kein Mitglied.');
  }
}

const kopfWerte = (daten: AusleiheKopfDaten) => ({
  an: daten.an,
  organisiertVon: daten.organisiertVon,
  ausgeliehenAm: new Date(daten.ausgeliehenAm),
  rueckgabeGeplant: daten.rueckgabeGeplant,
  kommentar: daten.kommentar,
});

export function createInventarStore(db: Db): InventarStore {
  return {
    // ----- Kategorien
    async kategorien(mitArchiv) {
      const rows = await db.select().from(inventarKategorien);
      return sortiert(
        rows.filter((k) => mitArchiv || !k.archiviert),
        (k) => k.name,
      );
    },
    async kategorieAnlegen(daten) {
      return db.transaction(async (tx) => {
        const fehler = elternFehler(await tx.select().from(inventarKategorien), daten.parentId);
        if (fehler) throw new WarenUngueltig(fehler);
        const id = randomUUID();
        await tx.insert(inventarKategorien).values({ id, ...daten });
        return id;
      });
    },
    async kategorieAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(inventarKategorien);
        const bisher = alle.find((k) => k.id === id);
        if (!bisher) return false;
        const fehler =
          zyklusFehler(alle, id, daten.parentId) ??
          (daten.parentId !== bisher.parentId ? elternFehler(alle, daten.parentId) : null);
        if (fehler) throw new WarenUngueltig(fehler);
        await tx.update(inventarKategorien).set(daten).where(eq(inventarKategorien.id, id));
        return true;
      });
    },
    async kategorieLoeschen(id) {
      return db.transaction(async (tx) => {
        if (!(await gibtEs(tx, inventarKategorien, eq(inventarKategorien.id, id)))) return false;
        const verwendet = await Promise.all([
          gibtEs(tx, inventarKategorien, eq(inventarKategorien.parentId, id)),
          gibtEs(tx, gegenstaende, eq(gegenstaende.kategorieId, id)),
        ]);
        if (verwendet.some(Boolean)) throw new WarenKonflikt(verwendetMeldung('Kategorie'));
        await tx.delete(inventarKategorien).where(eq(inventarKategorien.id, id));
        return true;
      });
    },
    async kategorieArchivieren(id, archiviert) {
      return db.transaction(async (tx) => {
        const alle = await tx.select().from(inventarKategorien);
        const kategorie = alle.find((k) => k.id === id);
        if (!kategorie) return false;
        if (!archiviert && alle.find((k) => k.id === kategorie.parentId)?.archiviert) {
          throw new WarenKonflikt(
            'Die übergeordnete Kategorie ist archiviert. Stelle sie zuerst wieder her.',
          );
        }
        await tx
          .update(inventarKategorien)
          .set({ archiviert })
          .where(inArray(inventarKategorien.id, teilbaumIds(alle, id)));
        return true;
      });
    },

    // ----- Gegenstände
    async gegenstaende(mitArchiv) {
      const liste = await gegenstaendeLaden(db);
      return sortiert(
        liste.filter((g) => mitArchiv || !g.archiviert),
        (g) => g.name,
      );
    },
    async gegenstandHolen(id) {
      return (await gegenstaendeLaden(db, id))[0];
    },
    async gegenstandAnlegen({ platz, ...daten }) {
      return db.transaction(async (tx) => {
        await kategorieMussNutzbarSein(tx, daten.kategorieId);
        if (platz) await zieleExistieren(tx, [platz]);
        const id = randomUUID();
        await tx.insert(gegenstaende).values({ id, ...daten });
        if (platz) {
          await tx.insert(gegenstandPlaetze).values({
            id: randomUUID(),
            gegenstandId: id,
            lagerortId: platz.lagerortId,
            ifcoId: platz.ifcoId,
            anzahl: platz.anzahl,
          });
        }
        return id;
      });
    },
    async gegenstandAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const [bisher] = await tx.select().from(gegenstaende).where(eq(gegenstaende.id, id));
        if (!bisher) return false;
        if (daten.kategorieId !== bisher.kategorieId) {
          await kategorieMussNutzbarSein(tx, daten.kategorieId);
        }
        await tx.update(gegenstaende).set(daten).where(eq(gegenstaende.id, id));
        return true;
      });
    },
    async gegenstandLoeschen(id) {
      return db.transaction(async (tx) => {
        if (!(await gibtEs(tx, gegenstaende, eq(gegenstaende.id, id)))) return false;
        const verwendet = await Promise.all([
          gibtEs(tx, gegenstandPlaetze, eq(gegenstandPlaetze.gegenstandId, id)),
          gibtEs(tx, ausleihePositionen, eq(ausleihePositionen.gegenstandId, id)),
        ]);
        if (verwendet.some(Boolean)) throw new WarenKonflikt(verwendetMeldung('Gegenstand'));
        await tx.delete(gegenstaende).where(eq(gegenstaende.id, id));
        return true;
      });
    },
    async gegenstandArchivieren(id, archiviert) {
      return db.transaction(async (tx) => {
        const [g] = await tx.select().from(gegenstaende).where(eq(gegenstaende.id, id));
        if (!g) return false;
        if (!archiviert) {
          const [k] = await tx
            .select()
            .from(inventarKategorien)
            .where(eq(inventarKategorien.id, g.kategorieId));
          if (k?.archiviert) {
            throw new WarenKonflikt('Die Kategorie ist archiviert. Stelle sie zuerst wieder her.');
          }
        }
        await tx.update(gegenstaende).set({ archiviert }).where(eq(gegenstaende.id, id));
        return true;
      });
    },
    async gegenstandPlaetzeSetzen(id, plaetze) {
      return db.transaction(async (tx) => {
        const [g] = await tx.select().from(gegenstaende).where(eq(gegenstaende.id, id));
        if (!g) return false;
        if (g.archiviert) throw new WarenUngueltig('Der Gegenstand ist archiviert.');
        const bisher = await tx
          .select()
          .from(gegenstandPlaetze)
          .where(eq(gegenstandPlaetze.gegenstandId, id));
        await zieleExistieren(tx, plaetze, bisher);
        const offen = await offenLaden(tx, eq(ausleihePositionen.gegenstandId, id));
        const neu = plaetze.map((p) => alsMenge(id, p));
        const fehler = await fehlerMitNamen(tx, (b) => verliehenFehler(neu, offen, b));
        if (fehler) throw new WarenKonflikt(fehler);
        await tx.delete(gegenstandPlaetze).where(eq(gegenstandPlaetze.gegenstandId, id));
        if (plaetze.length > 0) {
          await tx.insert(gegenstandPlaetze).values(
            plaetze.map((p) => ({
              id: randomUUID(),
              gegenstandId: id,
              lagerortId: p.lagerortId,
              ifcoId: p.ifcoId,
              anzahl: p.anzahl,
            })),
          );
        }
        return true;
      });
    },

    // ----- IFCO-Typen
    async ifcoTypen(mitArchiv) {
      const rows = await db.select().from(ifcoTypen);
      return sortiert(
        rows.filter((t) => mitArchiv || !t.archiviert),
        (t) => t.name,
      );
    },
    async ifcoTypAnlegen(daten) {
      const id = randomUUID();
      await db.insert(ifcoTypen).values({ id, ...daten });
      return id;
    },
    async ifcoTypAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const [bisher] = await tx.select().from(ifcoTypen).where(eq(ifcoTypen.id, id));
        if (!bisher) return false;
        if (bisher.grundflaeche !== daten.grundflaeche || bisher.hoeheCm !== daten.hoeheCm) {
          const stehend = await tx
            .select()
            .from(ifcos)
            .where(and(eq(ifcos.typId, id), eq(ifcos.archiviert, false)));
          const ortIds = [...new Set(stehend.flatMap((i) => (i.lagerortId ? [i.lagerortId] : [])))];
          const orte = ortIds.length
            ? await tx.select().from(lagerorte).where(inListe(lagerorte.id, ortIds))
            : [];
          for (const ort of orte) {
            const masse = ifcoPlatzMasse(ort);
            if (!masse) continue;
            const fehler = await ifcoPlatzPruefen(tx, ort, masse, {
              typen: new Map([[id, daten]]),
            });
            if (fehler) throw new WarenUngueltig(fehler);
          }
        }
        await tx.update(ifcoTypen).set(daten).where(eq(ifcoTypen.id, id));
        return true;
      });
    },
    async ifcoTypLoeschen(id) {
      return db.transaction(async (tx) => {
        if (!(await gibtEs(tx, ifcoTypen, eq(ifcoTypen.id, id)))) return false;
        if (await gibtEs(tx, ifcos, eq(ifcos.typId, id))) {
          throw new WarenKonflikt(verwendetMeldung('IFCO-Typ'));
        }
        await tx.delete(ifcoTypen).where(eq(ifcoTypen.id, id));
        return true;
      });
    },
    async ifcoTypArchivieren(id, archiviert) {
      return db.transaction(async (tx) => {
        if (!(await gibtEs(tx, ifcoTypen, eq(ifcoTypen.id, id)))) return false;
        await tx.update(ifcoTypen).set({ archiviert }).where(eq(ifcoTypen.id, id));
        return true;
      });
    },

    // ----- IFCOs
    async ifcos(mitArchiv) {
      const liste = await ifcosLaden(db);
      return sortiert(
        liste.filter((i) => mitArchiv || !i.archiviert),
        (i) => i.name,
      );
    },
    async ifcoHolen(id) {
      return (await ifcosLaden(db, id))[0];
    },
    async ifcoAnlegen(daten) {
      return db.transaction(async (tx) => {
        if (daten.lagerortId !== null) {
          await zieleExistieren(tx, [{ lagerortId: daten.lagerortId, ifcoId: null }]);
        }
        if (daten.typId !== null) await typMussNutzbarSein(tx, daten.typId);
        await passtAufPlatz(tx, null, daten.name, daten.typId, daten.lagerortId);
        const id = randomUUID();
        await tx.insert(ifcos).values({ id, ...daten });
        return id;
      });
    },
    async ifcoAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const [bisher] = await tx.select().from(ifcos).where(eq(ifcos.id, id));
        if (!bisher) return false;
        if (daten.lagerortId !== null && daten.lagerortId !== bisher.lagerortId) {
          await zieleExistieren(tx, [{ lagerortId: daten.lagerortId, ifcoId: null }]);
        }
        if (daten.typId !== null && daten.typId !== bisher.typId) {
          await typMussNutzbarSein(tx, daten.typId);
        }
        // An archived IFCO takes no space; it is checked again when it is restored.
        if (
          !bisher.archiviert &&
          (daten.lagerortId !== bisher.lagerortId || daten.typId !== bisher.typId)
        ) {
          await passtAufPlatz(tx, id, daten.name, daten.typId, daten.lagerortId);
        }
        await tx.update(ifcos).set(daten).where(eq(ifcos.id, id));
        return true;
      });
    },
    async ifcoLoeschen(id) {
      return db.transaction(async (tx) => {
        if (!(await gibtEs(tx, ifcos, eq(ifcos.id, id)))) return false;
        const verwendet = await Promise.all([
          gibtEs(tx, gegenstandPlaetze, eq(gegenstandPlaetze.ifcoId, id)),
          gibtEs(tx, ausleihePositionen, eq(ausleihePositionen.ifcoId, id)),
        ]);
        if (verwendet.some(Boolean)) throw new WarenKonflikt(verwendetMeldung('IFCO'));
        await tx.delete(ifcos).where(eq(ifcos.id, id));
        return true;
      });
    },
    async ifcoArchivieren(id, archiviert) {
      return db.transaction(async (tx) => {
        const [ifco] = await tx.select().from(ifcos).where(eq(ifcos.id, id));
        if (!ifco) return false;
        if (archiviert) {
          const offen = await offenLaden(tx, eq(ausleihePositionen.ifcoId, id));
          if (offen.length > 0) {
            throw new WarenKonflikt(
              `Aus der IFCO ist noch etwas verliehen oder vorgemerkt${blockiertVon(offen)}. Nimm es zuerst zurück.`,
            );
          }
          if (await gibtEs(tx, gegenstandPlaetze, eq(gegenstandPlaetze.ifcoId, id))) {
            throw new WarenKonflikt('Die IFCO ist nicht leer. Räume sie zuerst aus.');
          }
        } else if (ifco.lagerortId !== null) {
          const [ort] = await tx.select().from(lagerorte).where(eq(lagerorte.id, ifco.lagerortId));
          if (ort?.archiviert) {
            throw new WarenKonflikt('Der Lagerort ist archiviert. Stelle ihn zuerst wieder her.');
          }
          await passtAufPlatz(tx, id, ifco.name, ifco.typId, ifco.lagerortId);
        }
        await tx.update(ifcos).set({ archiviert }).where(eq(ifcos.id, id));
        return true;
      });
    },
    async ifcoPlatzSetzen(id, lagerortId) {
      return db.transaction(async (tx) => {
        const [ifco] = await tx.select().from(ifcos).where(eq(ifcos.id, id));
        if (!ifco) return false;
        if (ifco.archiviert) throw new WarenUngueltig('Die IFCO ist archiviert.');
        if (lagerortId !== null && lagerortId !== ifco.lagerortId) {
          await zieleExistieren(tx, [{ lagerortId, ifcoId: null }]);
          await passtAufPlatz(tx, id, ifco.name, ifco.typId, lagerortId);
        }
        await tx.update(ifcos).set({ lagerortId }).where(eq(ifcos.id, id));
        return true;
      });
    },
    async ifcoInhaltSetzen(id, positionen) {
      return db.transaction(async (tx) => {
        const [ifco] = await tx.select().from(ifcos).where(eq(ifcos.id, id));
        if (!ifco) return false;
        if (ifco.archiviert) throw new WarenUngueltig('Die IFCO ist archiviert.');
        const bisher = await tx
          .select()
          .from(gegenstandPlaetze)
          .where(eq(gegenstandPlaetze.ifcoId, id));
        const gegenstandIds = positionen.map((p) => p.gegenstandId);
        const rows = gegenstandIds.length
          ? await tx.select().from(gegenstaende).where(inListe(gegenstaende.id, gegenstandIds))
          : [];
        if (rows.length !== gegenstandIds.length) {
          throw new WarenUngueltig('Ein Gegenstand existiert nicht.');
        }
        const vorher = new Set(bisher.map((b) => b.gegenstandId));
        if (rows.some((g) => g.archiviert && !vorher.has(g.id))) {
          throw new WarenUngueltig('Ein Gegenstand ist archiviert.');
        }
        const offen = await offenLaden(tx, eq(ausleihePositionen.ifcoId, id));
        const neu = positionen.map((p) =>
          alsMenge(p.gegenstandId, { lagerortId: null, ifcoId: id, anzahl: p.anzahl }),
        );
        const fehler = await fehlerMitNamen(tx, (b) => verliehenFehler(neu, offen, b));
        if (fehler) throw new WarenKonflikt(fehler);
        await tx.delete(gegenstandPlaetze).where(eq(gegenstandPlaetze.ifcoId, id));
        if (positionen.length > 0) {
          await tx.insert(gegenstandPlaetze).values(
            positionen.map((p) => ({
              id: randomUUID(),
              gegenstandId: p.gegenstandId,
              lagerortId: null,
              ifcoId: id,
              anzahl: p.anzahl,
            })),
          );
        }
        return true;
      });
    },

    // ----- Ausleihen
    async ausleihen(nurOffen) {
      const liste = await ausleihenLaden(db);
      return liste.filter((a) => !nurOffen || !a.erledigt);
    },
    async ausleiheHolen(id) {
      return (await ausleihenLaden(db, id))[0];
    },
    async ausleiheAnlegen(daten, sub) {
      return db.transaction(async (tx) => {
        const gegenstandIds = [...new Set(daten.positionen.map((p) => p.gegenstandId))];
        const rows = await tx
          .select()
          .from(gegenstaende)
          .where(inListe(gegenstaende.id, gegenstandIds));
        if (rows.length !== gegenstandIds.length) {
          throw new WarenUngueltig('Ein Gegenstand existiert nicht.');
        }
        if (rows.some((g) => g.archiviert)) {
          throw new WarenUngueltig('Ein Gegenstand ist archiviert und lässt sich nicht verleihen.');
        }
        const plaetze = await tx
          .select()
          .from(gegenstandPlaetze)
          .where(inListe(gegenstandPlaetze.gegenstandId, gegenstandIds));
        const offen = await offenLaden(tx, inListe(ausleihePositionen.gegenstandId, gegenstandIds));
        const neu = daten.positionen.map((p) => alsMenge(p.gegenstandId, p));
        const zeitraum = ausleiheTage(daten.ausgeliehenAm, daten.rueckgabeGeplant);
        const fehler = await fehlerMitNamen(tx, (b) =>
          ausleihFehler(plaetze, offen, neu, zeitraum, { beschriftung: b }),
        );
        if (fehler) throw new WarenUngueltig(fehler);
        await organisatorPruefen(tx, daten.organisiertVon);
        const ganzeIfcoIds = [
          ...new Set(daten.positionen.flatMap((p) => (p.ganzeIfco && p.ifcoId ? [p.ifcoId] : []))),
        ];
        if (ganzeIfcoIds.length > 0) {
          const [inhalt, offeneInIfco] = await Promise.all([
            tx
              .select()
              .from(gegenstandPlaetze)
              .where(inListe(gegenstandPlaetze.ifcoId, ganzeIfcoIds)),
            offenLaden(tx, inListe(ausleihePositionen.ifcoId, ganzeIfcoIds)),
          ]);
          const ganzeFehler = await fehlerMitNamen(tx, (b) =>
            ganzeIfcoFehler(
              inhalt.map((p) => alsMenge(p.gegenstandId, p)),
              offeneInIfco,
              daten.positionen.map((p) => ({
                ...alsMenge(p.gegenstandId, p),
                ganzeIfco: p.ganzeIfco,
              })),
              zeitraum,
              { beschriftung: b },
            ),
          );
          if (ganzeFehler) throw new WarenUngueltig(ganzeFehler);
        }
        const id = randomUUID();
        await tx.insert(ausleihen).values({ id, ...kopfWerte(daten), erstelltVon: sub });
        await tx.insert(ausleihePositionen).values(
          daten.positionen.map((p) => ({
            id: randomUUID(),
            ausleiheId: id,
            gegenstandId: p.gegenstandId,
            lagerortId: p.lagerortId,
            ifcoId: p.ifcoId,
            anzahl: p.anzahl,
            ganzeIfco: p.ganzeIfco ?? null,
          })),
        );
        return id;
      });
    },
    async ausleiheAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        if (!(await gibtEs(tx, ausleihen, eq(ausleihen.id, id)))) return false;
        await organisatorPruefen(tx, daten.organisiertVon);
        // The new period must still fit for the Ausleihe's own open positions (returned ones occupy nothing).
        const eigene = (
          await tx.select().from(ausleihePositionen).where(eq(ausleihePositionen.ausleiheId, id))
        ).filter((p) => p.zurueckAm === null);
        if (eigene.length > 0) {
          const gegenstandIds = [...new Set(eigene.map((p) => p.gegenstandId))];
          const [plaetze, offen] = await Promise.all([
            tx
              .select()
              .from(gegenstandPlaetze)
              .where(inListe(gegenstandPlaetze.gegenstandId, gegenstandIds)),
            offenLaden(tx, inListe(ausleihePositionen.gegenstandId, gegenstandIds)),
          ]);
          const fehler = await fehlerMitNamen(tx, (b) =>
            ausleihFehler(
              plaetze,
              offen,
              eigene.map((p) => alsMenge(p.gegenstandId, p)),
              ausleiheTage(daten.ausgeliehenAm, daten.rueckgabeGeplant),
              { beschriftung: b, ohneAusleiheId: id },
            ),
          );
          if (fehler) throw new WarenUngueltig(fehler);
        }
        await tx.update(ausleihen).set(kopfWerte(daten)).where(eq(ausleihen.id, id));
        return true;
      });
    },
    async ausleiheRueckgabe(id, positionIds, zurueckAm) {
      return db.transaction(async (tx) => {
        const [ausleihe] = await tx.select().from(ausleihen).where(eq(ausleihen.id, id));
        if (!ausleihe) return false;
        const rows = await tx
          .select()
          .from(ausleihePositionen)
          .where(
            and(eq(ausleihePositionen.ausleiheId, id), inListe(ausleihePositionen.id, positionIds)),
          );
        if (rows.length !== positionIds.length || rows.some((p) => p.zurueckAm !== null)) {
          throw new WarenUngueltig(
            'Eine Position gehört nicht zu dieser Ausleihe oder ist schon zurückgegeben.',
          );
        }
        const zeitpunkt = new Date(zurueckAm);
        if (zeitpunkt < ausleihe.ausgeliehenAm) {
          throw new WarenUngueltig('Die Rückgabe kann nicht vor der Ausleihe liegen.');
        }
        await tx
          .update(ausleihePositionen)
          .set({ zurueckAm: zeitpunkt })
          .where(inListe(ausleihePositionen.id, positionIds));
        return true;
      });
    },
    async ausleiheLoeschen(id) {
      return db.transaction(async (tx) => {
        if (!(await gibtEs(tx, ausleihen, eq(ausleihen.id, id)))) return false;
        await tx.delete(ausleihePositionen).where(eq(ausleihePositionen.ausleiheId, id));
        await tx.delete(ausleihen).where(eq(ausleihen.id, id));
        return true;
      });
    },
  };
}
