import type { QueryClient } from '@tanstack/react-query';
import { historieKeys, mitgliederKeys } from './queryKeys';

/** Everything that shows a member's status or its history; call after any status change. */
export function historieAktualisieren(qc: QueryClient): Promise<unknown> {
  return Promise.all(
    [
      mitgliederKeys.alle,
      mitgliederKeys.mitglied,
      mitgliederKeys.statusHistorieAlle,
      historieKeys.alle,
    ].map((queryKey) => qc.invalidateQueries({ queryKey })),
  );
}
