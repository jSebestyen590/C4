import { z } from 'zod';
import { datumAnzeigen } from './datum';
import { finanzDatumSchema, type FinanzMitgliedDto } from './finanzen';

// Datenexport fürs Finanzamt (GoBD Z3): CSV files plus `index.xml` (Beschreibungsstandard GDPdU) and
// `beschreibung.txt`. Files and columns are defined once in `DATENEXPORT_TABELLEN`; CSV, index.xml and
// the description all come from that table.

/** Longest exportable period in years. */
export const DATENEXPORT_MAX_JAHRE = 10;

export const datenexportEingabeSchema = z
  .object({
    von: finanzDatumSchema,
    bis: finanzDatumSchema,
    /** Adds the Beleg files to the ZIP (asynchronous job, the result arrives as a push). */
    mitBelegdateien: z.boolean().optional().default(false),
  })
  .superRefine((e, ctx) => {
    if (e.von > e.bis) {
      ctx.addIssue({ code: 'custom', path: ['bis'], message: 'Das Ende liegt vor dem Beginn.' });
      return;
    }
    const grenze = `${Number(e.von.slice(0, 4)) + DATENEXPORT_MAX_JAHRE}${e.von.slice(4)}`;
    if (e.bis >= grenze)
      ctx.addIssue({
        code: 'custom',
        path: ['bis'],
        message: `Der Zeitraum darf höchstens ${DATENEXPORT_MAX_JAHRE} Jahre umfassen.`,
      });
  });
export type DatenexportEingabe = z.output<typeof datenexportEingabeSchema>;

export interface DatenexportDto {
  id: string;
  von: string;
  bis: string;
  schluessel: string;
  sha256: string;
  erstelltVon: FinanzMitgliedDto | null;
  erstelltAm: string;
  /** The ZIP contains the Beleg files (folder `belege/`). */
  mitBelegdateien: boolean;
  /** Presigned download URL. */
  url: string;
}

export interface DatenexportErgebnisDto {
  id: string;
  url: string;
}

/** Answer (202) when the export runs as a background job; the requester gets a push when it is done. */
export interface DatenexportStartDto {
  id: string;
  laeuft: true;
}

/** Event of the asynchronous Datenexport job (Lambda self-invoke). */
export interface DatenexportAuftrag {
  c4: 'datenexport';
  id: string;
  von: string;
  bis: string;
  /** Cognito sub of the requester (gets the push). */
  sub: string;
}

// --- Rows (what the store loads) -------------------------------------------------------------------

export interface ExportKonto {
  id: string;
  name: string;
  art: string;
  parentId: string | null;
  stueckelung: boolean;
  steuersatzArt: string | null;
  archiviert: boolean;
}

export interface ExportBuchung {
  id: string;
  seq: number;
  datum: string;
  text: string;
  quelleTyp: string;
  quelleId: string | null;
  eventId: string | null;
  stornoVon: string | null;
  erstelltVon: string;
  erstelltAm: string;
  prevHash: string;
  hash: string;
}

export interface ExportZeile {
  buchungId: string;
  pos: number;
  kontoId: string;
  betragCent: number;
  nettoCent: number | null;
  steuerCent: number | null;
  steuersatz: number | null;
  steuerArt: string;
}

export interface ExportStueckelung {
  buchungId: string;
  pos: number;
  nennwertCent: number;
  anzahl: number;
}

export interface ExportBeleg {
  id: string;
  nummer: string;
  rechnungsstellerId: string;
  belegdatum: string;
  modus: string;
  zahlweg: string;
  bezahldatum: string | null;
  mitgliedId: string | null;
  eigenbelegBegruendung: string | null;
  dateiSha256: string | null;
  dateiSchluessel: string | null;
  dateiTyp: string | null;
  dateiName: string | null;
  /** Path of the Beleg file in the ZIP; set by the export job when the files are included. */
  dateiPfad?: string | null;
  summeCent: number;
  buchungId: string;
  erstelltVon: string;
  erstelltAm: string;
}

export interface ExportBelegposten {
  belegId: string;
  pos: number;
  kategorieId: string;
  art: string;
  text: string;
  anzahlMilli: number;
  einzelpreisCent: number;
  steuersatz: number;
  betragCent: number;
  gesamtCent: number | null;
  pfandCent: number | null;
  pfandBetragCent: number | null;
}

export interface ExportRechnungssteller {
  id: string;
  name: string;
  archiviert: boolean;
}

export interface ExportFestschreibung {
  id: string;
  monat: string;
  bisSeq: number;
  kopfHash: string;
  anzahl: number;
  exportSchluessel: string;
  festgeschriebenVon: string;
  festgeschriebenAm: string;
}

export interface DatenexportDaten {
  konten: ExportKonto[];
  buchungen: ExportBuchung[];
  zeilen: ExportZeile[];
  stueckelung: ExportStueckelung[];
  belege: ExportBeleg[];
  belegposten: ExportBelegposten[];
  rechnungssteller: ExportRechnungssteller[];
  festschreibungen: ExportFestschreibung[];
}

// --- Definition of files and columns ---------------------------------------------------------------

/** `betrag`: cents, written as `1234,56`; `zahl`: integer; `datum`: ISO date, written `TT.MM.JJJJ`. */
export type SpaltenTyp = 'text' | 'zahl' | 'betrag' | 'datum';

type Wert = string | number | boolean | null;

export interface ExportSpalte<R> {
  name: string;
  beschreibung: string;
  typ: SpaltenTyp;
  wert: (r: R) => Wert;
}

export interface ExportTabelle<K extends keyof DatenexportDaten = keyof DatenexportDaten> {
  datei: string;
  /** Name of the table in index.xml. */
  name: string;
  beschreibung: string;
  daten: K;
  /** The leading columns, in this order (GDPdU lists primary keys first). */
  primaer: string[];
  fremd: { spalten: string[]; tabelle: string }[];
  spalten: ExportSpalte<DatenexportDaten[K][number]>[];
}

const sp = <R>(
  name: string,
  typ: SpaltenTyp,
  beschreibung: string,
  wert: (r: R) => Wert,
): ExportSpalte<R> => ({ name, typ, beschreibung, wert });

function tabelle<K extends keyof DatenexportDaten>(
  t: Omit<ExportTabelle<K>, 'spalten'> & { spalten: ExportSpalte<DatenexportDaten[K][number]>[] },
): ExportTabelle {
  return t as unknown as ExportTabelle;
}

export const DATENEXPORT_TABELLEN: readonly ExportTabelle[] = [
  tabelle({
    datei: 'konten.csv',
    name: 'Konten',
    beschreibung: 'Kontenplan (alle Konten, auch archivierte)',
    daten: 'konten',
    primaer: ['id'],
    fremd: [{ spalten: ['parent_id'], tabelle: 'Konten' }],
    spalten: [
      sp<ExportKonto>('id', 'text', 'Kennung des Kontos', (r) => r.id),
      sp<ExportKonto>('name', 'text', 'Name des Kontos', (r) => r.name),
      sp<ExportKonto>(
        'art',
        'text',
        'Kontoart (bargeld, bank, durchlauf, erloes, aufwand, neutral)',
        (r) => r.art,
      ),
      sp<ExportKonto>('parent_id', 'text', 'Übergeordnetes Konto', (r) => r.parentId),
      sp<ExportKonto>('stueckelung', 'text', 'Bargeldkonto mit Stückelung (ja/nein)', (r) =>
        r.stueckelung ? 'ja' : 'nein',
      ),
      sp<ExportKonto>(
        'steuersatz_art',
        'text',
        'Standard-Steuersatz des Kontos',
        (r) => r.steuersatzArt,
      ),
      sp<ExportKonto>('archiviert', 'text', 'Konto archiviert (ja/nein)', (r) =>
        r.archiviert ? 'ja' : 'nein',
      ),
    ],
  }),
  tabelle({
    datei: 'buchungen.csv',
    name: 'Buchungen',
    beschreibung: 'Journal: Buchungen mit Buchungsdatum im Zeitraum, mit Hash-Kette',
    daten: 'buchungen',
    primaer: ['id'],
    fremd: [{ spalten: ['storno_von'], tabelle: 'Buchungen' }],
    spalten: [
      sp<ExportBuchung>('id', 'text', 'Kennung der Buchung', (r) => r.id),
      sp<ExportBuchung>('seq', 'zahl', 'Laufende Nummer im Journal (lückenlos)', (r) => r.seq),
      sp<ExportBuchung>('datum', 'datum', 'Buchungsdatum', (r) => r.datum),
      sp<ExportBuchung>('text', 'text', 'Buchungstext', (r) => r.text),
      sp<ExportBuchung>(
        'quelle_typ',
        'text',
        'Herkunft der Buchung (manuell, umbuchung, storno, eroeffnung, zaehlung, kassenabrechnung, beleg, erstattung)',
        (r) => r.quelleTyp,
      ),
      sp<ExportBuchung>(
        'quelle_id',
        'text',
        'Kennung der Quelle (z. B. des Belegs)',
        (r) => r.quelleId,
      ),
      sp<ExportBuchung>('event_id', 'text', 'Zugeordnete Veranstaltung', (r) => r.eventId),
      sp<ExportBuchung>(
        'storno_von',
        'text',
        'Kennung der stornierten Buchung',
        (r) => r.stornoVon,
      ),
      sp<ExportBuchung>('erstellt_von', 'text', 'Kennung des Erfassers', (r) => r.erstelltVon),
      sp<ExportBuchung>(
        'erstellt_am',
        'text',
        'Zeitpunkt der Erfassung (UTC, ISO 8601)',
        (r) => r.erstelltAm,
      ),
      sp<ExportBuchung>(
        'prev_hash',
        'text',
        'Hash der vorherigen Buchung (SHA-256)',
        (r) => r.prevHash,
      ),
      sp<ExportBuchung>('hash', 'text', 'Hash dieser Buchung (SHA-256)', (r) => r.hash),
    ],
  }),
  tabelle({
    datei: 'buchungszeilen.csv',
    name: 'Buchungszeilen',
    beschreibung: 'Zeilen der Buchungen (Soll positiv, Haben negativ; je Buchung Summe 0)',
    daten: 'zeilen',
    primaer: ['buchung_id', 'pos'],
    fremd: [
      { spalten: ['buchung_id'], tabelle: 'Buchungen' },
      { spalten: ['konto_id'], tabelle: 'Konten' },
    ],
    spalten: [
      sp<ExportZeile>('buchung_id', 'text', 'Kennung der Buchung', (r) => r.buchungId),
      sp<ExportZeile>('pos', 'zahl', 'Position in der Buchung', (r) => r.pos),
      sp<ExportZeile>('konto_id', 'text', 'Kennung des Kontos', (r) => r.kontoId),
      sp<ExportZeile>('betrag', 'betrag', 'Betrag in Euro (Brutto)', (r) => r.betragCent),
      sp<ExportZeile>('netto', 'betrag', 'Nettobetrag in Euro', (r) => r.nettoCent),
      sp<ExportZeile>('steuer', 'betrag', 'Steuerbetrag in Euro', (r) => r.steuerCent),
      sp<ExportZeile>(
        'steuersatz_bp',
        'zahl',
        'Steuersatz in Basispunkten (1900 = 19 %)',
        (r) => r.steuersatz,
      ),
      sp<ExportZeile>(
        'steuer_art',
        'text',
        'Steuerart (ust, vorsteuer, keine)',
        (r) => r.steuerArt,
      ),
    ],
  }),
  tabelle({
    datei: 'stueckelung.csv',
    name: 'Stückelung',
    beschreibung: 'Stückelung von Bargeldbuchungen (Anzahl je Nennwert)',
    daten: 'stueckelung',
    primaer: ['buchung_id', 'pos', 'nennwert'],
    fremd: [{ spalten: ['buchung_id', 'pos'], tabelle: 'Buchungszeilen' }],
    spalten: [
      sp<ExportStueckelung>('buchung_id', 'text', 'Kennung der Buchung', (r) => r.buchungId),
      sp<ExportStueckelung>('pos', 'zahl', 'Position der Buchungszeile', (r) => r.pos),
      sp<ExportStueckelung>('nennwert', 'betrag', 'Nennwert in Euro', (r) => r.nennwertCent),
      sp<ExportStueckelung>('anzahl', 'zahl', 'Anzahl der Scheine oder Münzen', (r) => r.anzahl),
    ],
  }),
  tabelle({
    datei: 'belege.csv',
    name: 'Belege',
    beschreibung: 'Gebuchte Belege der Buchungen im Zeitraum (Belegdateien liegen im Finanzarchiv)',
    daten: 'belege',
    primaer: ['id'],
    fremd: [
      { spalten: ['rechnungssteller_id'], tabelle: 'Rechnungssteller' },
      { spalten: ['buchung_id'], tabelle: 'Buchungen' },
    ],
    spalten: [
      sp<ExportBeleg>('id', 'text', 'Kennung des Belegs', (r) => r.id),
      sp<ExportBeleg>('nummer', 'text', 'Belegnummer (B-JJJJ-NNNN)', (r) => r.nummer),
      sp<ExportBeleg>(
        'rechnungssteller_id',
        'text',
        'Kennung des Rechnungsstellers',
        (r) => r.rechnungsstellerId,
      ),
      sp<ExportBeleg>('belegdatum', 'datum', 'Datum auf dem Beleg', (r) => r.belegdatum),
      sp<ExportBeleg>('modus', 'text', 'Beträge brutto oder netto erfasst', (r) => r.modus),
      sp<ExportBeleg>('zahlweg', 'text', 'Zahlweg (bar, bank, auslage)', (r) => r.zahlweg),
      sp<ExportBeleg>('bezahldatum', 'datum', 'Bezahldatum', (r) => r.bezahldatum),
      sp<ExportBeleg>(
        'mitglied_id',
        'text',
        'Kennung des Mitglieds bei Auslagen',
        (r) => r.mitgliedId,
      ),
      sp<ExportBeleg>(
        'eigenbeleg_begruendung',
        'text',
        'Begründung bei Eigenbeleg',
        (r) => r.eigenbelegBegruendung,
      ),
      sp<ExportBeleg>('datei_sha256', 'text', 'SHA-256 der Belegdatei', (r) => r.dateiSha256),
      sp<ExportBeleg>(
        'datei_schluessel',
        'text',
        'Schlüssel der Belegdatei im Finanzarchiv',
        (r) => r.dateiSchluessel,
      ),
      sp<ExportBeleg>(
        'datei_pfad',
        'text',
        'Pfad der Belegdatei im ZIP (leer, wenn der Export ohne Belegdateien erstellt wurde)',
        (r) => r.dateiPfad ?? null,
      ),
      sp<ExportBeleg>('datei_typ', 'text', 'Dateityp der Belegdatei', (r) => r.dateiTyp),
      sp<ExportBeleg>('datei_name', 'text', 'Ursprünglicher Dateiname', (r) => r.dateiName),
      sp<ExportBeleg>('summe', 'betrag', 'Belegsumme in Euro', (r) => r.summeCent),
      sp<ExportBeleg>('buchung_id', 'text', 'Kennung der Buchung des Belegs', (r) => r.buchungId),
      sp<ExportBeleg>('erstellt_von', 'text', 'Kennung des Erfassers', (r) => r.erstelltVon),
      sp<ExportBeleg>(
        'erstellt_am',
        'text',
        'Zeitpunkt der Erfassung (UTC, ISO 8601)',
        (r) => r.erstelltAm,
      ),
    ],
  }),
  tabelle({
    datei: 'belegposten.csv',
    name: 'Belegposten',
    beschreibung: 'Posten der Belege',
    daten: 'belegposten',
    primaer: ['beleg_id', 'pos'],
    fremd: [
      { spalten: ['beleg_id'], tabelle: 'Belege' },
      { spalten: ['kategorie_id'], tabelle: 'Konten' },
    ],
    spalten: [
      sp<ExportBelegposten>('beleg_id', 'text', 'Kennung des Belegs', (r) => r.belegId),
      sp<ExportBelegposten>('pos', 'zahl', 'Position im Beleg', (r) => r.pos),
      sp<ExportBelegposten>(
        'kategorie_id',
        'text',
        'Kennung des Kontos (Kategorie)',
        (r) => r.kategorieId,
      ),
      sp<ExportBelegposten>(
        'art',
        'text',
        'Art des Postens (kategorie, ware, leergut)',
        (r) => r.art,
      ),
      sp<ExportBelegposten>('text', 'text', 'Bezeichnung', (r) => r.text),
      sp<ExportBelegposten>(
        'anzahl_milli',
        'zahl',
        'Menge in Tausendsteln (1000 = 1)',
        (r) => r.anzahlMilli,
      ),
      sp<ExportBelegposten>(
        'einzelpreis',
        'betrag',
        'Einzelpreis in Euro',
        (r) => r.einzelpreisCent,
      ),
      sp<ExportBelegposten>(
        'steuersatz_bp',
        'zahl',
        'Steuersatz in Basispunkten (1900 = 19 %)',
        (r) => r.steuersatz,
      ),
      sp<ExportBelegposten>('betrag', 'betrag', 'Betrag in Euro', (r) => r.betragCent),
      sp<ExportBelegposten>(
        'gesamtpreis',
        'betrag',
        'Gesamtpreis in Euro, falls angegeben',
        (r) => r.gesamtCent,
      ),
      sp<ExportBelegposten>('pfand', 'betrag', 'Pfand je Gebinde in Euro', (r) => r.pfandCent),
      sp<ExportBelegposten>(
        'pfand_betrag',
        'betrag',
        'Pfandbetrag des Postens in Euro',
        (r) => r.pfandBetragCent,
      ),
    ],
  }),
  tabelle({
    datei: 'rechnungssteller.csv',
    name: 'Rechnungssteller',
    beschreibung: 'Rechnungssteller (alle, auch archivierte)',
    daten: 'rechnungssteller',
    primaer: ['id'],
    fremd: [],
    spalten: [
      sp<ExportRechnungssteller>('id', 'text', 'Kennung des Rechnungsstellers', (r) => r.id),
      sp<ExportRechnungssteller>('name', 'text', 'Name', (r) => r.name),
      sp<ExportRechnungssteller>('archiviert', 'text', 'Archiviert (ja/nein)', (r) =>
        r.archiviert ? 'ja' : 'nein',
      ),
    ],
  }),
  tabelle({
    datei: 'festschreibungen.csv',
    name: 'Festschreibungen',
    beschreibung: 'Festgeschriebene Monate (alle)',
    daten: 'festschreibungen',
    primaer: ['id'],
    fremd: [],
    spalten: [
      sp<ExportFestschreibung>('id', 'text', 'Kennung der Festschreibung', (r) => r.id),
      sp<ExportFestschreibung>(
        'monat',
        'datum',
        'Erster Tag des festgeschriebenen Monats',
        (r) => r.monat,
      ),
      sp<ExportFestschreibung>(
        'bis_seq',
        'zahl',
        'Höchste Journalnummer bei der Festschreibung',
        (r) => r.bisSeq,
      ),
      sp<ExportFestschreibung>(
        'kopf_hash',
        'text',
        'Hash der Kette bei dieser Nummer',
        (r) => r.kopfHash,
      ),
      sp<ExportFestschreibung>('anzahl', 'zahl', 'Buchungen mit Datum im Monat', (r) => r.anzahl),
      sp<ExportFestschreibung>(
        'export_schluessel',
        'text',
        'Archivschlüssel des Monatsexports',
        (r) => r.exportSchluessel,
      ),
      sp<ExportFestschreibung>(
        'festgeschrieben_von',
        'text',
        'Kennung der Person',
        (r) => r.festgeschriebenVon,
      ),
      sp<ExportFestschreibung>(
        'festgeschrieben_am',
        'text',
        'Zeitpunkt (UTC, ISO 8601)',
        (r) => r.festgeschriebenAm,
      ),
    ],
  }),
];

// --- CSV ---------------------------------------------------------------------------------------

/** Cents as `1234,56` (no digit grouping, `-` for negative). */
export function betragCsv(cent: number): string {
  const abs = Math.abs(cent);
  const euro = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${cent < 0 ? '-' : ''}${euro},${rest}`;
}

/** One field in RFC 4180 form with `;` as separator: quoted when it contains `;`, `"`, CR or LF. */
export function csvFeld(wert: string): string {
  return /[;"\r\n]/.test(wert) ? `"${wert.replaceAll('"', '""')}"` : wert;
}

function zelle(typ: SpaltenTyp, wert: Wert): string {
  if (wert === null || wert === undefined) return '';
  if (typeof wert === 'boolean') return wert ? 'ja' : 'nein';
  if (typ === 'betrag') return betragCsv(Number(wert));
  if (typ === 'datum') return datumAnzeigen(String(wert));
  return csvFeld(String(wert));
}

/** A whole CSV file: header row, then one line per row; UTF-8 (no BOM), CRLF line ends. */
export function tabelleAlsCsv(t: ExportTabelle, daten: DatenexportDaten): string {
  const zeilen = (daten[t.daten] as readonly unknown[]).map((r) =>
    t.spalten.map((s) => zelle(s.typ, (s.wert as (r: unknown) => Wert)(r))).join(';'),
  );
  return [t.spalten.map((s) => csvFeld(s.name)).join(';'), ...zeilen]
    .map((z) => `${z}\r\n`)
    .join('');
}

// --- index.xml (GDPdU) -------------------------------------------------------------------------

export function xmlEscape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function spaltenTypXml(typ: SpaltenTyp): string {
  switch (typ) {
    case 'betrag':
      return '<Numeric><Accuracy>2</Accuracy></Numeric>';
    case 'zahl':
      return '<Numeric/>';
    case 'datum':
      return '<Date><Format>DD.MM.YYYY</Format></Date>';
    default:
      return '<AlphaNumeric/>';
  }
}

/** The `index.xml` after the GDPdU description standard (DTD `gdpdu-01-08-2002.dtd`). */
export function indexXml(tabellen: readonly ExportTabelle[], lieferant: string): string {
  const zeilen: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE DataSet SYSTEM "gdpdu-01-08-2002.dtd">',
    '<DataSet>',
    '  <Version>1.0</Version>',
    '  <DataSupplier>',
    `    <Name>${xmlEscape(lieferant)}</Name>`,
    '    <Location>Leipzig</Location>',
    '    <Comment>Buchführung der Gruppe, Export aus der C4-App</Comment>',
    '  </DataSupplier>',
    '  <Media>',
    '    <Name>Datenexport</Name>',
  ];
  for (const t of tabellen) {
    zeilen.push(
      '    <Table>',
      `      <URL>${xmlEscape(t.datei)}</URL>`,
      `      <Name>${xmlEscape(t.name)}</Name>`,
      `      <Description>${xmlEscape(t.beschreibung)}</Description>`,
      '      <Validity><Range><From>2</From></Range></Validity>',
      '      <UTF8/>',
      '      <DecimalSymbol>,</DecimalSymbol>',
      '      <DigitGroupingSymbol>.</DigitGroupingSymbol>',
      '      <VariableLength>',
      '        <ColumnDelimiter>;</ColumnDelimiter>',
      '        <RecordDelimiter>&#13;&#10;</RecordDelimiter>',
      '        <TextEncapsulator>&quot;</TextEncapsulator>',
    );
    for (const s of t.spalten) {
      const tag = t.primaer.includes(s.name) ? 'VariablePrimaryKey' : 'VariableColumn';
      zeilen.push(
        `        <${tag}>`,
        `          <Name>${xmlEscape(s.name)}</Name>`,
        `          <Description>${xmlEscape(s.beschreibung)}</Description>`,
        `          ${spaltenTypXml(s.typ)}`,
        `        </${tag}>`,
      );
    }
    for (const f of t.fremd) {
      zeilen.push('        <ForeignKey>');
      for (const name of f.spalten) zeilen.push(`          <Name>${xmlEscape(name)}</Name>`);
      zeilen.push(
        `          <References>${xmlEscape(f.tabelle)}</References>`,
        '        </ForeignKey>',
      );
    }
    zeilen.push('      </VariableLength>', '    </Table>');
  }
  zeilen.push('  </Media>', '</DataSet>');
  return zeilen.map((z) => `${z}\n`).join('');
}

// --- beschreibung.txt --------------------------------------------------------------------------

export function beschreibungTxt(p: {
  von: string;
  bis: string;
  erstelltVon: string;
  erstelltAm: string;
  tabellen?: readonly ExportTabelle[];
  /** The ZIP contains the folder `belege/` with the Beleg files. */
  mitBelegdateien?: boolean;
}): string {
  const tabellen = p.tabellen ?? DATENEXPORT_TABELLEN;
  const z: string[] = [
    'Datenexport der Buchführung (C4)',
    '================================',
    '',
    `Zeitraum der Buchungen: ${datumAnzeigen(p.von)} bis ${datumAnzeigen(p.bis)}`,
    `Erstellt von: ${p.erstelltVon}`,
    `Erstellt am: ${p.erstelltAm} (UTC)`,
    '',
    'Format',
    '------',
    'CSV-Dateien, UTF-8, Spalten durch Semikolon getrennt, Zeilenende CRLF, Texte mit Semikolon,',
    'Anführungszeichen oder Zeilenumbruch in Anführungszeichen (Anführungszeichen verdoppelt).',
    'Die erste Zeile jeder Datei enthält die Spaltennamen. Beträge in Euro mit Komma (1234,56), ohne',
    'Tausendertrennung, Minus für negative Beträge. Daten als TT.MM.JJJJ. Leere Felder sind ohne Wert.',
    'Die Datei index.xml beschreibt alle Dateien nach dem GDPdU-Standard (Beschreibungsstandard der',
    'Finanzverwaltung) und kann in IDEA oder vergleichbare Prüfsoftware eingelesen werden.',
    '',
    'Buchungslogik',
    '-------------',
    'Doppelte Buchführung: Jede Buchung besteht aus mindestens zwei Zeilen, ihre Beträge ergeben Null.',
    'Positive Beträge stehen im Soll, negative im Haben. Gebucht wird nur durch neue Einträge; eine',
    'Korrektur ist eine Stornobuchung (Spalte storno_von) mit anschließender Neubuchung.',
    'Buchungen sind nach Buchungsdatum im genannten Zeitraum enthalten; Konten, Rechnungssteller und',
    'Festschreibungen vollständig.',
    ...(p.mitBelegdateien
      ? [
          'Die Belegdateien der Belege liegen im Ordner belege/. Der Dateiname ist der SHA-256 des',
          'Dateiinhalts (Hex) plus Endung; belege.csv nennt den Pfad in der Spalte datei_pfad.',
        ]
      : [
          'Belegdateien liegen nicht im ZIP, belege.csv nennt SHA-256 und Archivschlüssel der Datei im',
          'Finanzarchiv.',
        ]),
    '',
    'Unveränderbarkeit (Hash-Kette)',
    '------------------------------',
    'Jede Buchung trägt eine laufende Nummer (seq), den Hash der Vorgängerin (prev_hash) und ihren',
    'eigenen Hash (hash). Der Hash ist SHA-256 über prev_hash, einen Zeilenumbruch und die kanonische',
    'JSON-Darstellung der Buchung samt Zeilen und Stückelung (Schlüssel sortiert, kompakt, UTF-8, NFC).',
    'Die Kette beginnt mit prev_hash = 64 Nullen. Nachrechnen, z. B. mit Python:',
    '',
    '    import hashlib, json, unicodedata',
    '',
    '    def nfc(v):',
    '        if isinstance(v, str): return unicodedata.normalize("NFC", v)',
    '        if isinstance(v, list): return [nfc(x) for x in v]',
    '        if isinstance(v, dict): return {nfc(k): nfc(x) for k, x in v.items()}',
    '        return v',
    '',
    '    def hash_von(prev_hash, entry):',
    '        kanonisch = json.dumps(nfc(entry), sort_keys=True, separators=(",", ":"), ensure_ascii=False)',
    '        return hashlib.sha256((prev_hash + "\\n" + kanonisch).encode("utf-8")).hexdigest()',
    '',
    'Festgeschriebene Monate (festschreibungen.csv) sind mit dem Hash der Kette (kopf_hash) bei der',
    'Journalnummer bis_seq abgeschlossen und zusätzlich im unveränderlichen Finanzarchiv gesichert.',
    '',
    'Dateien und Spalten',
    '-------------------',
  ];
  for (const t of tabellen) {
    z.push('', `${t.datei} (${t.name}): ${t.beschreibung}`);
    for (const s of t.spalten) z.push(`  ${s.name}: ${s.beschreibung}`);
  }
  return z.map((x) => `${x}\r\n`).join('');
}
