import { z } from 'zod';
import { datumBerlin, eventZeitenAus, type EventDto } from './kalender';

// Photo folders of the events in the club's OneDrive (see docs/bilder.md). A folder is named
// `<date>_<event name>`; the date is `2025-06-14`, `2025-07-18-20` (same month),
// `2025-07-30-08-02` (across the month end) or, parsed only, `2025-12-30-2026-01-02`.

/** One folder of the OneDrive photo directory as the API returns it. */
export interface BilderOrdnerDto {
  /** OneDrive item id. */
  id: string;
  /** Raw folder name. */
  name: string;
  /** Link that opens the folder in OneDrive. */
  webUrl: string;
  /** First and last day (`YYYY-MM-DD`); null when the name has no date prefix. */
  von: string | null;
  bis: string | null;
  /** Name without the date prefix (the raw name when there is no date). */
  eventName: string;
  /** The calendar event the folder belongs to, if any. */
  eventId: string | null;
}

export interface BilderListeDto {
  /** False when OneDrive is not connected; the list is empty then. */
  verbunden: boolean;
  ordner: BilderOrdnerDto[];
}

export interface OneDriveStatusDto {
  verbunden: boolean;
  /** Display name or e-mail of the connected account. */
  konto: string | null;
  basisPfad: string;
  /** Why the connection broke (e.g. token revoked); null otherwise. */
  fehler: string | null;
  clientIdGesetzt: boolean;
  /** Application (client) id of the Azure app; not a secret, shown to prefill the form. */
  clientId: string | null;
  /** ISO instant of the connection. */
  verbundenAm: string | null;
  /** Username (else name) of the admin who connected OneDrive. */
  verbundenVon?: string | null;
}

export interface OrdnerDaten {
  von: string;
  bis: string;
  eventName: string;
}

const istEchtesDatum = (jahr: number, monat: number, tag: number): boolean => {
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  return d.getUTCFullYear() === jahr && d.getUTCMonth() === monat - 1 && d.getUTCDate() === tag;
};

const zweistellig = (n: number | string) => String(n).padStart(2, '0');
const iso = (jahr: number | string, monat: number | string, tag: number | string) =>
  `${String(jahr).padStart(4, '0')}-${zweistellig(monat)}-${zweistellig(tag)}`;

/** `YYYY-MM-DD` that is a real calendar date. */
export const istIsoDatum = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && istEchtesDatum(Number(m[1]), Number(m[2]), Number(m[3]));
};

const ORDNER_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{4})-(\d{2})-(\d{2})|-(\d{2})-(\d{2})|-(\d{2}))?_(.*)$/s;

/** Parses a folder name; null when it has no valid date prefix or no event name. */
export function ordnerNameParsen(name: string): OrdnerDaten | null {
  const m = ORDNER_REGEX.exec(name);
  if (!m) return null;
  const jahr = Number(m[1]);
  const monat = Number(m[2]);
  const tag = Number(m[3]);
  if (!istEchtesDatum(jahr, monat, tag)) return null;
  const von = iso(jahr, monat, tag);
  let bis = von;
  if (m[4] !== undefined) {
    const [j, mo, t] = [Number(m[4]), Number(m[5]), Number(m[6])];
    if (!istEchtesDatum(j, mo, t)) return null;
    bis = iso(j, mo, t);
  } else if (m[7] !== undefined) {
    const [mo, t] = [Number(m[7]), Number(m[8])];
    if (!istEchtesDatum(jahr, mo, t)) return null;
    bis = iso(jahr, mo, t);
  } else if (m[9] !== undefined) {
    const t = Number(m[9]);
    if (!istEchtesDatum(jahr, monat, t)) return null;
    bis = iso(jahr, monat, t);
  }
  if (bis < von) return null;
  const eventName = (m[10] ?? '').trim();
  if (!eventName) return null;
  return { von, bis, eventName };
}

/** Removes the characters OneDrive forbids in names and trailing dots and spaces. */
export function ordnerNameBereinigen(name: string): string {
  return name
    .replace(/["*:<>?/\\|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

/** Folder name in the shortest date form, e.g. `2025-07-18-20_Sommerfest`. */
export function ordnerName(von: string, bis: string, eventName: string): string {
  const name = ordnerNameBereinigen(eventName) || 'Event';
  let datum = von;
  if (bis > von) {
    if (bis.slice(0, 7) === von.slice(0, 7)) datum = `${von}-${bis.slice(8)}`;
    else if (bis.slice(0, 4) === von.slice(0, 4)) datum = `${von}-${bis.slice(5)}`;
    else datum = `${von}-${bis}`;
  }
  return `${datum}_${name}`;
}

/**
 * Name and days of an event's folder. `bis` is the last Berlin day for multi-day and whole-day
 * events (whole days end at the next midnight), else the first day: a bar night until 04:00 is one day.
 */
export function eventOrdnerDaten(
  event: Pick<EventDto, 'anzeigeTitel' | 'beginn' | 'ende' | 'dauer'>,
): OrdnerDaten {
  const von = datumBerlin(event.beginn);
  const bis =
    event.dauer === 'eintaegig' ? von : eventZeitenAus(event.dauer, event.beginn, event.ende).bis;
  return { von, bis: bis < von ? von : bis, eventName: event.anzeigeTitel };
}

export const bilderOrdnerAnlegenSchema = z
  .object({
    eventName: z
      .string('Bitte gib den Eventnamen an.')
      .trim()
      .min(1, 'Bitte gib den Eventnamen an.')
      .max(100, 'Höchstens 100 Zeichen erlaubt.'),
    von: z
      .string('Bitte gib das Datum an.')
      .refine(istIsoDatum, { message: 'Bitte gib ein gültiges Datum an.' }),
    bis: z
      .string()
      .refine(istIsoDatum, { message: 'Bitte gib ein gültiges Datum an.' })
      .nullish()
      .transform((v) => v ?? undefined),
  })
  .refine((v) => v.bis === undefined || v.bis >= v.von, {
    message: 'Das Ende darf nicht vor dem Beginn liegen.',
    path: ['bis'],
  });
export type BilderOrdnerAnlegen = z.infer<typeof bilderOrdnerAnlegenSchema>;

/** Newest first, folders without a date at the end; ties by name. */
export function bilderSortieren<T extends Pick<BilderOrdnerDto, 'von' | 'bis' | 'name'>>(
  ordner: readonly T[],
): T[] {
  return [...ordner].sort((a, b) => {
    if (a.von === null || b.von === null) {
      if (a.von !== b.von) return a.von === null ? 1 : -1;
    } else if (a.von !== b.von) {
      return a.von < b.von ? 1 : -1;
    } else if (a.bis !== b.bis && a.bis !== null && b.bis !== null) {
      return a.bis < b.bis ? 1 : -1;
    }
    return a.name.localeCompare(b.name, 'de');
  });
}

/** Days `von..bis` as `YYYY-MM-DD`, capped so that odd data cannot blow up. */
function tageIn(von: string, bis: string): string[] {
  const tage: string[] = [];
  const d = new Date(`${von}T00:00:00Z`);
  for (let i = 0; i < 800; i++) {
    const s = d.toISOString().slice(0, 10);
    if (s > bis) break;
    tage.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return tage;
}

/** Whether a search word is a date (full, month or year, ISO or German) that lies in the folder's days. */
function datumTrifft(wort: string, von: string, bis: string): boolean {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wort);
  if (m) return wort >= von && wort <= bis;
  m = /^(\d{4})-(\d{2})$/.exec(wort);
  if (m) return wort >= von.slice(0, 7) && wort <= bis.slice(0, 7);
  m = /^(\d{4})$/.exec(wort);
  if (m) return wort >= von.slice(0, 4) && wort <= bis.slice(0, 4);
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(wort);
  if (m) {
    const tag = iso(m[3] as string, m[2] as string, m[1] as string);
    return tag >= von && tag <= bis;
  }
  m = /^(\d{1,2})\.(\d{4})$/.exec(wort);
  if (m) {
    const monat = `${m[2]}-${zweistellig(m[1] as string)}`;
    return monat >= von.slice(0, 7) && monat <= bis.slice(0, 7);
  }
  m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(wort);
  if (m) {
    const suffix = `-${zweistellig(m[2] as string)}-${zweistellig(m[1] as string)}`;
    return tageIn(von, bis).some((t) => t.slice(4) === suffix);
  }
  return false;
}

/**
 * Whether a folder matches the search text. Words are AND-combined; each matches the event name
 * (case-insensitive) or a date as ISO (`2025-06-14`, `2025-06`, `2025`) or German (`14.06.2025`,
 * `14.6.`, `06.2025`) that lies in the folder's days. Folders without a date match by their raw name.
 */
export function bilderSuche(
  ordner: Pick<BilderOrdnerDto, 'name' | 'eventName' | 'von' | 'bis'>,
  text: string,
): boolean {
  const woerter = text.toLowerCase().split(/\s+/).filter(Boolean);
  const name = (ordner.von === null ? ordner.name : ordner.eventName).toLowerCase();
  return woerter.every(
    (w) =>
      name.includes(w) ||
      (ordner.von !== null && datumTrifft(w, ordner.von, ordner.bis ?? ordner.von)),
  );
}
