import { useQuery } from '@tanstack/react-query';
import type { Mitglied } from '@c4/shared';
import { unwrap, useApi } from './api';
import { anzeigename, nebenname } from './mitglied';

/** All Mitglieder (shares the `['mitglieder']` cache with the Mitglieder page). */
export function useMitgliederListe() {
  const api = useApi();
  return useQuery({
    queryKey: ['mitglieder'],
    queryFn: async () => unwrap(await api.mitglieder.$get()),
  });
}

/** The logged-in user's own `sub` (shares the `['me']` cache). */
export function useEigeneSub(): string | undefined {
  const api = useApi();
  return useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.me.$get()) }).data?.sub;
}

/** Select options for choosing a Mitglied by `sub`: `username (Vorname Nachname)`, sorted. */
export function mitgliedOptionen(
  liste: Pick<Mitglied, 'sub' | 'username' | 'vorname' | 'nachname' | 'email'>[],
): { value: string; label: string }[] {
  return liste
    .map((m) => {
      const neben = nebenname(m);
      return { value: m.sub, label: neben ? `${anzeigename(m)} (${neben})` : anzeigename(m) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
}
