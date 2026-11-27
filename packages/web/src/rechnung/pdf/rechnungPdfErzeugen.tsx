import { pdf } from '@react-pdf/renderer';
import normal from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import kursiv from '@fontsource/noto-sans/files/noto-sans-latin-400-italic.woff?url';
import fett from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import fettKursiv from '@fontsource/noto-sans/files/noto-sans-latin-700-italic.woff?url';
import logo from '../../assets/logo-rechnung.png?url';
import type { RechnungDetailDto } from '@c4/shared';
import { schriftenRegistrieren } from '../../protokoll/pdf/schriften';
import { RechnungPdf } from './RechnungPdf';

/** Renders the invoice as PDF in the browser. Loaded lazily (react-pdf is big). */
export async function rechnungPdfBlob(rechnung: RechnungDetailDto): Promise<Blob> {
  schriftenRegistrieren({ normal, fett, kursiv, fettKursiv });
  return pdf(<RechnungPdf rechnung={rechnung} logo={logo} />).toBlob();
}
