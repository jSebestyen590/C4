import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { TodoModus } from '@c4/shared';
import type { Db } from './db/client';
import { todos, todoZustaendige, type TodoRow } from './db/schema';

// Todos (see docs/todos.md): tasks from a protocol or created by a member, with the people they are for.

export interface TodoZustaendigerDaten {
  sub: string;
  /** Mode `einzeln`: when this person ticked it. */
  erledigtAm: Date | null;
}

export interface TodoDaten {
  id: string;
  titel: string;
  notizen: string | null;
  /** `YYYY-MM-DD` */
  faelligAm: string;
  modus: TodoModus;
  protokollId: string | null;
  bausteinId: string | null;
  /** Mode `gemeinsam`: when and by whom it was ticked. */
  erledigtAm: Date | null;
  erledigtVon: string | null;
  erstelltVon: string;
  erstelltAm: Date;
  zustaendige: TodoZustaendigerDaten[];
}

export interface TodoAnlegen {
  titel: string;
  notizen: string | null;
  faelligAm: string;
  modus: TodoModus;
  protokollId: string | null;
  bausteinId: string | null;
  erstelltVon: string;
  /** The people it is for. */
  subs: string[];
}

export interface TodoAenderung {
  titel: string;
  notizen: string | null;
  faelligAm: string;
  modus: TodoModus;
}

export type AbhakenErgebnis = 'ok' | 'nicht_gefunden' | 'nicht_zustaendig';

/** An open Todo with the people for whom it is still open (for reminders). */
export interface OffenesTodo {
  todo: TodoDaten;
  offeneSubs: string[];
}

export interface TodosStore {
  /** The Todos the person is zuständig for (any state), in no particular order. */
  meine(sub: string): Promise<TodoDaten[]>;
  byId(id: string): Promise<TodoDaten | undefined>;
  byIds(ids: readonly string[]): Promise<TodoDaten[]>;
  anlegen(daten: TodoAnlegen): Promise<string>;
  /**
   * False when the Todo does not exist. A changed mode resets all ticks (they meant something else
   * in the other mode).
   */
  aendern(id: string, daten: TodoAenderung): Promise<boolean>;
  loeschen(id: string): Promise<boolean>;
  /**
   * Ticks or unticks the Todo for `sub` (who must be zuständig): mode `gemeinsam` sets or clears the
   * tick of the whole Todo, mode `einzeln` the person's own.
   */
  abhaken(id: string, sub: string, erledigt: boolean): Promise<AbhakenErgebnis>;
  /** Makes `subs` the people it is for: adds and removes; those who stay keep their tick. False when the Todo does not exist. */
  zustaendigeSetzen(id: string, subs: readonly string[]): Promise<boolean>;
  /** Not yet ticked Todos with a deadline from `von` to `bis` (both included) and the people they are still open for. */
  offeneFaelligZwischen(von: string, bis: string): Promise<OffenesTodo[]>;
}

/** The people a Todo is still open for: everybody (`gemeinsam`, not ticked), or those who have not ticked (`einzeln`). */
export function offeneSubsVon(todo: TodoDaten): string[] {
  if (todo.modus === 'gemeinsam') {
    return todo.erledigtAm === null ? todo.zustaendige.map((z) => z.sub) : [];
  }
  return todo.zustaendige.filter((z) => z.erledigtAm === null).map((z) => z.sub);
}

const alsDaten = (
  row: TodoRow,
  zustaendige: { sub: string; erledigtAm: Date | null }[],
): TodoDaten => ({
  id: row.id,
  titel: row.titel,
  notizen: row.notizen,
  faelligAm: row.faelligAm,
  modus: row.modus,
  protokollId: row.protokollId,
  bausteinId: row.bausteinId,
  erledigtAm: row.erledigtAm,
  erledigtVon: row.erledigtVon,
  erstelltVon: row.erstelltVon,
  erstelltAm: row.erstelltAm,
  zustaendige: zustaendige.map((z) => ({ sub: z.sub, erledigtAm: z.erledigtAm })),
});

export function createTodosStore(db: Db): TodosStore {
  const mitZustaendigen = async (rows: TodoRow[]): Promise<TodoDaten[]> => {
    if (rows.length === 0) return [];
    const z = await db
      .select()
      .from(todoZustaendige)
      .where(
        inArray(
          todoZustaendige.todoId,
          rows.map((r) => r.id),
        ),
      );
    return rows.map((r) =>
      alsDaten(
        r,
        z.filter((x) => x.todoId === r.id).sort((a, b) => a.sub.localeCompare(b.sub)),
      ),
    );
  };

  const byIds = async (ids: readonly string[]): Promise<TodoDaten[]> => {
    if (ids.length === 0) return [];
    return mitZustaendigen(
      await db
        .select()
        .from(todos)
        .where(inArray(todos.id, [...ids])),
    );
  };

  return {
    async meine(sub) {
      const ids = await db
        .select({ id: todoZustaendige.todoId })
        .from(todoZustaendige)
        .where(eq(todoZustaendige.sub, sub));
      return byIds(ids.map((i) => i.id));
    },

    async byId(id) {
      return (await byIds([id]))[0];
    },

    byIds,

    async anlegen(daten) {
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(todos).values({
          id,
          titel: daten.titel,
          notizen: daten.notizen,
          faelligAm: daten.faelligAm,
          modus: daten.modus,
          protokollId: daten.protokollId,
          bausteinId: daten.bausteinId,
          erstelltVon: daten.erstelltVon,
        });
        const subs = [...new Set(daten.subs)];
        if (subs.length > 0) {
          await tx.insert(todoZustaendige).values(subs.map((sub) => ({ todoId: id, sub })));
        }
      });
      return id;
    },

    async aendern(id, daten) {
      return db.transaction(async (tx) => {
        const [alt] = await tx.select().from(todos).where(eq(todos.id, id));
        if (!alt) return false;
        const modusNeu = alt.modus !== daten.modus;
        await tx
          .update(todos)
          .set({
            titel: daten.titel,
            notizen: daten.notizen,
            faelligAm: daten.faelligAm,
            modus: daten.modus,
            ...(modusNeu ? { erledigtAm: null, erledigtVon: null } : {}),
            geaendertAm: new Date(),
          })
          .where(eq(todos.id, id));
        if (modusNeu) {
          await tx
            .update(todoZustaendige)
            .set({ erledigtAm: null, erledigtVon: null })
            .where(eq(todoZustaendige.todoId, id));
        }
        return true;
      });
    },

    async loeschen(id) {
      return db.transaction(async (tx) => {
        await tx.delete(todoZustaendige).where(eq(todoZustaendige.todoId, id));
        const rows = await tx.delete(todos).where(eq(todos.id, id)).returning({ id: todos.id });
        return rows.length > 0;
      });
    },

    async abhaken(id, sub, erledigt) {
      return db.transaction(async (tx) => {
        const [todo] = await tx.select().from(todos).where(eq(todos.id, id));
        if (!todo) return 'nicht_gefunden';
        const [z] = await tx
          .select()
          .from(todoZustaendige)
          .where(and(eq(todoZustaendige.todoId, id), eq(todoZustaendige.sub, sub)));
        if (!z) return 'nicht_zustaendig';
        const jetzt = new Date();
        const stand = erledigt
          ? { erledigtAm: jetzt, erledigtVon: sub }
          : { erledigtAm: null, erledigtVon: null };
        if (todo.modus === 'gemeinsam') {
          await tx
            .update(todos)
            .set({ ...stand, geaendertAm: jetzt })
            .where(eq(todos.id, id));
        } else {
          await tx
            .update(todoZustaendige)
            .set(stand)
            .where(and(eq(todoZustaendige.todoId, id), eq(todoZustaendige.sub, sub)));
        }
        return 'ok';
      });
    },

    async zustaendigeSetzen(id, subs) {
      return db.transaction(async (tx) => {
        const [todo] = await tx.select().from(todos).where(eq(todos.id, id));
        if (!todo) return false;
        const soll = new Set(subs);
        const ist = await tx
          .select({ sub: todoZustaendige.sub })
          .from(todoZustaendige)
          .where(eq(todoZustaendige.todoId, id));
        const vorhanden = new Set(ist.map((x) => x.sub));
        const weg = [...vorhanden].filter((s) => !soll.has(s));
        const neu = [...soll].filter((s) => !vorhanden.has(s));
        if (weg.length > 0) {
          await tx
            .delete(todoZustaendige)
            .where(and(eq(todoZustaendige.todoId, id), inArray(todoZustaendige.sub, weg)));
        }
        if (neu.length > 0) {
          await tx.insert(todoZustaendige).values(neu.map((sub) => ({ todoId: id, sub })));
        }
        return true;
      });
    },

    async offeneFaelligZwischen(von, bis) {
      const rows = await db
        .select()
        .from(todos)
        .where(and(gte(todos.faelligAm, von), lte(todos.faelligAm, bis)));
      return (await mitZustaendigen(rows))
        .map((todo) => ({ todo, offeneSubs: offeneSubsVon(todo) }))
        .filter((o) => o.offeneSubs.length > 0);
    },
  };
}
