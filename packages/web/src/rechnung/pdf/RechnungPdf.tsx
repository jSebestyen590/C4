import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  centAnzeigen,
  datumAnzeigen,
  rechnungTextFuellen,
  type RechnungDetailDto,
} from '@c4/shared';
import { anzahlText } from '../../belegFormular';
import { PDF_SCHRIFT } from '../../protokoll/pdf/schriften';
import { rechnungTitel } from '../rechnungDatei';

const GEDAEMPFT = '#555555';
const LINIE = '#999999';

const stile = StyleSheet.create({
  seite: {
    fontFamily: PDF_SCHRIFT,
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 130,
    paddingHorizontal: 56,
  },
  absenderzeile: {
    fontSize: 7.5,
    color: GEDAEMPFT,
    borderBottomWidth: 0.5,
    borderBottomColor: LINIE,
    paddingBottom: 1,
    marginBottom: 4,
    width: 250,
  },
  logo: { alignSelf: 'flex-end', width: 67, height: 55, marginBottom: 6 },
  kopf: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 100 },
  anschrift: { width: 250 },
  info: { width: 190, fontSize: 9.5 },
  infoZeile: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
  titel: { fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 2 },
  bezug: { color: GEDAEMPFT, marginBottom: 2 },
  betreff: { fontWeight: 700, marginTop: 10, marginBottom: 6 },
  absatz: { marginBottom: 8 },
  tabelleKopf: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: '#000000',
    paddingBottom: 2,
    fontWeight: 700,
    fontSize: 9,
  },
  tabelleZeile: {
    flexDirection: 'row',
    borderBottomWidth: 0.25,
    borderBottomColor: LINIE,
    paddingVertical: 3,
  },
  spPos: { width: 24 },
  spText: { flexGrow: 1, flexShrink: 1, paddingRight: 6 },
  spAnzahl: { width: 44, textAlign: 'right' },
  spPreis: { width: 70, textAlign: 'right' },
  spSatz: { width: 40, textAlign: 'right' },
  spBetrag: { width: 72, textAlign: 'right' },
  klein: { fontSize: 8.5, color: GEDAEMPFT },
  summen: { marginTop: 8, alignSelf: 'flex-end', width: 250 },
  summenZeile: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
  gesamt: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.75,
    borderTopColor: '#000000',
    marginTop: 3,
    paddingTop: 3,
    fontWeight: 700,
    fontSize: 11,
  },
  fuss: {
    position: 'absolute',
    bottom: 28,
    left: 56,
    right: 56,
    borderTopWidth: 0.5,
    borderTopColor: LINIE,
    paddingTop: 5,
    fontSize: 7.5,
    color: GEDAEMPFT,
  },
  fussSpalten: { flexDirection: 'row', justifyContent: 'space-between' },
  fussSpalte: { flex: 1, paddingRight: 8 },
  seitenzahl: { textAlign: 'right', marginTop: 3 },
});

const satzText = (satz: number) => `${(satz / 100).toLocaleString('de-DE')} %`;
const zeilen = (text: string) => text.split(/\r?\n/).filter((z) => z.trim() !== '');

/**
 * The invoice PDF from the stored snapshot of a Rechnung (`RechnungDetailDto`), DIN 5008 like:
 * sender line, recipient address, number and dates, items (the deposit of a Ware as its own line),
 * net and tax per rate, total, payment terms and a footer with the club's data. A Stornorechnung
 * has its own title, the reference to the cancelled Rechnung and negative amounts. The fonts must
 * be registered before rendering (see `schriftenRegistrieren`).
 */
// Note: no `lineHeight` on the Page style. Together with a `render` Text (page number) react-pdf
// drops the whole fixed footer (and the Text), so no Vorstand etc. appeared on the invoice.
export function RechnungPdf({
  rechnung: r,
  logo,
}: Readonly<{ rechnung: RechnungDetailDto; logo?: string }>) {
  const v = r.verein;
  const preisArt = r.modus === 'netto' ? 'netto' : 'brutto';
  const netto = r.summen.reduce((s, x) => s + x.netto, 0);
  return (
    <Document
      title={`${rechnungTitel(r)} ${r.nummer}`}
      author={v.vereinsname}
      language="de-DE"
      creator="C4"
      producer="C4"
    >
      <Page size="A4" style={stile.seite}>
        {logo && <Image src={logo} style={stile.logo} />}
        <View style={stile.kopf}>
          <View style={stile.anschrift}>
            <Text style={stile.absenderzeile}>
              {v.vereinsname} · {zeilen(v.anschrift).join(', ')}
            </Text>
            <Text style={{ fontWeight: 700 }}>{r.empfaengerName}</Text>
            {zeilen(r.empfaengerAnschrift).map((z, i) => (
              <Text key={i}>{z}</Text>
            ))}
            {r.empfaengerUstId && <Text>USt-IdNr.: {r.empfaengerUstId}</Text>}
          </View>
          <View style={stile.info}>
            <View style={stile.infoZeile}>
              <Text>{r.istStorno ? 'Stornorechnung Nr.' : 'Rechnungsnummer'}</Text>
              <Text style={{ fontWeight: 700 }}>{r.nummer}</Text>
            </View>
            <View style={stile.infoZeile}>
              <Text>Rechnungsdatum</Text>
              <Text>{datumAnzeigen(r.rechnungsdatum)}</Text>
            </View>
            <View style={stile.infoZeile}>
              <Text>{r.leistungBis ? 'Leistungszeitraum' : 'Leistungsdatum'}</Text>
              <Text>
                {datumAnzeigen(r.leistungVon)}
                {r.leistungBis ? ` – ${datumAnzeigen(r.leistungBis)}` : ''}
              </Text>
            </View>
            {!r.istStorno && (
              <View style={stile.infoZeile}>
                <Text>Fällig am</Text>
                <Text>{datumAnzeigen(r.faelligAm)}</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={stile.titel}>
          {rechnungTitel(r)} {r.nummer}
        </Text>
        {r.stornoVon && (
          <Text style={stile.bezug}>
            zu Rechnung {r.stornoVon.nummer} vom {datumAnzeigen(r.stornoVon.rechnungsdatum)}
          </Text>
        )}
        {r.stornoBegruendung && <Text style={stile.bezug}>Grund: {r.stornoBegruendung}</Text>}
        <Text style={stile.betreff}>{r.betreff}</Text>
        {r.einleitung && <Text style={stile.absatz}>{r.einleitung}</Text>}

        <View style={stile.tabelleKopf} fixed>
          <Text style={stile.spPos}>Pos.</Text>
          <Text style={stile.spText}>Bezeichnung</Text>
          <Text style={stile.spAnzahl}>Anzahl</Text>
          <Text style={stile.spPreis}>{`Einzelpreis\n(${preisArt})`}</Text>
          <Text style={stile.spSatz}>USt</Text>
          <Text style={stile.spBetrag}>Betrag</Text>
        </View>
        {r.posten.map((p) => (
          <View key={p.pos} wrap={false}>
            <View style={stile.tabelleZeile}>
              <Text style={stile.spPos}>{p.pos}</Text>
              <View style={stile.spText}>
                <Text>{p.text}</Text>
                {p.einheit && <Text style={stile.klein}>{p.einheit}</Text>}
              </View>
              <Text style={stile.spAnzahl}>{anzahlText(p.anzahlMilli)}</Text>
              <Text style={stile.spPreis}>{centAnzeigen(p.einzelpreisCent)}</Text>
              <Text style={stile.spSatz}>{satzText(p.steuersatz)}</Text>
              <Text style={stile.spBetrag}>{centAnzeigen(p.betragCent)}</Text>
            </View>
            {p.pfandBetragCent !== null && p.pfandBetragCent !== 0 && (
              <View style={stile.tabelleZeile}>
                <Text style={stile.spPos} />
                <Text style={stile.spText}>Pfand{p.einheit ? ` (${p.einheit})` : ''}</Text>
                <Text style={stile.spAnzahl}>{anzahlText(p.anzahlMilli)}</Text>
                <Text style={stile.spPreis}>{centAnzeigen(p.pfandCent ?? 0)}</Text>
                <Text style={stile.spSatz}>{satzText(p.steuersatz)}</Text>
                <Text style={stile.spBetrag}>{centAnzeigen(p.pfandBetragCent)}</Text>
              </View>
            )}
          </View>
        ))}

        <View style={stile.summen} wrap={false}>
          {r.summen.length > 1 && (
            <View style={stile.summenZeile}>
              <Text>Summe netto</Text>
              <Text>{centAnzeigen(netto)}</Text>
            </View>
          )}
          {r.summen.map((s) => (
            <View key={s.satz}>
              <View style={stile.summenZeile}>
                <Text>Netto {satzText(s.satz)}</Text>
                <Text>{centAnzeigen(s.netto)}</Text>
              </View>
              <View style={stile.summenZeile}>
                <Text>Umsatzsteuer {satzText(s.satz)}</Text>
                <Text>{centAnzeigen(s.steuer)}</Text>
              </View>
            </View>
          ))}
          <View style={stile.gesamt}>
            <Text>{r.istStorno ? 'Gutschrift (brutto)' : 'Gesamtbetrag (brutto)'}</Text>
            <Text>{centAnzeigen(r.bruttoCent)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }} wrap={false}>
          {r.hinweis && <Text style={stile.absatz}>{r.hinweis}</Text>}
          {r.istStorno ? (
            <Text style={stile.absatz}>
              Diese Stornorechnung hebt die Rechnung {r.stornoVon?.nummer ?? ''} vollständig auf.
            </Text>
          ) : (
            <Text style={stile.absatz}>
              {rechnungTextFuellen(v.fusstext, {
                nummer: r.nummer,
                faellig: datumAnzeigen(r.faelligAm),
                betrag: centAnzeigen(r.bruttoCent),
                bank: v.bankName,
                iban: v.iban,
                bic: v.bic,
              })}
            </Text>
          )}
        </View>

        <View style={stile.fuss} fixed>
          <View style={stile.fussSpalten}>
            <View style={stile.fussSpalte}>
              <Text style={{ fontWeight: 700 }}>{v.vereinsname}</Text>
              {zeilen(v.anschrift).map((z, i) => (
                <Text key={i}>{z}</Text>
              ))}
              {v.kontakt && zeilen(v.kontakt).map((z, i) => <Text key={`k${i}`}>{z}</Text>)}
            </View>
            <View style={stile.fussSpalte}>
              <Text>Vorstand:</Text>
              {zeilen(v.vorstand).map((z, i) => (
                <Text key={i}>{z}</Text>
              ))}
              {v.register && <Text>{v.register}</Text>}
              <Text>Steuernummer: {v.steuernummer}</Text>
              {v.ustId && <Text>USt-IdNr.: {v.ustId}</Text>}
            </View>
            <View style={stile.fussSpalte}>
              <Text>Bank: {v.bankName}</Text>
              <Text>IBAN: {v.iban}</Text>
              <Text>BIC: {v.bic}</Text>
            </View>
          </View>
          <Text
            style={stile.seitenzahl}
            render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
