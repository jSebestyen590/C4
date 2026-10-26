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
