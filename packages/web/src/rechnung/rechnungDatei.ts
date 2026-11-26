import type { RechnungDetailDto, RechnungUploadDto } from '@c4/shared';
import { hexVon } from '../belegFormular';
import { jsonOderFehler } from '../finanzenDaten';

/** `Rechnung` / `Stornorechnung`. */
export const rechnungTitel = (r: Pick<RechnungDetailDto, 'istStorno'>) =>
  r.istStorno ? 'Stornorechnung' : 'Rechnung';

/** File name of the downloaded PDF: `Rechnung-001-2027.pdf`. */
export const rechnungDateiname = (r: Pick<RechnungDetailDto, 'istStorno' | 'nummer'>) =>
  `${rechnungTitel(r)}-${r.nummer}.pdf`;

/** Lower-case hex SHA-256 of a blob. */
export async function sha256Von(blob: Blob): Promise<string> {
  return hexVon(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}

/** PUT of the PDF to the presigned URL; both headers are signed. */
function hochladenAnS3(upload: RechnungUploadDto, blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', upload.uploadUrl);
    xhr.setRequestHeader('Content-Type', 'application/pdf');
    xhr.setRequestHeader('x-amz-checksum-sha256', upload.checksumSha256);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error('Der Upload des PDFs ist fehlgeschlagen. Bitte versuch es noch einmal.'),
          );
    xhr.onerror = () =>
      reject(new Error('Der Upload des PDFs ist fehlgeschlagen. Bitte prüfe deine Verbindung.'));
    xhr.send(blob);
  });
}

/** The two API calls the archive upload needs (a typed client's responses fit this shape). */
export interface RechnungDateiApi {
  upload: (body: { rechnungId: string; sha256: string; groesse: number }) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
  registrieren: (body: { sha256: string; groesse: number }) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

/** Uploads the PDF of a Rechnung into the archive and registers it at the Rechnung. */
export async function rechnungPdfArchivieren(
  rechnungId: string,
  blob: Blob,
  api: RechnungDateiApi,
): Promise<void> {
  const sha256 = await sha256Von(blob);
  const groesse = blob.size;
  const upload = await jsonOderFehler<RechnungUploadDto>(
    await api.upload({ rechnungId, sha256, groesse }),
  );
  await hochladenAnS3(upload, blob);
  await jsonOderFehler(await api.registrieren({ sha256, groesse }));
}
