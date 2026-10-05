import { hc } from 'hono/client';
import type { AppType } from '@c4/api';
import { useAuth } from './auth';

/** Typed API client; the Authorization header is read lazily so it always carries the current token. */
export function useApi() {
  const { getAccessToken } = useAuth();
  return hc<AppType>('/', {
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
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as never;
}
