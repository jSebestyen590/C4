import { kategorieSchema } from '@c4/shared';
import { unwrap, useApi } from './api';
import { BaumVerwaltung, type BaumKonfiguration } from './BaumVerwaltung';
import { pruefen } from './warenApi';

/** Tree of the Inventar Kategorien (sorted by name). */
export function KategorienTab() {
  const api = useApi();
  const kategorien = api.inventar.kategorien;
  const konfig: BaumKonfiguration = {
    texte: { singular: 'Kategorie', plural: 'Kategorien', unter: 'Unterkategorie', genus: 'w' },
    queryKey: ['inventar', 'kategorien'],
    invalidieren: ['inventar', 'kategorien'],
    recht: 'inventar:verwalten',
    schema: kategorieSchema,
    api: {
      laden: async () => unwrap(await kategorien.$get({ query: { archiv: '1' } })),
      speichern: async (id, json) =>
        pruefen(
          id
            ? await kategorien[':id'].$put({ param: { id }, json })
            : await kategorien.$post({ json }),
        ),
      archivieren: async (id, archiviert) =>
        pruefen(await kategorien[':id'].archiv.$put({ param: { id }, json: { archiviert } })),
      loeschen: async (id) => pruefen(await kategorien[':id'].$delete({ param: { id } })),
    },
  };
  return <BaumVerwaltung konfig={konfig} />;
}
