import { Document, Page, Text, View } from '@react-pdf/renderer';
import { druckTitel, type DokumentEingabe } from '../dokumentDaten';
import { BlockBaumAnsicht, blockBaum, pdfBloecke, stile } from './pdfBloecke';

/**
 * The PDF of the minutes: the same content as the document view (`ProtokollDokumentAnsicht`) on A4
 * pages with page numbers and a bookmark outline (sections > headings > sub-headings, no votes).
 * The fonts must be registered before rendering (see `schriftenRegistrieren`).
 */
export function ProtokollPdf({ eingabe }: Readonly<{ eingabe: DokumentEingabe }>) {
  const baum = blockBaum(pdfBloecke(eingabe));
  return (
    <Document title={druckTitel(eingabe.sitzung)} language="de-DE" creator="C4" producer="C4">
      <Page size="A4" style={stile.seite}>
        <BlockBaumAnsicht knoten={baum} />
        <View style={stile.fuss} fixed>
          <Text
            style={stile.fussText}
            render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
