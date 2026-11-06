import { Document, Page, Text, View } from '@react-pdf/renderer';
import { druckTitel, type DokumentEingabe } from '../dokumentDaten';
import { blockBaum, pdfBloecke, stile, type BlockBaumKnoten } from './pdfBloecke';

/** Props that make an element an outline entry (nested by the element tree). */
const bookmark = (title: string, expanded: boolean): object => ({
  bookmark: { title, fit: true, expanded },
});

function Baum({ knoten }: Readonly<{ knoten: BlockBaumKnoten[] }>) {
  return (
    <>
      {knoten.map((k, i) => {
        if (!(k.block.ebene && k.block.titel)) {
          return (
            <View key={i}>
              {k.block.element}
              <Baum knoten={k.kinder} />
            </View>
          );
        }
        // Keeps the heading together with the block after it (no heading alone at the page end).
        const [erstes, ...rest] = k.kinder;
        const zusammen = erstes && !erstes.block.ebene ? erstes : undefined;
        return (
          // The wrapper carries the bookmark; nesting the Views nests the outline.
          <View
            key={i}
            // react-pdf resolves `bookmark` on any element, its typings only know it on Page.
            {...bookmark(k.block.titel, k.block.ebene === 1)}
          >
            {zusammen ? (
              <View wrap={false}>
                {k.block.element}
                {zusammen.block.element}
              </View>
            ) : (
              k.block.element
            )}
            <Baum knoten={zusammen ? [...zusammen.kinder, ...rest] : k.kinder} />
          </View>
        );
      })}
    </>
  );
}

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
        <Baum knoten={baum} />
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
