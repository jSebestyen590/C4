import { datumAnzeigen, datumBerlin, zeitBerlin, type EventDauer } from '@c4/shared';

const wochentagFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  weekday: 'short',
});

/** Short weekday ("Fr") of an instant in Europe/Berlin. */
export const wochentag = (iso: string): string => wochentagFormat.format(new Date(iso));

/** "Fr, 31.10.2026" */
export const tagAnzeigen = (iso: string): string =>
  `${wochentag(iso)}, ${datumAnzeigen(datumBerlin(iso))}`;

/** Last calendar day of an event: an end at midnight belongs to the day before. */
const letzterTag = (beginn: string, ende: string): string => {
  const tag = datumBerlin(ende);
  return zeitBerlin(ende) === '00:00' && tag > datumBerlin(beginn) ? tageDazu(tag, -1) : tag;
};

/**
 * Berlin days an event appears on in the calendar: one-day events on their start day only (also
 * when they end after midnight), multi-day and whole-day events on every day they cover.
 */
export function eventTage(e: { beginn: string; ende: string; dauer: EventDauer }): string[] {
  const erster = datumBerlin(e.beginn);
  if (e.dauer === 'eintaegig') return [erster];
  const tage: string[] = [];
  for (let t = erster; t <= letzterTag(e.beginn, e.ende) && tage.length < 62; t = tageDazu(t, 1)) {
    tage.push(t);
  }
  return tage;
}

/**
 * "Fr, 31.10.2026 20:00–23:00", with both dates when the event spans midnight; whole days as
 * "Fr, 10.07.2026 – So, 12.07.2026" (or one date with "ganztägig").
 */
export function zeitraumAnzeigen(beginn: string, ende: string, dauer?: EventDauer): string {
  if (dauer === 'ganztaegig') {
    const letzter = letzterTag(beginn, ende);
    return letzter === datumBerlin(beginn)
      ? `${tagAnzeigen(beginn)}, ganztägig`
      : `${tagAnzeigen(beginn)} – ${tagAnzeigen(`${letzter}T12:00:00Z`)}`;
  }
  if (datumBerlin(beginn) === datumBerlin(ende)) {
    return `${tagAnzeigen(beginn)} ${zeitBerlin(beginn)}–${zeitBerlin(ende)}`;
  }
  return `${tagAnzeigen(beginn)} ${zeitBerlin(beginn)} – ${tagAnzeigen(ende)} ${zeitBerlin(ende)}`;
}

/**
 * Short range for lists: "Sa, 01.11. 20:00 – 01:00" (no year; for one-day events the end only as a
 * time). Multi-day events show both days ("Fr, 10.07. 18:00 – So, 12.07. 14:00"), whole days no
 * times ("Fr, 10.07. – So, 12.07.").
 */
export function zeitraumKurz(beginn: string, ende: string, dauer?: EventDauer): string {
  const kurz = (iso: string) => `${wochentag(iso)}, ${datumAnzeigen(datumBerlin(iso)).slice(0, 6)}`;
  if (dauer === 'ganztaegig') {
    const letzter = letzterTag(beginn, ende);
    return letzter === datumBerlin(beginn)
      ? `${kurz(beginn)} ganztägig`
      : `${kurz(beginn)} – ${kurz(`${letzter}T12:00:00Z`)}`;
  }
  if (dauer === 'mehrtaegig') {
    return `${kurz(beginn)} ${zeitBerlin(beginn)} – ${kurz(ende)} ${zeitBerlin(ende)}`;
  }
  return `${kurz(beginn)} ${zeitBerlin(beginn)} – ${zeitBerlin(ende)}`;
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
