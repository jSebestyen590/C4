import { warengruppeSchema } from '@c4/shared';
import { unwrap, useApi } from './api';
import { BaumVerwaltung, type BaumKonfiguration } from './BaumVerwaltung';
import { pruefen } from './warenApi';
import { warengruppeKeys } from './warenDaten';

/** Tree of Warengruppen (sorted by name). */
export function WarengruppenTab() {
  const api = useApi();
  const konfig: BaumKonfiguration = {
    texte: { singular: 'Warengruppe', plural: 'Warengruppen', unter: 'Untergruppe', genus: 'w' },
    queryKey: warengruppeKeys.liste,
    invalidieren: warengruppeKeys.alle,
    recht: 'waren:verwalten',
    schema: warengruppeSchema,
    api: {
      laden: async () => unwrap(await api.warengruppen.$get({ query: { archiv: '1' } })),
      speichern: async (id, json) =>
        pruefen(
          id
            ? await api.warengruppen[':id'].$put({ param: { id }, json })
            : await api.warengruppen.$post({ json }),
        ),
      archivieren: async (id, archiviert) =>
        pruefen(await api.warengruppen[':id'].archiv.$put({ param: { id }, json: { archiviert } })),
      loeschen: async (id) => pruefen(await api.warengruppen[':id'].$delete({ param: { id } })),
    },
  };
  return <BaumVerwaltung konfig={konfig} />;
}
