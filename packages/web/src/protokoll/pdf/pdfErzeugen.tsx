import { pdf } from '@react-pdf/renderer';
import normal from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import kursiv from '@fontsource/noto-sans/files/noto-sans-latin-400-italic.woff?url';
import fett from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import fettKursiv from '@fontsource/noto-sans/files/noto-sans-latin-700-italic.woff?url';
import type { DokumentEingabe } from '../dokumentDaten';
import { ProtokollPdf } from './ProtokollPdf';
import { schriftenRegistrieren } from './schriften';

/** Renders the minutes as PDF in the browser. Loaded lazily (react-pdf is big). */
export async function protokollPdfBlob(eingabe: DokumentEingabe): Promise<Blob> {
  schriftenRegistrieren({ normal, fett, kursiv, fettKursiv });
  return pdf(<ProtokollPdf eingabe={eingabe} />).toBlob();
}
