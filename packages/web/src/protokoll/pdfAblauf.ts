import { druckTitel, type DokumentEingabe } from './dokumentDaten';

/** Progress and result messages of the PDF flow (shown as one notification). */
export type PdfMeldung =
  { art: 'laedt'; text: string } | { art: 'ok' | 'warnung' | 'fehler'; text: string };

export interface PdfAblaufDeps {
  /** The closed protocol as the document view shows it (freshly loaded, so the frozen snapshot counts). */
  eingabe(): Promise<DokumentEingabe>;
  erzeugen(eingabe: DokumentEingabe): Promise<Blob>;
  /** Stores the PDF in OneDrive; resolves to the path there, rejects when that fails. */
  hochladen(dateiname: string, pdf: Blob): Promise<string>;
  herunterladen(pdf: Blob, dateiname: string): void;
  melden(m: PdfMeldung): void;
}

export const PDF_ERSTELLEN_TEXT = 'PDF wird erstellt …';
export const PDF_ERSTELLEN_FEHLER =
  'Das PDF konnte nicht erstellt werden. Das Protokoll ist trotzdem abgeschlossen.';
export const PDF_ONEDRIVE_FEHLER =
  'OneDrive nicht erreichbar – das PDF wurde stattdessen heruntergeladen.';

/**
 * Creates the PDF of a closed protocol and stores it in OneDrive. If OneDrive does not work, the PDF is
 * downloaded instead. Never throws; the result tells what happened.
 */
export async function protokollPdfAblauf(
  d: PdfAblaufDeps,
): Promise<'gespeichert' | 'heruntergeladen' | 'fehler'> {
  d.melden({ art: 'laedt', text: PDF_ERSTELLEN_TEXT });
  let pdf: Blob;
  let dateiname: string;
  try {
    const eingabe = await d.eingabe();
    dateiname = `${druckTitel(eingabe.sitzung)}.pdf`;
    pdf = await d.erzeugen(eingabe);
  } catch (err) {
    console.error('Creating the protocol PDF failed', err);
    d.melden({ art: 'fehler', text: PDF_ERSTELLEN_FEHLER });
    return 'fehler';
  }
  try {
    const pfad = await d.hochladen(dateiname, pdf);
    d.melden({ art: 'ok', text: `Protokoll als PDF in OneDrive gespeichert: ${pfad}` });
    return 'gespeichert';
  } catch (err) {
    console.error('Saving the protocol PDF to OneDrive failed', err);
  }
  try {
    d.herunterladen(pdf, dateiname);
    d.melden({ art: 'warnung', text: PDF_ONEDRIVE_FEHLER });
    return 'heruntergeladen';
  } catch (err) {
    console.error('Downloading the protocol PDF failed', err);
    d.melden({
      art: 'fehler',
      text: 'Das PDF konnte weder in OneDrive gespeichert noch heruntergeladen werden.',
    });
    return 'fehler';
  }
}

/** Offers a Blob as download through a temporary link. */
export function blobHerunterladen(pdf: Blob, dateiname: string): void {
  const url = URL.createObjectURL(pdf);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Base64 (standard alphabet) of a Blob. */
export async function blobZuBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binaer = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binaer);
}
