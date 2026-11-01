import { mlZuLiter, type TrichterMitgliedDto } from '@c4/shared';

const LITER_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** Millilitres as German litres with at most 2 decimals: `1.500` -> `1,5 l`. */
export const literAnzeigen = (ml: number): string => `${LITER_FORMAT.format(mlZuLiter(ml))} l`;

/** Each participant's share of a Durchgang. */
export const jePersonMl = (volumenMl: number, teilnehmende: number): number =>
  teilnehmende > 0 ? volumenMl / teilnehmende : 0;

/** Display name of a member in a Trichter DTO: username, else "Vorname Nachname". */
export const trichterName = (m: Pick<TrichterMitgliedDto, 'username' | 'vorname' | 'nachname'>) =>
  m.username ?? (`${m.vorname} ${m.nachname}`.trim() || '–');

/** "Name (1,5 l, 4 Auslässe)" for the funnel select. */
export const trichterOptionLabel = (t: { name: string; volumenMl: number; auslaesse: number }) =>
  `${t.name} (${literAnzeigen(t.volumenMl)}, ${t.auslaesse} ${t.auslaesse === 1 ? 'Auslass' : 'Auslässe'})`;
