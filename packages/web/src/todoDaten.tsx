import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Todo } from '@c4/shared';
import { unwrap, useApi } from './api';
import { pruefen } from './warenApi';

/** Every Todo query lives under this key, so one invalidation refreshes the page. */
export const todoKeys = {
  alle: ['todos'] as const,
  meine: ['todos', 'meine'] as const,
};

export const todosInvalidieren = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: todoKeys.alle });

/** The Todos the signed-in member is zuständig for (open ones first, by deadline). */
export function useMeineTodos() {
  const api = useApi();
  return useQuery({
    queryKey: todoKeys.meine,
    queryFn: async () => (await unwrap(await api.me.todos.$get())) as Todo[],
  });
}

/** Ticks or unticks a Todo; the tick shows at once, the list is reloaded afterwards. */
export function useTodoErledigt() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, erledigt }: { id: string; erledigt: boolean }) =>
      pruefen(await api.me.todos[':id'].erledigt.$put({ param: { id }, json: { erledigt } })),
    onMutate: async ({ id, erledigt }) => {
      await qc.cancelQueries({ queryKey: todoKeys.alle });
      const alt = qc.getQueryData<Todo[]>(todoKeys.meine);
      if (alt) {
        qc.setQueryData<Todo[]>(
          todoKeys.meine,
          alt.map((t) => (t.id === id ? { ...t, ichErledigt: erledigt } : t)),
        );
      }
      return { alt };
    },
    onError: (_fehler, _vars, kontext) => {
      if (kontext?.alt) qc.setQueryData(todoKeys.meine, kontext.alt);
    },
    onSettled: () => todosInvalidieren(qc),
  });
}
