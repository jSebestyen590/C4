import { useMemo } from 'react';
import { useEventKategorien, useVorlagen } from '../kalenderDaten';
import { useProtokollEvents } from './daten';
import { kategorieNamenBauen, type KategorieNamen } from './kategorieNamen';

/** Lookup for the live views: queries are shared with the forms (Kategorien, Vorlagen, events around the Sitzung). */
export function useKategorieNamen(sitzungBeginn: string): KategorieNamen {
  const kategorien = useEventKategorien();
  const vorlagen = useVorlagen(true);
  const events = useProtokollEvents(sitzungBeginn);
  return useMemo(
    () => kategorieNamenBauen(kategorien.liste, vorlagen.data ?? [], events.alle),
    [kategorien.liste, vorlagen.data, events.alle],
  );
}
