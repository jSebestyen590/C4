import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  ausleihFehler,
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
  type OffenePosition,
  type PlatzMenge,
  type PlatzZiel,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  ausleihen,
  ausleihePositionen,
  gegenstaende,
  gegenstandPlaetze,
  ifcos,
  inventarKategorien,
  lagerorte,
  type AusleihePositionRow,
  type AusleiheRow,
  type GegenstandRow,
  type IfcoRow,
  type InventarKategorieRow,
} from './db/schema';
import {
  elternFehler,
  blockiertVon,
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
}

/** `anzahl` pieces at a place: exactly one of `lagerortId` and `ifcoId` is set. */
export interface PlatzDaten extends PlatzZiel {
  anzahl: number;
}

export interface AusleihePositionDaten extends PlatzDaten {
  gegenstandId: string;
}

export interface AusleiheKopfDaten {
  an: string;
  /** ISO timestamp. */
  ausgeliehenAm: string;
  rueckgabeGeplant: string | null;
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

export interface IfcoDetails extends IfcoRow {
  inhalt: { gegenstandId: string; anzahl: number }[];
}

export interface AusleiheDetails extends AusleiheRow {
  /** True when every Position was returned. */
  erledigt: boolean;
  /** `erledigt`, `geplant` (starts in the future) or `verliehen`. */
  status: AusleiheStatus;
  positionen: AusleihePositionRow[];
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
  gegenstandAnlegen(daten: GegenstandDaten): Promise<string>;
  gegenstandAktualisieren(id: string, daten: GegenstandDaten): Promise<boolean>;
  gegenstandLoeschen(id: string): Promise<boolean>;
  gegenstandArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  /** Replaces all Plätze of the Gegenstand. */
  gegenstandPlaetzeSetzen(id: string, plaetze: PlatzDaten[]): Promise<boolean>;
  // Ifcos
  ifcos(mitArchiv: boolean): Promise<IfcoDetails[]>;
  ifcoHolen(id: string): Promise<IfcoDetails | undefined>;
  ifcoAnlegen(daten: IfcoDaten): Promise<string>;
  ifcoAktualisieren(id: string, daten: IfcoDaten): Promise<boolean>;
  ifcoLoeschen(id: string): Promise<boolean>;
  /** Archiving needs an empty Ifco without open Ausleihe. */
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
      return istLagerort ? 'Der Lagerort existiert nicht.' : 'Die Ifco existiert nicht.';
    if (gefunden.archiviert && !alt.has(zielKey(z))) {
      return istLagerort ? 'Der Lagerort ist archiviert.' : 'Die Ifco ist archiviert.';
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

async function ifcosLaden(q: Q, nurId?: string): Promise<IfcoDetails[]> {
  const [rows, plaetze] = await Promise.all([
    q
      .select()
      .from(ifcos)
      .where(nurId ? eq(ifcos.id, nurId) : undefined),
    q
      .select()
      .from(gegenstandPlaetze)
      .where(nurId ? eq(gegenstandPlaetze.ifcoId, nurId) : undefined),
  ]);
  return rows.map((i) => ({
    ...i,
    inhalt: plaetze
      .filter((p) => p.ifcoId === i.id)
      .map((p) => ({ gegenstandId: p.gegenstandId, anzahl: p.anzahl })),
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
  const jetzt = new Date();
  return rows
    .map((a) => {
      const eigene = positionen.filter((p) => p.ausleiheId === a.id);
      const status = ausleiheStatus(a.ausgeliehenAm, eigene, jetzt);
      return { ...a, erledigt: status === 'erledigt', status, positionen: eigene };
    })
    .sort(
      (a, b) => b.ausgeliehenAm.getTime() - a.ausgeliehenAm.getTime() || a.id.localeCompare(b.id),
    );
}

const kopfWerte = (daten: AusleiheKopfDaten) => ({
  an: daten.an,
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
    async gegenstandAnlegen(daten) {
      return db.transaction(async (tx) => {
        await kategorieMussNutzbarSein(tx, daten.kategorieId);
        const id = randomUUID();
        await tx.insert(gegenstaende).values({ id, ...daten });
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

    // ----- Ifcos
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
        if (verwendet.some(Boolean)) throw new WarenKonflikt(verwendetMeldung('Ifco'));
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
              `Aus der Ifco ist noch etwas verliehen oder vorgemerkt${blockiertVon(offen)}. Nimm es zuerst zurück.`,
            );
          }
          if (await gibtEs(tx, gegenstandPlaetze, eq(gegenstandPlaetze.ifcoId, id))) {
            throw new WarenKonflikt('Die Ifco ist nicht leer. Räume sie zuerst aus.');
          }
        } else if (ifco.lagerortId !== null) {
          const [ort] = await tx.select().from(lagerorte).where(eq(lagerorte.id, ifco.lagerortId));
          if (ort?.archiviert) {
            throw new WarenKonflikt('Der Lagerort ist archiviert. Stelle ihn zuerst wieder her.');
          }
        }
        await tx.update(ifcos).set({ archiviert }).where(eq(ifcos.id, id));
        return true;
      });
    },
    async ifcoPlatzSetzen(id, lagerortId) {
      return db.transaction(async (tx) => {
        const [ifco] = await tx.select().from(ifcos).where(eq(ifcos.id, id));
        if (!ifco) return false;
        if (ifco.archiviert) throw new WarenUngueltig('Die Ifco ist archiviert.');
        if (lagerortId !== null && lagerortId !== ifco.lagerortId) {
          await zieleExistieren(tx, [{ lagerortId, ifcoId: null }]);
        }
        await tx.update(ifcos).set({ lagerortId }).where(eq(ifcos.id, id));
        return true;
      });
    },
    async ifcoInhaltSetzen(id, positionen) {
      return db.transaction(async (tx) => {
        const [ifco] = await tx.select().from(ifcos).where(eq(ifcos.id, id));
        if (!ifco) return false;
        if (ifco.archiviert) throw new WarenUngueltig('Die Ifco ist archiviert.');
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
        const fehler = await fehlerMitNamen(tx, (b) => ausleihFehler(plaetze, offen, neu, b));
        if (fehler) throw new WarenUngueltig(fehler);
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
          })),
        );
        return id;
      });
    },
    async ausleiheAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        if (!(await gibtEs(tx, ausleihen, eq(ausleihen.id, id)))) return false;
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
