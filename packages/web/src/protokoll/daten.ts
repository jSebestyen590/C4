import { useMemo } from 'react';
import { datumAnzeigen, datumBerlin, type EventDto } from '@c4/shared';
import {
  eventDatenAusVorlage,
  ereignisFenster,
  kommendeEvents,
  vergangeneEvents,
} from './bausteinLogik';
import { useProtokollKontext } from './kontext';
import type { SlashDaten } from './slashLogik';
import { useEventKategorien, useKalenderEvents, useVorlagen, vorlageTitel } from '../kalenderDaten';

/** Calendar events around the Sitzung, split into past and upcoming (one shared query). */
export function useProtokollEvents() {
  const { sitzungBeginn } = useProtokollKontext();
  const { von, bis } = ereignisFenster(datumBerlin(sitzungBeginn));
  const q = useKalenderEvents(von, bis);
  const events = q.data;
  return useMemo(
    () => ({
      laedt: q.isPending,
      alle: events ?? [],
      vergangene: vergangeneEvents(events ?? [], sitzungBeginn),
      kommende: kommendeEvents(events ?? [], sitzungBeginn),
    }),
    [events, q.isPending, sitzungBeginn],
  );
}

export const eventDatumText = (e: Pick<EventDto, 'beginn'>): string =>
  datumAnzeigen(datumBerlin(e.beginn));

/** Data of the slash menu: active Vorlagen and past events, with the Baustein fields they create. */
export function useSlashDaten(): SlashDaten {
  const vorlagen = useVorlagen();
  const kategorien = useEventKategorien();
  const events = useProtokollEvents();
  return useMemo(
    () => ({
      vorlagen: (vorlagen.data ?? []).map((v) => {
        const titel = vorlageTitel(v, kategorien.liste);
        const kategorie = kategorien.liste.find((k) => k.id === v.kategorieId);
        return {
          id: v.id,
          titel,
          beschreibung: kategorie?.name ?? '',
          daten: eventDatenAusVorlage(v, kategorie, titel),
        };
      }),
      vergangene: events.vergangene.map((e) => ({
        id: e.id,
        titel: e.anzeigeTitel,
        beschreibung: eventDatumText(e),
        daten: { eventId: e.id, name: e.anzeigeTitel, datum: datumBerlin(e.beginn) },
      })),
    }),
    [vorlagen.data, kategorien.liste, events.vergangene],
  );
}
