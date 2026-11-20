import { createContext, useContext } from 'react';
import { useSteuersatzZeitraeume } from './finanzenDaten';
import { heuteBerlin, steuersaetzeAm, type SteuersaetzeAm } from '@c4/shared';

/**
 * The tax rates the item rows of a Beleg offer: those valid on its Belegdatum. The Beleg page
 * provides them; without a provider the rates of today with the fallback periods count.
 */
export const SteuersaetzeKontext = createContext<SteuersaetzeAm>(steuersaetzeAm([], heuteBerlin()));

export const useSteuersaetze = (): SteuersaetzeAm => useContext(SteuersaetzeKontext);

/** `1900` -> `19 %`, `550` -> `5,5 %`. */
export const satzProzent = (satz: number): string => `${(satz / 100).toLocaleString('de-DE')} %`;

/** Select options for the rates of a date, highest first. */
export const satzOptionen = (saetze: readonly number[], kurz = false) =>
  saetze.map((s) => ({
    value: String(s),
    label: kurz ? (s / 100).toLocaleString('de-DE') : satzProzent(s),
  }));

/** The rates valid today (for labels like "Regelsatz (19 %)"); the fallback rates until the periods are loaded. */
export function useHeutigeSaetze(): SteuersaetzeAm {
  const zeitraeume = useSteuersatzZeitraeume();
  return steuersaetzeAm(zeitraeume.data ?? [], heuteBerlin());
}

/** Options for the Art of a default tax rate, with today's rates in brackets. */
export const artOptionen = (heute: Pick<SteuersaetzeAm, 'regel' | 'ermaessigt'>) => [
  { value: 'regel', label: `Regelsatz (${satzProzent(heute.regel)})` },
  { value: 'ermaessigt', label: `Ermäßigt (${satzProzent(heute.ermaessigt)})` },
  { value: 'keine', label: 'Keine (0 %)' },
];
