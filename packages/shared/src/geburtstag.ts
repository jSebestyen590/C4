import { z } from 'zod';
import type { Anrede } from './anrede';
import type { MitgliedStatus } from './status';

// Birthdays are pure calendar dates (`YYYY-MM-DD`); no time zones involved.

const teile = (iso: string): [number, number, number] =>
  iso.split('-').map(Number) as [number, number, number];

const schaltjahr = (jahr: number): boolean =>
  (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;

const zweistellig = (n: number): string => String(n).padStart(2, '0');

/** The birthday in `jahr`; a Feb 29 birthday falls on Feb 28 in non-leap years. */
export function geburtstagIn(geburtsdatum: string, jahr: number): string {
  const [, monat, tag] = teile(geburtsdatum);
  const t = monat === 2 && tag === 29 && !schaltjahr(jahr) ? 28 : tag;
  return `${String(jahr).padStart(4, '0')}-${zweistellig(monat)}-${zweistellig(t)}`;
}

/** Age in full years on `datum` (a Feb 29 birthday counts from Feb 28 in non-leap years). */
export function alterAm(geburtsdatum: string, datum: string): number {
  const jahr = teile(datum)[0];
  const alter = jahr - teile(geburtsdatum)[0];
  return geburtstagIn(geburtsdatum, jahr) <= datum ? alter : alter - 1;
}

/** Birthdays within `von`..`bis` (inclusive), sorted by date; the age is the one reached then. */
export function geburtstageZwischen<T extends { geburtsdatum: string }>(
  personen: readonly T[],
  von: string,
  bis: string,
): { datum: string; alter: number; person: T }[] {
  const ergebnis: { datum: string; alter: number; person: T }[] = [];
  for (let jahr = teile(von)[0]; jahr <= teile(bis)[0]; jahr++) {
    for (const person of personen) {
      const datum = geburtstagIn(person.geburtsdatum, jahr);
      if (datum < von || datum > bis) continue;
      ergebnis.push({ datum, alter: jahr - teile(person.geburtsdatum)[0], person });
    }
  }
  return ergebnis.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** One birthday as the calendar shows it (`GET /api/kalender/geburtstage`). */
export interface GeburtstagDto {
  /** The date of the birthday, `YYYY-MM-DD`. */
  datum: string;
  /** Age reached on that day. */
  alter: number;
  mitglied: {
    sub: string;
    username: string | null;
    vorname: string;
    nachname: string;
    status: MitgliedStatus;
    anrede: Anrede;
  };
}

/** Longest range the birthday route answers for. */
export const GEBURTSTAGE_MAX_TAGE = 400;

const tage = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Query of `GET /api/kalender/geburtstage`: `von` <= `bis`, at most 400 days apart. */
export const geburtstageZeitraumSchema = z
  .object({ von: z.iso.date(), bis: z.iso.date() })
  .refine((v) => v.bis >= v.von, { message: 'Das Ende liegt vor dem Beginn.', path: ['bis'] })
  .refine((v) => tage(v.bis) - tage(v.von) <= GEBURTSTAGE_MAX_TAGE, {
    message: `Der Zeitraum darf höchstens ${GEBURTSTAGE_MAX_TAGE} Tage umfassen.`,
    path: ['bis'],
  });
