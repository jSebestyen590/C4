import { datumAnzeigen, datumBerlin, zeitBerlin } from '@c4/shared';

const wochentagFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  weekday: 'short',
});

/** Short weekday ("Fr") of an instant in Europe/Berlin. */
export const wochentag = (iso: string): string => wochentagFormat.format(new Date(iso));

/** "Fr, 31.10.2026" */
export const tagAnzeigen = (iso: string): string =>
  `${wochentag(iso)}, ${datumAnzeigen(datumBerlin(iso))}`;

/** "Fr, 31.10.2026 20:00–23:00", with both dates when the event spans midnight. */
export function zeitraumAnzeigen(beginn: string, ende: string): string {
  if (datumBerlin(beginn) === datumBerlin(ende)) {
    return `${tagAnzeigen(beginn)} ${zeitBerlin(beginn)}–${zeitBerlin(ende)}`;
  }
  return `${tagAnzeigen(beginn)} ${zeitBerlin(beginn)} – ${tagAnzeigen(ende)} ${zeitBerlin(ende)}`;
}

/**
 * Short range for lists: "Sa, 01.11. 20:00 – 01:00" (no year, the end only as a time since events last
 * at most 24 hours).
 */
export function zeitraumKurz(beginn: string, ende: string): string {
  const tag = `${wochentag(beginn)}, ${datumAnzeigen(datumBerlin(beginn)).slice(0, 6)}`;
  return `${tag} ${zeitBerlin(beginn)} – ${zeitBerlin(ende)}`;
}

/** First and last day (`YYYY-MM-DD`) of a month; `monat` is 0-based. */
export function monatsGrenzen(jahr: number, monat: number): { erster: string; letzter: string } {
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return {
    erster: f(new Date(Date.UTC(jahr, monat, 1))),
    letzter: f(new Date(Date.UTC(jahr, monat + 1, 0))),
  };
}

export const tageDazu = (datum: string, tage: number): string => {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
};

/** Day count since Monday (0 = Mo ... 6 = So) of a `YYYY-MM-DD` date. */
export const wochentagIndex = (datum: string): number =>
  (new Date(`${datum}T00:00:00Z`).getUTCDay() + 6) % 7;

/** All days (Mo-first weeks) a month grid shows for the given month (0-based). */
export function monatsRaster(jahr: number, monat: number): string[] {
  const { erster, letzter } = monatsGrenzen(jahr, monat);
  const start = tageDazu(erster, -wochentagIndex(erster));
  const ende = tageDazu(letzter, 6 - wochentagIndex(letzter));
  const tage: string[] = [];
  for (let t = start; t <= ende; t = tageDazu(t, 1)) tage.push(t);
  return tage;
}

const monatFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});
export const monatAnzeigen = (jahr: number, monat: number): string =>
  monatFormat.format(new Date(Date.UTC(jahr, monat, 1)));

const EINHEITEN = [
  { minuten: 7 * 24 * 60, eins: 'Woche', viele: 'Wochen' },
  { minuten: 24 * 60, eins: 'Tag', viele: 'Tage' },
  { minuten: 60, eins: 'Stunde', viele: 'Stunden' },
  { minuten: 1, eins: 'Minute', viele: 'Minuten' },
] as const;

/** "1 Woche vorher", "2 Tage vorher", "3 Stunden vorher": the largest unit that divides evenly. */
export function erinnerungText(minuten: number): string {
  const einheit = EINHEITEN.find((e) => minuten % e.minuten === 0) ?? EINHEITEN[3];
  const anzahl = minuten / einheit.minuten;
  return `${anzahl} ${anzahl === 1 ? einheit.eins : einheit.viele} vorher`;
}

const MONAT_MUSTER = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Parses the `monat` query value `YYYY-MM` into year and 0-based month; `null` if absent or invalid. */
export function monatAusSuche(wert: string | null): { jahr: number; monat: number } | null {
  const m = MONAT_MUSTER.exec(wert ?? '');
  return m ? { jahr: Number(m[1]), monat: Number(m[2]) - 1 } : null;
}

/** `YYYY-MM` for the `monat` query value. */
export const monatSuche = (jahr: number, monat: number): string =>
  `${jahr}-${String(monat + 1).padStart(2, '0')}`;

/** Link to the calendar showing the month of a date (`YYYY-MM-DD`); plain `/kalender` without a valid date. */
export const kalenderLink = (datum: string | null | undefined): string => {
  const monat = datum?.slice(0, 7) ?? '';
  return MONAT_MUSTER.test(monat) ? `/kalender?monat=${monat}` : '/kalender';
};
