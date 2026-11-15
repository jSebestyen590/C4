import { useState } from 'react';
import type { FeldReihenfolge } from './feldReihenfolge';

const KEY = 'c4.finanzen.feldReihenfolge';

function lesen(): FeldReihenfolge {
  try {
    return localStorage.getItem(KEY) === 'spalten' ? 'spalten' : 'zeilen';
  } catch {
    return 'zeilen';
  }
}

/** The walking order of multi-column count tables, remembered per browser (default: row by row). */
export function useFeldReihenfolge(): [FeldReihenfolge, (m: FeldReihenfolge) => void] {
  const [modus, setModus] = useState<FeldReihenfolge>(lesen);
  const setzen = (m: FeldReihenfolge) => {
    setModus(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // storage unavailable: the choice only lasts for this page
    }
  };
  return [modus, setzen];
}
