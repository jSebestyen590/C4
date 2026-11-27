import { useQueryClient } from '@tanstack/react-query';
import { unwrap, useApi } from '../api';
import { finanzenKeys } from '../finanzenDaten';
import { rechnungPdfArchivieren } from './rechnungDatei';

/**
 * Returns a function that renders the PDF of a stored Rechnung in the browser (react-pdf is loaded
 * on demand), uploads it into the archive and registers it at the Rechnung. Throws on failure; the
 * detail page then offers "PDF erzeugen" again.
 */
export function useRechnungPdfErzeugen() {
  const api = useApi();
  const qc = useQueryClient();
  return async (rechnungId: string): Promise<void> => {
    const rechnung = await unwrap(
      await api.finanzen.rechnungen[':id'].$get({ param: { id: rechnungId } }),
    );
    const { rechnungPdfBlob } = await import('./pdf/rechnungPdfErzeugen');
    const blob = await rechnungPdfBlob(rechnung);
    await rechnungPdfArchivieren(rechnungId, blob, {
      upload: (json) => api.finanzen['rechnung-dateien'].upload.$post({ json }),
      registrieren: (json) =>
        api.finanzen.rechnungen[':id'].datei.$post({ param: { id: rechnungId }, json }),
    });
    void qc.invalidateQueries({ queryKey: finanzenKeys.rechnung(rechnungId) });
  };
}
