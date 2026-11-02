import { datumAnzeigen, tagNachher, type MitgliedStatus, type StatusZeitraum } from '@c4/shared';

/** Colors of the persons in the Posten view (Mantine `name.shade`); assigned in order of first start. */
export const MITGLIED_PALETTE = [
  'blue.6',
  'orange.6',
  'teal.6',
  'grape.6',
  'yellow.6',
  'cyan.7',
  'pink.6',
  'lime.7',
  'indigo.6',
  'red.7',
  'violet.5',
  'green.7',
] as const;

export interface Bereich {
  von: string;
  bis: string;
}

/** Days since the epoch of an ISO date. */
export const tagNummer = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Number of days in a range, both ends inclusive. */
export const bereichTage = (b: Bereich): number => tagNummer(b.bis) - tagNummer(b.von) + 1;

/** Left offset and width of a period in percent of the range (the end day is inclusive). */
export function balkenPosition(bereich: Bereich, von: string, bis: string) {
  const gesamt = bereichTage(bereich);
  return {
    links: ((tagNummer(von) - tagNummer(bereich.von)) / gesamt) * 100,
    breite: ((tagNummer(bis) - tagNummer(von) + 1) / gesamt) * 100,
  };
}

export interface Tick {
  /** Position in percent of the range. */
  prozent: number;
  label: string;
}

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Ranges shorter than this many days get a tick per month instead of per year. */
const MONATS_SCHWELLE_TAGE = 730;
/** Ranges shorter than this many days get ticks on the 1st and 15th of each month. */
const HALBMONATS_SCHWELLE_TAGE = 120;

/** Ticks on the 1st and 15th of each month, labelled "1. Nov" / "15. Okt". */
function halbmonatsTicks(bereich: Bereich): Tick[] {
  const gesamt = bereichTage(bereich);
  const ergebnis: Tick[] = [];
  let [j, m] = bereich.von.split('-').map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, '0');
  for (;;) {
    for (const t of [1, 15]) {
      const iso = `${j}-${pad(m)}-${pad(t)}`;
      if (iso > bereich.bis) return ergebnis;
      if (iso >= bereich.von)
        ergebnis.push({
          prozent: ((tagNummer(iso) - tagNummer(bereich.von)) / gesamt) * 100,
          label: `${t}. ${MONATE[m - 1]}`,
        });
    }
    m++;
    if (m > 12) {
      m = 1;
      j++;
    }
  }
}

/** Year ticks (month ticks below two years, half-month ticks below four months). */
export function ticks(bereich: Bereich): Tick[] {
  if (bereichTage(bereich) < HALBMONATS_SCHWELLE_TAGE) return halbmonatsTicks(bereich);
  const monatlich = bereichTage(bereich) < MONATS_SCHWELLE_TAGE;
  const gesamt = bereichTage(bereich);
  const ergebnis: Tick[] = [];
  const [jahr0, monat0] = bereich.von.split('-').map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, '0');
  for (let j = jahr0, m = monatlich ? monat0 : 1; ;) {
    const iso = `${j}-${pad(monatlich ? m : 1)}-01`;
    if (iso > bereich.bis) break;
    if (iso >= bereich.von) {
      const label = monatlich ? `${MONATE[m - 1]}${m === 1 ? ` ${j}` : ''}`.trim() : String(j);
      ergebnis.push({ prozent: ((tagNummer(iso) - tagNummer(bereich.von)) / gesamt) * 100, label });
    }
    if (monatlich) {
      m++;
      if (m > 12) {
        m = 1;
        j++;
      }
    } else j++;
  }
  return ergebnis;
}

/** Minimum width of the chart area in px so ticks stay readable; the chart scrolls horizontally below. */
export function mindestBreite(bereich: Bereich): number {
  const tage = bereichTage(bereich);
  if (tage < HALBMONATS_SCHWELLE_TAGE) return Math.ceil((tage / 15) * 56);
  return tage < MONATS_SCHWELLE_TAGE
    ? Math.ceil((tage / 30.4) * 44)
    : Math.ceil((tage / 365.25) * 72);
}

/** `var(--mantine-color-blue-6)` for `blue.6`. */
export const mantineFarbe = (farbe: string): string =>
  `var(--mantine-color-${farbe.replace('.', '-')})`;

/** Tooltip text: "name · 06.11.2012 – 31.12.2019", or "name · seit 06.11.2012" for an open end. */
export function zeitraumText(name: string, von: string, bis: string, offen: boolean): string {
  return `${name} · ${offen ? `seit ${datumAnzeigen(von)}` : `${datumAnzeigen(von)} – ${datumAnzeigen(bis)}`}`;
}

export interface BesetzungsSegment {
  von: string;
  bis: string;
  /** Null when no dated status covers the stretch. */
  status: MitgliedStatus | null;
}

/** Splits `von`..`bis` (inclusive) at status changes; stretches without a dated status get `null`. */
export function besetzungSegmente(
  von: string,
  bis: string,
  zeitraeume: readonly StatusZeitraum[],
): BesetzungsSegment[] {
  const segmente: BesetzungsSegment[] = [];
  let cursor = von;
  for (const z of [...zeitraeume].sort((a, b) => (a.von < b.von ? -1 : 1))) {
    if (z.bis < cursor || z.von > bis) continue;
    const start = z.von > cursor ? z.von : cursor;
    if (start > cursor) segmente.push({ von: cursor, bis: tagNachher(start, -1), status: null });
    const ende = z.bis < bis ? z.bis : bis;
    segmente.push({ von: start, bis: ende, status: z.status });
    cursor = tagNachher(ende, 1);
    if (cursor > bis) break;
  }
  if (cursor <= bis) segmente.push({ von: cursor, bis, status: null });
  return segmente;
}

/**
 * One color per person, consistent across all Posten shown: persons are ordered by their first
 * start (then key) and take the palette in turn.
 */
export function personenFarben(
  personen: readonly { key: string; start: string }[],
): Map<string, string> {
  const fruehester = new Map<string, string>();
  for (const p of personen) {
    const bisher = fruehester.get(p.key);
    if (bisher === undefined || p.start < bisher) fruehester.set(p.key, p.start);
  }
  const sortiert = [...fruehester].sort(([ka, sa], [kb, sb]) =>
    sa === sb ? ka.localeCompare(kb) : sa < sb ? -1 : 1,
  );
  return new Map(sortiert.map(([key], i) => [key, MITGLIED_PALETTE[i % MITGLIED_PALETTE.length]!]));
}

/** The earliest of the given dates, or `fallback` when there are none. */
export const fruehestes = (daten: readonly string[], fallback: string): string =>
  daten.reduce((min, d) => (d < min ? d : min), daten[0] ?? fallback);

/** The latest of the given dates, but never before `minimum`. */
export const spaetestes = (daten: readonly string[], minimum: string): string =>
  daten.reduce((max, d) => (d > max ? d : max), minimum);
