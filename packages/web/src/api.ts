import { hc } from 'hono/client';
import type { AppType } from '@c4/api';
import { useAuth } from './auth';
import { fetchMitWiederholung } from './fetchWiederholen';
import { ApiFehler } from './warenApi';

/** Typed API client; the Authorization header is read lazily so it always carries the current token. */
export function useApi() {
  const { getAccessToken, refreshAccessToken, kontoDeaktiviert } = useAuth();
  return hc<AppType>('/', {
    // On 401 (token expired between renewals) renew once and retry.
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await fetchMitWiederholung(input, init);
      // An admin may deactivate the account mid-session; show the lock page instead of errors.
      if (res.status === 403) {
        const body = (await res
          .clone()
          .json()
          .catch(() => null)) as { deaktiviert?: boolean } | null;
        if (body?.deaktiviert) kontoDeaktiviert();
      }
      if (res.status !== 401) return res;
      const token = await refreshAccessToken();
      if (!token) return res;
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${token}`);
      return fetchMitWiederholung(input, { ...init, headers });
    },
    headers: () => {
      const token = getAccessToken();
      return token ? { authorization: `Bearer ${token}` } : ({} as Record<string, string>);
    },
  }).api;
}

type JsonResponse = { ok: boolean; status: number; json(): Promise<unknown> };

/** Throws on non-2xx; the return type drops the validation-error (400) variant of the response union. */
export async function unwrap<R extends JsonResponse>(
  res: R,
): Promise<Awaited<ReturnType<Exclude<R, { status: 400 }>['json']>>> {
  if (!res.ok) {
    // Show the API's German error text when there is one.
    let meldung = 'Das hat nicht geklappt. Bitte versuch es noch einmal.';
    try {
      const body = (await res.json()) as { error?: unknown } | null;
      if (typeof body?.error === 'string' && body.error) meldung = body.error;
    } catch {
      // Keep the generic message.
    }
    throw new ApiFehler(res.status, meldung);
  }
  return (await res.json()) as never;
}
