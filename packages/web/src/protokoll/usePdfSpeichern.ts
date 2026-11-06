import { notifications } from '@mantine/notifications';
import type { ProtokollDto, ProtokollPdfAntwort } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { pruefen } from '../warenApi';
import { mitLiveKopf } from './dokumentDaten';
import { blobHerunterladen, blobZuBase64, protokollPdfAblauf, type PdfMeldung } from './pdfAblauf';

const MELDUNG_ID = 'protokoll-pdf';

function melden(m: PdfMeldung) {
  const farbe = { laedt: 'blue', ok: 'green', warnung: 'orange', fehler: 'red' }[m.art];
  const alle = { id: MELDUNG_ID, message: m.text, color: farbe };
  if (m.art === 'laedt') {
    notifications.show({ ...alle, loading: true, autoClose: false, withCloseButton: false });
  } else {
    notifications.update({
      ...alle,
      loading: false,
      autoClose: m.art === 'ok' ? 6000 : 10000,
      withCloseButton: true,
    });
  }
}

/**
 * Creates the PDF of a closed protocol, stores it in OneDrive and falls back to a download when that
 * fails. The protocol is loaded again, so the frozen state of the closed protocol is what the PDF shows
 * (also when the page re-renders after closing). The PDF module is loaded on demand.
 */
export function useProtokollPdfSpeichern() {
  const api = useApi();
  return (id: string) =>
    protokollPdfAblauf({
      eingabe: async () => {
        const dto = (await unwrap(
          await api.protokolle[':id'].$get({ param: { id } }),
        )) as ProtokollDto;
        if (dto.status !== 'abgeschlossen')
          throw new Error('Das Protokoll ist nicht abgeschlossen.');
        return {
          inhalt: dto.inhalt,
          kopf: dto.kopf,
          ...mitLiveKopf(dto, dto.kopf),
          sitzung: dto.sitzung,
          naechsteSitzungVorschlag: dto.naechsteSitzungVorschlag,
        };
      },
      erzeugen: async (eingabe) => (await import('./pdf/pdfErzeugen')).protokollPdfBlob(eingabe),
      hochladen: async (dateiname, pdf) => {
        const res = await api.protokolle[':id'].pdf.$put({
          param: { id },
          json: { dateiname, base64: await blobZuBase64(pdf) } as never,
        });
        await pruefen(res);
        return ((await res.json()) as unknown as ProtokollPdfAntwort).pfad;
      },
      herunterladen: blobHerunterladen,
      melden,
    });
}
