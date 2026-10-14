import { notifications } from '@mantine/notifications';

/** A non-2xx API answer; `message` is the German text sent by the API when there is one. */
export class ApiFehler extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const STANDARD_FEHLER = 'Die Aktion ist fehlgeschlagen.';

/** Throws an `ApiFehler` for non-2xx responses, carrying the API's error message. */
export async function pruefen(res: {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}): Promise<void> {
  if (res.ok) return;
  let meldung = STANDARD_FEHLER;
  try {
    const body = (await res.json()) as { error?: unknown } | null;
    if (typeof body?.error === 'string') meldung = body.error;
  } catch {
    // Keep the generic message.
  }
  throw new ApiFehler(res.status, meldung);
}

export const fehlerText = (e: unknown, standard = STANDARD_FEHLER): string =>
  e instanceof ApiFehler ? e.message : standard;

export function fehlerAnzeigen(e: unknown, standard?: string): void {
  notifications.show({ color: 'red', message: fehlerText(e, standard) });
}
