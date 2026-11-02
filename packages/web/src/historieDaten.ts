import type { QueryClient } from '@tanstack/react-query';

/** Everything that shows a member's status or its history; call after any status change. */
export function historieAktualisieren(qc: QueryClient): Promise<unknown> {
  return Promise.all(
    ['mitglieder', 'mitglied', 'mitglied-historie', 'historie'].map((key) =>
      qc.invalidateQueries({ queryKey: [key] }),
    ),
  );
}
