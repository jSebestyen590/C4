import { randomUUID } from 'node:crypto';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { POSTEN_RECHTE, type Bezeichnungen, type Permission, type PostenRecht } from '@c4/shared';
import type { Db } from './db/client';
import {
  posten,
  postenBesetzungen,
  postenRechte,
  type BesetzungRow,
  type PostenRow,
} from './db/schema';

/** Today as `YYYY-MM-DD` in the club's time zone; Besetzungen are compared as plain dates. */
export const heuteBerlin = (jetzt = new Date()): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(jetzt);

/** Whether `heute` lies within the Besetzung (both ends inclusive, no end = open). */
export const istAktuell = (
  b: Pick<BesetzungRow, 'startDatum' | 'endDatum'>,
  heute: string,
): boolean => b.startDatum <= heute && (b.endDatum === null || b.endDatum >= heute);

export interface PostenDetails extends PostenRow {
  rechte: PostenRecht[];
  besetzungen: BesetzungRow[];
}

export interface PostenDaten extends Bezeichnungen {
  name: string;
  beschreibung: string | null;
}

/** A Posten a member currently holds, with the data needed to title the holder. */
export type AktuellerPosten = Bezeichnungen & { id: string; name: string };

export interface BesetzungDaten {
  mitgliedSub: string;
  start: string;
  ende: string | null;
}

export interface PostenStore {
  alle(mitArchiv: boolean): Promise<PostenDetails[]>;
  holen(id: string): Promise<PostenDetails | undefined>;
  anlegen(daten: PostenDaten): Promise<string>;
  /** The mutations below return false when the Posten (or Besetzung) does not exist. */
  aktualisieren(id: string, daten: PostenDaten): Promise<boolean>;
  archivieren(id: string, archiviert: boolean): Promise<boolean>;
  rechteSetzen(id: string, rechte: readonly PostenRecht[]): Promise<boolean>;
  besetzungAnlegen(postenId: string, daten: BesetzungDaten): Promise<string | undefined>;
  besetzungAendern(postenId: string, id: string, daten: BesetzungDaten): Promise<boolean>;
  besetzungLoeschen(postenId: string, id: string): Promise<boolean>;
  /** Current, non-archived Posten per member `sub`. */
  aktuelleNachMitglied(heute?: string): Promise<Map<string, AktuellerPosten[]>>;
  /** Permissions granted by the Posten the member currently holds. */
  rechteVon(sub: string, heute?: string): Promise<Permission[]>;
}

const istRecht = (r: string): r is PostenRecht => (POSTEN_RECHTE as readonly string[]).includes(r);

export function createPostenStore(db: Db): PostenStore {
  const aktuellBedingung = (heute: string) =>
    and(
      eq(posten.archiviert, false),
      lte(postenBesetzungen.startDatum, heute),
      or(isNull(postenBesetzungen.endDatum), gte(postenBesetzungen.endDatum, heute)),
    );

  const details = async (rows: PostenRow[]): Promise<PostenDetails[]> => {
    const [rechte, besetzungen] = await Promise.all([
      db.select().from(postenRechte),
      db.select().from(postenBesetzungen),
    ]);
    return rows.map((p) => ({
      ...p,
      rechte: rechte
        .filter((r) => r.postenId === p.id && istRecht(r.recht))
        .map((r) => r.recht as PostenRecht),
      besetzungen: besetzungen.filter((b) => b.postenId === p.id),
    }));
  };

  return {
    async alle(mitArchiv) {
      const rows = await db.select().from(posten).orderBy(posten.name);
      return details(mitArchiv ? rows : rows.filter((p) => !p.archiviert));
    },
    async holen(id) {
      const rows = await db.select().from(posten).where(eq(posten.id, id));
      return (await details(rows))[0];
    },
    async anlegen(daten) {
      const id = randomUUID();
      await db.insert(posten).values({ id, ...daten });
      return id;
    },
    async aktualisieren(id, daten) {
      const rows = await db
        .update(posten)
        .set({ ...daten, aktualisiertAm: new Date() })
        .where(eq(posten.id, id))
        .returning({ id: posten.id });
      return rows.length > 0;
    },
    async archivieren(id, archiviert) {
      const rows = await db
        .update(posten)
        .set({ archiviert, aktualisiertAm: new Date() })
        .where(eq(posten.id, id))
        .returning({ id: posten.id });
      return rows.length > 0;
    },
    async rechteSetzen(id, rechte) {
      const [vorhanden] = await db.select({ id: posten.id }).from(posten).where(eq(posten.id, id));
      if (!vorhanden) return false;
      await db.transaction(async (tx) => {
        await tx.delete(postenRechte).where(eq(postenRechte.postenId, id));
        if (rechte.length > 0) {
          await tx.insert(postenRechte).values(rechte.map((recht) => ({ postenId: id, recht })));
        }
      });
      return true;
    },
    async besetzungAnlegen(postenId, daten) {
      const [vorhanden] = await db
        .select({ id: posten.id })
        .from(posten)
        .where(eq(posten.id, postenId));
      if (!vorhanden) return undefined;
      const id = randomUUID();
      await db.insert(postenBesetzungen).values({
        id,
        postenId,
        mitgliedSub: daten.mitgliedSub,
        startDatum: daten.start,
        endDatum: daten.ende,
      });
      return id;
    },
    async besetzungAendern(postenId, id, daten) {
      const rows = await db
        .update(postenBesetzungen)
        .set({ mitgliedSub: daten.mitgliedSub, startDatum: daten.start, endDatum: daten.ende })
        .where(and(eq(postenBesetzungen.id, id), eq(postenBesetzungen.postenId, postenId)))
        .returning({ id: postenBesetzungen.id });
      return rows.length > 0;
    },
    async besetzungLoeschen(postenId, id) {
      const rows = await db
        .delete(postenBesetzungen)
        .where(and(eq(postenBesetzungen.id, id), eq(postenBesetzungen.postenId, postenId)))
        .returning({ id: postenBesetzungen.id });
      return rows.length > 0;
    },
    async aktuelleNachMitglied(heute = heuteBerlin()) {
      const rows = await db
        .select({
          sub: postenBesetzungen.mitgliedSub,
          id: posten.id,
          name: posten.name,
          bezeichnungMaennlich: posten.bezeichnungMaennlich,
          bezeichnungWeiblich: posten.bezeichnungWeiblich,
          bezeichnungNeutral: posten.bezeichnungNeutral,
        })
        .from(postenBesetzungen)
        .innerJoin(posten, eq(posten.id, postenBesetzungen.postenId))
        .where(aktuellBedingung(heute))
        .orderBy(posten.name);
      const result = new Map<string, AktuellerPosten[]>();
      for (const { sub, ...p } of rows) {
        const liste = result.get(sub) ?? [];
        // A member may hold a Posten twice (overlapping Besetzungen); list it once.
        if (!liste.some((q) => q.id === p.id)) liste.push(p);
        result.set(sub, liste);
      }
      return result;
    },
    async rechteVon(sub, heute = heuteBerlin()) {
      const rows = await db
        .selectDistinct({ recht: postenRechte.recht })
        .from(postenBesetzungen)
        .innerJoin(posten, eq(posten.id, postenBesetzungen.postenId))
        .innerJoin(postenRechte, eq(postenRechte.postenId, posten.id))
        .where(and(eq(postenBesetzungen.mitgliedSub, sub), aktuellBedingung(heute)));
      return rows.map((r) => r.recht).filter(istRecht);
    },
  };
}
