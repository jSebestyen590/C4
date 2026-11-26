import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import {
  heuteBerlin,
  POSTEN_RECHTE,
  rechteZeitraum,
  tagVorher,
  type Bezeichnungen,
  type Permission,
  type PostenRecht,
} from '@c4/shared';
import type { Db } from './db/client';
import { sperreBeruehren } from './db/sperren';
import {
  posten,
  postenBesetzungen,
  mitglieder,
  postenRechte,
  type BesetzungRow,
  type PostenRow,
} from './db/schema';

/** Whether `heute` lies within the Besetzung (both ends inclusive, no end = open). */
export const istAktuell = (
  b: Pick<BesetzungRow, 'startDatum' | 'endDatum'>,
  heute: string,
): boolean => b.startDatum <= heute && (b.endDatum === null || b.endDatum >= heute);

type Zeitraum = Pick<BesetzungRow, 'startDatum' | 'endDatum'>;

/** Whether two Besetzungen share at least one day (both ends inclusive, no end = open). */
export const ueberschneiden = (a: Zeitraum, b: Zeitraum): boolean =>
  a.startDatum <= (b.endDatum ?? '9999-12-31') && b.startDatum <= (a.endDatum ?? '9999-12-31');

/**
 * Whether the permissions of a Besetzung apply on `heute`: from one month before its start until one
 * month after its end (transition period, see `rechteZeitraum`).
 */
export const rechteAktiv = (
  b: Pick<BesetzungRow, 'startDatum' | 'endDatum'>,
  heute: string,
): boolean => {
  const { von, bis } = rechteZeitraum(b.startDatum, b.endDatum);
  return von <= heute && (bis === null || bis >= heute);
};

export interface PostenDetails extends PostenRow {
  rechte: PostenRecht[];
  besetzungen: BesetzungRow[];
}

export interface PostenDaten extends Bezeichnungen {
  name: string;
  beschreibung: string | null;
  vorstand?: boolean;
}

/** A holder of a Vorstandsposten on a given day. */
export interface VorstandBesetzung {
  postenId: string;
  postenName: string;
  sub: string;
  vorname: string;
  nachname: string;
}

/** Holders of the non-archived Vorstandsposten on `datum`, sorted by Posten, then name. */
export async function vorstandAm(
  q: Pick<Db, 'select'>,
  datum: string,
): Promise<VorstandBesetzung[]> {
  const rows = await q
    .select({
      postenId: posten.id,
      postenName: posten.name,
      sub: postenBesetzungen.mitgliedSub,
      vorname: mitglieder.vorname,
      nachname: mitglieder.nachname,
    })
    .from(postenBesetzungen)
    .innerJoin(posten, eq(posten.id, postenBesetzungen.postenId))
    .innerJoin(mitglieder, eq(mitglieder.sub, postenBesetzungen.mitgliedSub))
    .where(
      and(
        eq(posten.vorstand, true),
        eq(posten.archiviert, false),
        lte(postenBesetzungen.startDatum, datum),
        or(isNull(postenBesetzungen.endDatum), gte(postenBesetzungen.endDatum, datum)),
      ),
    );
  return rows.sort(
    (a, b) =>
      a.postenName.localeCompare(b.postenName, 'de') ||
      a.nachname.localeCompare(b.nachname, 'de') ||
      a.vorname.localeCompare(b.vorname, 'de'),
  );
}

/** A Posten a member currently holds, with the data needed to title the holder. */
export type AktuellerPosten = Bezeichnungen & { id: string; name: string };

export interface BesetzungDaten {
  mitgliedSub: string;
  start: string;
  ende: string | null;
}

/** A Besetzung to take over does not exist, has an end already or starts too late. */
export class AblosungUngueltig extends Error {}

/** A member would hold the same Posten twice at the same time. */
export class BesetzungUeberschneidung extends Error {}

export type BesetzungMitPosten = BesetzungRow & { postenName: string };

export interface PostenStore {
  alle(mitArchiv: boolean): Promise<PostenDetails[]>;
  holen(id: string): Promise<PostenDetails | undefined>;
  anlegen(daten: PostenDaten): Promise<string>;
  /** The mutations below return false when the Posten (or Besetzung) does not exist. */
  aktualisieren(id: string, daten: PostenDaten): Promise<boolean>;
  archivieren(id: string, archiviert: boolean): Promise<boolean>;
  rechteSetzen(id: string, rechte: readonly PostenRecht[]): Promise<boolean>;
  /**
   * `ablosung` are open-ended Besetzungen of this Posten that end the day before the new start, in
   * the same transaction. Throws AblosungUngueltig for any that cannot be ended that way.
   */
  besetzungAnlegen(
    postenId: string,
    daten: BesetzungDaten,
    ablosung?: readonly string[],
  ): Promise<string | undefined>;
  besetzungAendern(postenId: string, id: string, daten: BesetzungDaten): Promise<boolean>;
  besetzungLoeschen(postenId: string, id: string): Promise<boolean>;
  /** Current, non-archived Posten per member `sub`. */
  /** All Besetzungen of a member (also of archived Posten), oldest start first. */
  besetzungenVon(sub: string): Promise<BesetzungMitPosten[]>;
  aktuelleNachMitglied(heute?: string): Promise<Map<string, AktuellerPosten[]>>;
  /** Holders of the Vorstandsposten on `datum` (default today). */
  vorstandAm(datum?: string): Promise<VorstandBesetzung[]>;
  /** Permissions granted by the Posten the member currently holds. */
  rechteVon(sub: string, heute?: string): Promise<Permission[]>;
  /** Subs of the members who currently hold a Posten that grants `recht` (same rules as `rechteVon`). */
  inhaberMitRecht(recht: PostenRecht, heute?: string): Promise<string[]>;
}

const istRecht = (r: string): r is PostenRecht => (POSTEN_RECHTE as readonly string[]).includes(r);

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Throws unless `daten` leaves the member's other Besetzungen of this Posten untouched. */
async function keineUeberschneidung(
  tx: Tx,
  postenId: string,
  daten: BesetzungDaten,
  ausser?: string,
) {
  // Same transaction as the check and the write: overlapping Besetzungen of one member must conflict.
  await sperreBeruehren(tx, `besetzung:${postenId}:${daten.mitgliedSub}`);
  const andere = await tx
    .select()
    .from(postenBesetzungen)
    .where(
      and(
        eq(postenBesetzungen.postenId, postenId),
        eq(postenBesetzungen.mitgliedSub, daten.mitgliedSub),
      ),
    );
  const neu = { startDatum: daten.start, endDatum: daten.ende };
  if (andere.some((b) => b.id !== ausser && ueberschneiden(b, neu))) {
    throw new BesetzungUeberschneidung();
  }
}

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
    async besetzungAnlegen(postenId, daten, ablosung = []) {
      const [vorhanden] = await db
        .select({ id: posten.id })
        .from(posten)
        .where(eq(posten.id, postenId));
      if (!vorhanden) return undefined;
      const id = randomUUID();
      await db.transaction(async (tx) => {
        if (ablosung.length > 0) {
          const alte = await tx
            .select()
            .from(postenBesetzungen)
            .where(
              and(
                eq(postenBesetzungen.postenId, postenId),
                inArray(postenBesetzungen.id, [...ablosung]),
              ),
            );
          const ungueltig =
            alte.length !== new Set(ablosung).size ||
            alte.some((b) => b.endDatum !== null || b.startDatum >= daten.start);
          if (ungueltig) throw new AblosungUngueltig();
          await tx
            .update(postenBesetzungen)
            .set({ endDatum: tagVorher(daten.start) })
            .where(
              inArray(
                postenBesetzungen.id,
                alte.map((b) => b.id),
              ),
            );
        }
        await keineUeberschneidung(tx, postenId, daten);
        await tx.insert(postenBesetzungen).values({
          id,
          postenId,
          mitgliedSub: daten.mitgliedSub,
          startDatum: daten.start,
          endDatum: daten.ende,
        });
      });
      return id;
    },
    async besetzungAendern(postenId, id, daten) {
      return db.transaction(async (tx) => {
        await keineUeberschneidung(tx, postenId, daten, id);
        const rows = await tx
          .update(postenBesetzungen)
          .set({
            mitgliedSub: daten.mitgliedSub,
            startDatum: daten.start,
            endDatum: daten.ende,
          })
          .where(and(eq(postenBesetzungen.id, id), eq(postenBesetzungen.postenId, postenId)))
          .returning({ id: postenBesetzungen.id });
        return rows.length > 0;
      });
    },
    async besetzungLoeschen(postenId, id) {
      const rows = await db
        .delete(postenBesetzungen)
        .where(and(eq(postenBesetzungen.id, id), eq(postenBesetzungen.postenId, postenId)))
        .returning({ id: postenBesetzungen.id });
      return rows.length > 0;
    },
    async besetzungenVon(sub) {
      const rows = await db
        .select({ b: postenBesetzungen, postenName: posten.name })
        .from(postenBesetzungen)
        .innerJoin(posten, eq(posten.id, postenBesetzungen.postenId))
        .where(eq(postenBesetzungen.mitgliedSub, sub))
        .orderBy(postenBesetzungen.startDatum);
      return rows.map((r) => ({ ...r.b, postenName: r.postenName }));
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
        // Besetzungen of one member never overlap per Posten, so each Posten appears once.
        result.set(sub, [...(result.get(sub) ?? []), p]);
      }
      return result;
    },
    async vorstandAm(datum = heuteBerlin()) {
      return vorstandAm(db, datum);
    },
    async rechteVon(sub, heute = heuteBerlin()) {
      const rows = await db
        .select({ recht: postenRechte.recht, besetzung: postenBesetzungen })
        .from(postenBesetzungen)
        .innerJoin(posten, eq(posten.id, postenBesetzungen.postenId))
        .innerJoin(postenRechte, eq(postenRechte.postenId, posten.id))
        .where(and(eq(postenBesetzungen.mitgliedSub, sub), eq(posten.archiviert, false)));
      const rechte = rows.filter((r) => rechteAktiv(r.besetzung, heute)).map((r) => r.recht);
      return [...new Set(rechte)].filter(istRecht);
    },
    async inhaberMitRecht(recht, heute = heuteBerlin()) {
      const rows = await db
        .select({ besetzung: postenBesetzungen })
        .from(postenBesetzungen)
        .innerJoin(posten, eq(posten.id, postenBesetzungen.postenId))
        .innerJoin(postenRechte, eq(postenRechte.postenId, posten.id))
        .where(and(eq(postenRechte.recht, recht), eq(posten.archiviert, false)));
      return [
        ...new Set(
          rows.filter((r) => rechteAktiv(r.besetzung, heute)).map((r) => r.besetzung.mitgliedSub),
        ),
      ];
    },
  };
}
