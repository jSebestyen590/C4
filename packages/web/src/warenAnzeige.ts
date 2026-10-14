import {
  mhdAnzeigen,
  pfad,
  type BaumKnoten,
  type BuchungsArt,
  type Gebinde,
  type MhdArt,
  vergleicheBuchungsZeilen,
} from '@c4/shared';
import { BUCHUNGS_ART_LABELS } from './i18n';

/** `14.10.2026 11:30` in the club's time zone. */
export function zeitAnzeigen(iso: string): string {
  return new Date(iso)
    .toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '');
}

export interface ZeileDaten {
  lagerortId: string;
  gebindeId: string;
  mhd: string | null;
  menge: number;
  art: BuchungsArt;
}

/** `Abgang −7 × 0,5l Flasche · MHD 02.2027 · Lager › Platz` */
export function zeileText(
  z: ZeileDaten,
  mhdArt: MhdArt,
  gebinde: Gebinde[],
  lagerorte: BaumKnoten[],
): string {
  const name = gebinde.find((g) => g.id === z.gebindeId)?.name ?? '?';
  const vorzeichen = z.menge < 0 ? '−' : '+';
  const mhd = mhdAnzeigen(z.mhd, mhdArt);
  return [
    `${BUCHUNGS_ART_LABELS[z.art]} ${vorzeichen}${Math.abs(z.menge)} × ${name}`,
    mhd && `MHD ${mhd}`,
    pfad(lagerorte, z.lagerortId),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Booking lines in display order: by art, then Lagerort path, Gebinde name and MHD. */
export function zeilenSortieren<T extends ZeileDaten>(
  zeilen: T[],
  gebinde: Gebinde[],
  lagerorte: BaumKnoten[],
): T[] {
  const name = (z: T) => gebinde.find((g) => g.id === z.gebindeId)?.name ?? '';
  return [...zeilen].sort(
    (a, b) =>
      vergleicheBuchungsZeilen(a, b) ||
      pfad(lagerorte, a.lagerortId).localeCompare(pfad(lagerorte, b.lagerortId), 'de') ||
      name(a).localeCompare(name(b), 'de') ||
      (a.mhd ?? '').localeCompare(b.mhd ?? ''),
  );
}
