import { heuteBerlin, stundeBerlin, tagNachher, todoFaelligKurz } from '@c4/shared';
import type { Benachrichtigungen } from './benachrichtigungen';
import type { TodosStore } from './todos';

// Todo reminders: "„Titel“ ist am Fr, 14.11. fällig." two days before the deadline. The type cannot
// be switched off (see BENACHRICHTIGUNGS_ARTEN). See docs/benachrichtigungen.md.

const ART = 'todo.frist';
/** Berlin local hour from which reminders go out. */
const AB_UHR = 9;
/** A Todo is reminded about from this many days before its deadline (and on the day itself). */
export const TODO_ERINNERUNG_TAGE = 2;

export const todoFristText = (titel: string, faelligAm: string): string =>
  `„${titel}“ ist am ${todoFaelligKurz(faelligAm)} fällig.`;

/** Whole days from `von` to `bis` (both ISO dates). */
const tageZwischen = (von: string, bis: string): number =>
  Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000);

export const todoUeberfaelligText = (titel: string, tage: number): string =>
  `„${titel}“ ist seit ${tage} ${tage === 1 ? 'Tag' : 'Tagen'} überfällig.`;

/** Registers the Todo reminder task with the generic job runner. */
export function registriereTodoAufgaben(
  benachrichtigungen: Benachrichtigungen,
  todos: Pick<TodosStore, 'offeneFaelligZwischen'>,
): void {
  benachrichtigungen.registriereAufgabe('todo.erinnerungen', (jetzt) =>
    todoErinnerungen(benachrichtigungen, todos, jetzt),
  );
}

/**
 * From 09:00 Berlin time: tells everybody for whom a Todo is still open and due today or within the
 * next two days. A Todo created shortly before its deadline is covered as well. Once per Todo,
 * deadline and person (`dedupeSchluessel`), so a moved deadline reminds again.
 */
export async function todoErinnerungen(
  benachrichtigungen: Pick<Benachrichtigungen, 'senden'>,
  todos: Pick<TodosStore, 'offeneFaelligZwischen'>,
  jetzt: Date,
): Promise<void> {
  if (stundeBerlin(jetzt) < AB_UHR) return;
  const heute = heuteBerlin(jetzt);
  const offene = await todos.offeneFaelligZwischen(heute, tagNachher(heute, TODO_ERINNERUNG_TAGE));
  for (const { todo, offeneSubs } of offene) {
    for (const sub of offeneSubs) {
      try {
        await benachrichtigungen.senden({
          subs: [sub],
          art: ART,
          titel: 'Todo bald fällig',
          text: todoFristText(todo.titel, todo.faelligAm),
          url: '/app/todos',
          dedupeSchluessel: `${ART}:${todo.id}:${todo.faelligAm}:${sub}`,
        });
      } catch (err) {
        console.error('Todo reminder failed', err);
      }
    }
  }
  // Overdue and still open: every day again, without end, until the Todo is done.
  const ueberfaellig = await todos.offeneFaelligZwischen('0000-01-01', tagNachher(heute, -1));
  for (const { todo, offeneSubs } of ueberfaellig) {
    for (const sub of offeneSubs) {
      try {
        await benachrichtigungen.senden({
          subs: [sub],
          art: ART,
          titel: 'Todo überfällig',
          text: todoUeberfaelligText(todo.titel, tageZwischen(todo.faelligAm, heute)),
          url: '/app/todos',
          dedupeSchluessel: `${ART}.ueberfaellig:${todo.id}:${heute}:${sub}`,
        });
      } catch (err) {
        console.error('Todo overdue reminder failed', err);
      }
    }
  }
}
