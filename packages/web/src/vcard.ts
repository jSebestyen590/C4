import { useQuery } from '@tanstack/react-query';
import type { Mitglied } from '@c4/shared';
import { unwrap, useApi } from './api';
import { mitgliederKeys } from './queryKeys';

/** The token is renewed this long before it expires. */
const VORLAUF_MS = 10 * 60 * 1000;

/**
 * Link builder for contact cards (vCard). The phone's Contacts app opens a plain URL, so the link
 * carries a short-lived token of the viewer instead of a bearer token. `vcardLink` is undefined
 * until the token is loaded, for deactivated members and for the viewer themselves.
 */
export function useVcardToken() {
  const api = useApi();
  const token = useQuery({
    queryKey: mitgliederKeys.vcardToken,
    queryFn: async () => unwrap(await api.me['vcard-token'].$post()),
    staleTime: Infinity,
    retry: false,
    refetchInterval: (query) => {
      const ablauf = query.state.data?.ablauf;
      if (!ablauf) return false;
      return Math.max(60_000, new Date(ablauf).getTime() - Date.now() - VORLAUF_MS);
    },
  });
  const me = useQuery({
    queryKey: mitgliederKeys.me,
    queryFn: async () => unwrap(await api.me.$get()),
  });
  const eigeneSub = me.data?.sub;
  const wert = token.data?.token;
  const vcardLink = wert
    ? (m: Pick<Mitglied, 'username' | 'sub' | 'deaktiviert'>): string | undefined =>
        m.deaktiviert || m.sub === eigeneSub
          ? undefined
          : `/api/vcard/${wert}/${encodeURIComponent(m.username ?? m.sub)}.vcf`
    : undefined;
  return { vcardLink };
}
