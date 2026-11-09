import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { halterGleich, SCHLUESSEL_VERLAUF_MAX, type Halter } from '@c4/shared';
import type { Db } from './db/client';
import {
  schluessel,
  schluesselPlanungen,
  schluesselUebergaben,
  type SchluesselRow,
} from './db/schema';
import { planungSortieren } from './schluesselAnfragen';

// Club keys handed from person to person (see docs/schluessel.md).

export interface SchluesselDaten {
  id: string;
  name: string;
  beschreibung: string | null;
  archiviert: boolean;
  halter: Halter;
  halterSeit: Date | null;
}

export interface Uebergabe {
  id: string;
  von: Halter;
  an: Halter;
  /** Sub of the member who recorded it. */
  eingetragenVon: string;
  zeitpunkt: Date;
}

export interface SchluesselDetails extends SchluesselDaten {
  /** Newest first. */
  uebergaben: Uebergabe[];
}

/** The key is archived or has moved on since the client loaded it. */
export class UebergabeKonflikt extends Error {}

export interface SchluesselStore {
  alle(mitArchiv: boolean): Promise<SchluesselDaten[]>;
  holen(id: string): Promise<SchluesselDetails | undefined>;
  /** A new key; with a first holder this is recorded as an Übergabe from nobody. */
  anlegen(
    daten: { name: string; beschreibung: string | null; halter: Halter },
    akteur: string,
  ): Promise<string>;
  /** The mutations below return false / undefined when the key does not exist. */
  aktualisieren(id: string, daten: { name: string; beschreibung: string | null }): Promise<boolean>;
  archivieren(id: string, archiviert: boolean): Promise<boolean>;
  /**
   * Moves the key from `von` (the holder the client saw) to `an` and keeps only the newest
   * SCHLUESSEL_VERLAUF_MAX Übergaben. Throws UebergabeKonflikt when `von` is not the current holder.
   * A member receiving the key uses up their earliest planned handover of this key (same transaction).
   */
  uebergeben(
    id: string,
    uebergabe: { von: Halter; an: Halter },
    akteur: string,
  ): Promise<SchluesselDaten | undefined>;
}

const halterAus = (sub: string | null, name: string | null): Halter =>
  sub !== null ? { art: 'mitglied', sub } : name !== null ? { art: 'person', name } : null;

const halterSpalten = (h: Halter) => ({
  sub: h?.art === 'mitglied' ? h.sub : null,
  name: h?.art === 'person' ? h.name.trim() : null,
});

const alsDaten = (r: SchluesselRow): SchluesselDaten => ({
  id: r.id,
  name: r.name,
  beschreibung: r.beschreibung,
  archiviert: r.archiviert,
  halter: halterAus(r.halterSub, r.halterName),
  halterSeit: r.halterSeit,
});

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Records an Übergabe and drops everything beyond the newest SCHLUESSEL_VERLAUF_MAX. */
async function protokollieren(
  tx: Tx,
  schluesselId: string,
  von: Halter,
  an: Halter,
  akteur: string,
  zeitpunkt: Date,
) {
  const v = halterSpalten(von);
  const a = halterSpalten(an);
  await tx.insert(schluesselUebergaben).values({
    id: randomUUID(),
    schluesselId,
    vonSub: v.sub,
    vonName: v.name,
    anSub: a.sub,
    anName: a.name,
    eingetragenVon: akteur,
    zeitpunkt,
  });
  const alt = await tx
    .select({ id: schluesselUebergaben.id })
    .from(schluesselUebergaben)
    .where(eq(schluesselUebergaben.schluesselId, schluesselId))
    .orderBy(desc(schluesselUebergaben.zeitpunkt), desc(schluesselUebergaben.id))
    .offset(SCHLUESSEL_VERLAUF_MAX);
  if (alt.length > 0) {
    await tx.delete(schluesselUebergaben).where(
      inArray(
        schluesselUebergaben.id,
        alt.map((u) => u.id),
      ),
    );
  }
}

export function createSchluesselStore(db: Db): SchluesselStore {
  return {
    async alle(mitArchiv) {
      const rows = await db
        .select()
        .from(schluessel)
        .where(mitArchiv ? undefined : eq(schluessel.archiviert, false))
        .orderBy(asc(schluessel.name));
      return rows.map(alsDaten);
    },

    async holen(id) {
      const [row] = await db.select().from(schluessel).where(eq(schluessel.id, id));
      if (!row) return undefined;
      const uebergaben = await db
        .select()
        .from(schluesselUebergaben)
        .where(eq(schluesselUebergaben.schluesselId, id))
        .orderBy(desc(schluesselUebergaben.zeitpunkt), desc(schluesselUebergaben.id))
        .limit(SCHLUESSEL_VERLAUF_MAX);
      return {
        ...alsDaten(row),
        uebergaben: uebergaben.map((u) => ({
          id: u.id,
          von: halterAus(u.vonSub, u.vonName),
          an: halterAus(u.anSub, u.anName),
          eingetragenVon: u.eingetragenVon,
          zeitpunkt: u.zeitpunkt,
        })),
      };
    },

    async anlegen(daten, akteur) {
      const id = randomUUID();
      const jetzt = new Date();
      const h = halterSpalten(daten.halter);
      await db.transaction(async (tx) => {
        await tx.insert(schluessel).values({
          id,
          name: daten.name,
          beschreibung: daten.beschreibung,
          halterSub: h.sub,
          halterName: h.name,
          halterSeit: daten.halter ? jetzt : null,
        });
        if (daten.halter) await protokollieren(tx, id, null, daten.halter, akteur, jetzt);
      });
      return id;
    },

    async aktualisieren(id, daten) {
      const rows = await db
        .update(schluessel)
        .set({ name: daten.name, beschreibung: daten.beschreibung })
        .where(eq(schluessel.id, id))
        .returning({ id: schluessel.id });
      return rows.length > 0;
    },

    async archivieren(id, archiviert) {
      const rows = await db
        .update(schluessel)
        .set({ archiviert })
        .where(eq(schluessel.id, id))
        .returning({ id: schluessel.id });
      return rows.length > 0;
    },

    async uebergeben(id, { von, an }, akteur) {
      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(schluessel).where(eq(schluessel.id, id));
        if (!row) return undefined;
        if (row.archiviert || !halterGleich(halterAus(row.halterSub, row.halterName), von)) {
          throw new UebergabeKonflikt();
        }
        const jetzt = new Date();
        const h = halterSpalten(an);
        const [neu] = await tx
          .update(schluessel)
          .set({ halterSub: h.sub, halterName: h.name, halterSeit: jetzt })
          .where(eq(schluessel.id, id))
          .returning();
        // The stored holder keeps the spelling the key had, not the client's.
        await protokollieren(tx, id, halterAus(row.halterSub, row.halterName), an, akteur, jetzt);
        if (h.sub) {
          const geplant = planungSortieren(
            await tx
              .select()
              .from(schluesselPlanungen)
              .where(
                and(eq(schluesselPlanungen.schluesselId, id), eq(schluesselPlanungen.anSub, h.sub)),
              ),
          )[0];
          if (geplant) {
            await tx.delete(schluesselPlanungen).where(eq(schluesselPlanungen.id, geplant.id));
          }
        }
        return alsDaten(neu!);
      });
    },
  };
}
