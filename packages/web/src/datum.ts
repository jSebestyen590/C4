/** Date and time formatting of instants in the club's time zone (de-DE, Europe/Berlin). */

const ZEITZONE = 'Europe/Berlin';

type Zeitpunkt = string | number | Date;

const alsDatum = (wert: Zeitpunkt): Date => (wert instanceof Date ? wert : new Date(wert));

const format = (optionen: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: ZEITZONE, ...optionen });

const DATUM = {
  /** `14.10.2026` */
  voll: format({ day: '2-digit', month: '2-digit', year: 'numeric' }),
  /** `14.10.26` */
  jahrKurz: format({ day: '2-digit', month: '2-digit', year: '2-digit' }),
};

const DATUM_ZEIT = {
  /** `14.10.2026 11:30` */
  voll: format({
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
  /** `14.10.26 11:30` */
  jahrKurz: format({
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }),
  /** `14.10. 11:30` */
  ohneJahr: format({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
  /** `14.10.2026, 11:30` */
  mittel: format({ dateStyle: 'medium', timeStyle: 'short' }),
  /** `14.10.2026, 11:30:05` */
  mittelSekunden: format({ dateStyle: 'medium', timeStyle: 'medium' }),
  /** `14.10.26, 11:30` */
  kurz: format({ dateStyle: 'short', timeStyle: 'short' }),
};

const ZEIT = format({ hour: '2-digit', minute: '2-digit' });

export type DatumStil = keyof typeof DATUM;
export type DatumZeitStil = keyof typeof DATUM_ZEIT;

/** Day of an instant: `14.10.2026` (or `14.10.26` with `jahrKurz`). */
export const formatDatum = (wert: Zeitpunkt, stil: DatumStil = 'voll'): string =>
  DATUM[stil].format(alsDatum(wert));

/** Day and time of an instant: `14.10.2026 11:30` (other styles see `DATUM_ZEIT`). */
export const formatDatumZeit = (wert: Zeitpunkt, stil: DatumZeitStil = 'voll'): string => {
  const text = DATUM_ZEIT[stil].format(alsDatum(wert));
  return stil === 'mittel' || stil === 'mittelSekunden' || stil === 'kurz'
    ? text
    : text.replace(',', '');
};

/** Time of an instant: `11:30`. */
export const formatZeit = (wert: Zeitpunkt): string => ZEIT.format(alsDatum(wert));
