import { z } from 'zod';
import type { Anrede } from './anrede';
import { datumSchema } from './schemas';
import type { MitgliedStatus } from './status';

// Todos (see docs/todos.md): tasks that come from a protocol (Baustein "Todo", created when the
// protocol is closed) or that members create for themselves.

/** `gemeinsam`: one person ticks it, then it is done for everybody. `einzeln`: everybody ticks for themselves. */
export const TODO_MODI = ['gemeinsam', 'einzeln'] as const;
export const todoModusSchema = z.enum(TODO_MODI);
export type TodoModus = z.infer<typeof todoModusSchema>;

export const TODO_TITEL_MAX = 200;
export const TODO_NOTIZEN_MAX = 2000;

/** Input of a member's own Todo (create and edit). */
export const todoEingabeSchema = z.strictObject({
  titel: z.string().trim().min(1, 'Bitte gib einen Titel an.').max(TODO_TITEL_MAX),
  notizen: z.string().trim().max(TODO_NOTIZEN_MAX).nullish(),
  faelligAm: datumSchema,
});
export type TodoEingabe = z.infer<typeof todoEingabeSchema>;

export const todoErledigtSchema = z.strictObject({ erledigt: z.boolean() });
export type TodoErledigt = z.infer<typeof todoErledigtSchema>;

export interface TodoZustaendiger {
  sub: string;
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
  anrede: Anrede;
  /** ISO instant the person ticked it (mode `einzeln`), else null. */
  erledigtAm: string | null;
}

export interface TodoQuelle {
  protokollId: string;
  /** Title of the Sitzung event the protocol belongs to. */
  eventName: string;
  /** Berlin date (`YYYY-MM-DD`) of the Sitzung. */
  datum: string;
}

/** A Todo as the API delivers it to a person who is zuständig (`GET /me/todos`). */
export interface Todo {
  id: string;
  titel: string;
  notizen: string | null;
  /** `YYYY-MM-DD` */
  faelligAm: string;
  modus: TodoModus;
  /** The protocol the Todo comes from; null for a Todo the member created. */
  quelle: TodoQuelle | null;
  zustaendige: TodoZustaendiger[];
  /** Mode `gemeinsam`: when it was ticked (ISO instant) and by whom (sub). Null otherwise. */
  erledigtAm: string | null;
  erledigtVon: string | null;
  /** Whether it is done for the requesting person (see `todoFuerMichErledigt`). */
  ichErledigt: boolean;
  /** The requesting person may edit and delete it (their own Todo, not from a protocol). */
  bearbeitbar: boolean;
}

/** Whether the Todo is done for the person: `gemeinsam` once anybody ticked it, `einzeln` their own tick. */
export function todoFuerMichErledigt(
  todo: Pick<Todo, 'modus' | 'erledigtAm' | 'zustaendige'>,
  sub: string,
): boolean {
  if (todo.modus === 'gemeinsam') return todo.erledigtAm !== null;
  return todo.zustaendige.find((z) => z.sub === sub)?.erledigtAm != null;
}

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'short' });

/** "Fr, 14.11." for `2026-11-14`. */
export function todoFaelligKurz(datum: string): string {
  const [, monat, tag] = datum.split('-');
  const wochentag = WOCHENTAG.format(new Date(`${datum}T12:00:00Z`)).replace('.', '');
  return `${wochentag}, ${tag}.${monat}.`;
}

/** Sort key for the Todo list: open ones first, by deadline; then done ones, latest deadline first. */
export function todosSortieren<T extends Pick<Todo, 'faelligAm' | 'titel' | 'ichErledigt'>>(
  todos: readonly T[],
): T[] {
  return [...todos].sort((a, b) => {
    if (a.ichErledigt !== b.ichErledigt) return a.ichErledigt ? 1 : -1;
    if (a.faelligAm !== b.faelligAm) {
      const aelter = a.faelligAm < b.faelligAm;
      return a.ichErledigt ? (aelter ? 1 : -1) : aelter ? -1 : 1;
    }
    return a.titel.localeCompare(b.titel, 'de');
  });
}
