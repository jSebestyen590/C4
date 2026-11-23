import { datumBerlin, type EventDto, type EventKategorieDto, type VorlageDto } from '@c4/shared';
import { unwrap, type useApi } from '../api';
import { ereignisFenster } from './bausteinLogik';
import { kategorieNamenBauen, type KategorieNamen } from './kategorieNamen';

/** Loads the Kategorie names for the headings outside of React (the PDF): same data as `useKategorieNamen`. */
export async function kategorieNamenLaden(
  api: ReturnType<typeof useApi>,
  sitzungBeginn: string,
): Promise<KategorieNamen> {
  const { von, bis } = ereignisFenster(datumBerlin(sitzungBeginn));
  const [kategorien, vorlagen, events] = await Promise.all([
    unwrap(await api.kalender.kategorien.$get({ query: { archiv: '1' } })) as Promise<
      EventKategorieDto[]
    >,
    unwrap(await api.kalender.vorlagen.$get({ query: { archiv: '1' } })) as Promise<VorlageDto[]>,
    unwrap(await api.kalender.events.$get({ query: { von, bis } })) as Promise<EventDto[]>,
  ]);
  return kategorieNamenBauen(kategorien, vorlagen, events);
}
