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
}
