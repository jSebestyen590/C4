import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import type { RanglisteDurchgang } from '@c4/shared';
import type { Db } from './db/client';
import { trichter, trichterDurchgaenge, trichterTeilnahmen, type TrichterRow } from './db/schema';

// Funnels and their sessions (see docs/trichter.md).

export type TrichterDaten = TrichterRow;

export interface DurchgangDaten {
  id: string;
  trichterId: string;
  trichterName: string;
  /** Total volume; shared by the participants. */
  volumenMl: number;
  zeitpunkt: Date;
  /** Sub of the member who recorded it. */
  eingetragenVon: string;
  eingetragenAm: Date;
  teilnehmende: string[];
}

/** Position in the list of Durchgänge: the last one returned. */
export interface DurchgangCursor {
  zeitpunkt: Date;
  id: string;
}

export interface TrichterStore {
  alle(mitArchiv: boolean): Promise<TrichterDaten[]>;
  holen(id: string): Promise<TrichterDaten | undefined>;
  anlegen(daten: { name: string; volumenMl: number; auslaesse: number }): Promise<string>;
  /** Changes only the given fields; false when the funnel does not exist. */
  aktualisieren(
    id: string,
    daten: { name?: string; volumenMl?: number; auslaesse?: number; archiviert?: boolean },
  ): Promise<boolean>;
  /** Up to `limit` Durchgänge, newest `zeitpunkt` first, after `nach`. */
  durchgaenge(limit: number, nach?: DurchgangCursor): Promise<DurchgangDaten[]>;
  /** All Durchgänge in the form the ranking needs. */
  fuerRangliste(): Promise<RanglisteDurchgang[]>;
  durchgang(id: string): Promise<DurchgangDaten | undefined>;
  durchgangAnlegen(daten: {
    trichterId: string;
    volumenMl: number;
    zeitpunkt: Date;
    eingetragenVon: string;
    teilnehmende: string[];
  }): Promise<string>;
  /** Deletes the Durchgang with its participations; false when it does not exist. */
  durchgangLoeschen(id: string): Promise<boolean>;
}

export function createTrichterStore(db: Db): TrichterStore {
  /** Attaches the participants to Durchgang rows. */
  const mitTeilnehmenden = async (
    rows: { d: typeof trichterDurchgaenge.$inferSelect; trichterName: string }[],
  ): Promise<DurchgangDaten[]> => {
    if (rows.length === 0) return [];
    const teilnahmen = await db
      .select()
      .from(trichterTeilnahmen)
      .where(
        inArray(
          trichterTeilnahmen.durchgangId,
          rows.map((r) => r.d.id),
        ),
      );
    return rows.map(({ d, trichterName }) => ({
      id: d.id,
      trichterId: d.trichterId,
      trichterName,
      volumenMl: d.volumenMl,
      zeitpunkt: d.zeitpunkt,
      eingetragenVon: d.eingetragenVon,
      eingetragenAm: d.eingetragenAm,
      teilnehmende: teilnahmen.filter((t) => t.durchgangId === d.id).map((t) => t.mitgliedSub),
    }));
  };

  return {
    async alle(mitArchiv) {
      return db
        .select()
        .from(trichter)
        .where(mitArchiv ? undefined : eq(trichter.archiviert, false))
        .orderBy(trichter.name);
    },

    async holen(id) {
      const [row] = await db.select().from(trichter).where(eq(trichter.id, id));
      return row;
    },

    async anlegen(daten) {
      const id = randomUUID();
      await db.insert(trichter).values({ id, ...daten });
      return id;
    },

    async aktualisieren(id, daten) {
      const rows = await db
        .update(trichter)
        .set(daten)
        .where(eq(trichter.id, id))
        .returning({ id: trichter.id });
      return rows.length > 0;
    },

    async durchgaenge(limit, nach) {
      const rows = await db
        .select({ d: trichterDurchgaenge, trichterName: trichter.name })
        .from(trichterDurchgaenge)
        .innerJoin(trichter, eq(trichter.id, trichterDurchgaenge.trichterId))
        .where(
          nach
            ? or(
                lt(trichterDurchgaenge.zeitpunkt, nach.zeitpunkt),
                and(
                  eq(trichterDurchgaenge.zeitpunkt, nach.zeitpunkt),
                  lt(trichterDurchgaenge.id, nach.id),
                ),
              )
            : undefined,
        )
        .orderBy(desc(trichterDurchgaenge.zeitpunkt), desc(trichterDurchgaenge.id))
        .limit(limit);
      return mitTeilnehmenden(rows);
    },

    async fuerRangliste() {
      const [durchgaenge, teilnahmen] = await Promise.all([
        db
          .select({
            id: trichterDurchgaenge.id,
            zeitpunkt: trichterDurchgaenge.zeitpunkt,
            volumenMl: trichterDurchgaenge.volumenMl,
          })
          .from(trichterDurchgaenge),
        db.select().from(trichterTeilnahmen),
      ]);
      const nachDurchgang = new Map<string, string[]>();
      for (const t of teilnahmen) {
        nachDurchgang.set(t.durchgangId, [
          ...(nachDurchgang.get(t.durchgangId) ?? []),
          t.mitgliedSub,
        ]);
      }
      return durchgaenge.map((d) => ({
        zeitpunkt: d.zeitpunkt,
        volumenMl: d.volumenMl,
        teilnehmende: nachDurchgang.get(d.id) ?? [],
      }));
    },

    async durchgang(id) {
      const rows = await db
        .select({ d: trichterDurchgaenge, trichterName: trichter.name })
        .from(trichterDurchgaenge)
        .innerJoin(trichter, eq(trichter.id, trichterDurchgaenge.trichterId))
        .where(eq(trichterDurchgaenge.id, id));
      return (await mitTeilnehmenden(rows))[0];
    },

    async durchgangAnlegen(daten) {
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(trichterDurchgaenge).values({
          id,
          trichterId: daten.trichterId,
          volumenMl: daten.volumenMl,
          zeitpunkt: daten.zeitpunkt,
          eingetragenVon: daten.eingetragenVon,
        });
        await tx
          .insert(trichterTeilnahmen)
          .values(daten.teilnehmende.map((mitgliedSub) => ({ durchgangId: id, mitgliedSub })));
      });
      return id;
    },

    async durchgangLoeschen(id) {
      return db.transaction(async (tx) => {
        await tx.delete(trichterTeilnahmen).where(eq(trichterTeilnahmen.durchgangId, id));
        const rows = await tx
          .delete(trichterDurchgaenge)
          .where(eq(trichterDurchgaenge.id, id))
          .returning({ id: trichterDurchgaenge.id });
        return rows.length > 0;
      });
    },
  };
}
