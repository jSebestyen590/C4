import { notifications } from '@mantine/notifications';

/** A non-2xx API answer; `message` is the German text sent by the API when there is one. */
export class ApiFehler extends Error {
  readonly status: number;
  /** Form field the API blames (`name`, `alias`, `standardGebindeId`), when it names one. */
  readonly feld?: string;
  constructor(status: number, message: string, feld?: string) {
    super(message);
    this.status = status;
    this.feld = feld;
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
  let feld: string | undefined;
  try {
    const body = (await res.json()) as { error?: unknown; feld?: unknown } | null;
    if (typeof body?.error === 'string') meldung = body.error;
    if (typeof body?.feld === 'string') feld = body.feld;
  } catch {
    // Keep the generic message.
  }
  throw new ApiFehler(res.status, meldung, feld);
}

export const fehlerText = (e: unknown, standard = STANDARD_FEHLER): string =>
  e instanceof ApiFehler ? e.message : standard;

export function fehlerAnzeigen(e: unknown, standard?: string): void {
  notifications.show({ color: 'red', message: fehlerText(e, standard) });
}
