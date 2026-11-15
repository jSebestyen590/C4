import { notifications } from '@mantine/notifications';
import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiFehler } from './warenApi';

export const STANDARD_MUTATIONSFEHLER = 'Das hat nicht geklappt. Bitte versuch es noch einmal.';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** The mutation shows its own error (notification, inline Alert, ...): no global message. */
      eigeneFehlermeldung?: boolean;
    };
  }
}

/** Message of the global error notification: the API's German text, otherwise the generic one. */
export function mutationFehlerMeldung(error: unknown): string {
  return error instanceof ApiFehler && error.message ? error.message : STANDARD_MUTATIONSFEHLER;
}

/** Shows the red notification unless the mutation opted out via `meta.eigeneFehlermeldung`. */
export function mutationFehlerBehandeln(
  error: unknown,
  meta: { eigeneFehlermeldung?: boolean } | undefined,
): void {
  if (meta?.eigeneFehlermeldung) return;
  notifications.show({ color: 'red', message: mutationFehlerMeldung(error) });
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        mutationFehlerBehandeln(error, mutation.meta),
    }),
  });
}
