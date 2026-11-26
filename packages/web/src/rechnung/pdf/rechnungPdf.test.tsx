// @vitest-environment node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pdf } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import type { RechnungDetailDto } from '@c4/shared';
import { schriftenRegistrieren } from '../../protokoll/pdf/schriften';
import { rechnungDateiname, rechnungTitel } from '../rechnungDatei';
import { RechnungPdf } from './RechnungPdf';

const rechnung: RechnungDetailDto = {
  id: 'r1',
  nummer: '001-2027',
  jahr: 2027,
  istStorno: false,
  status: 'gestellt',
  ueberfaellig: false,
  rechnungsdatum: '2027-01-15',
  leistungVon: '2027-01-10',
  leistungBis: null,
  faelligAm: '2027-01-29',
  mitglied: null,
  empfaengerId: 'e1',
  empfaengerName: 'Müller GmbH',
  empfaengerAnschrift: 'Hauptstraße 1\n04109 Leipzig',
  empfaengerUstId: null,
  verein: {
    vereinsname: 'C4 e. V.',
    anschrift: 'Beispielweg 3\n04109 Leipzig',
    steuernummer: '232/123/45678',
    ustId: null,
    bankName: 'Sparkasse Leipzig',
    iban: 'DE02 8605 5592 0000 0000 00',
    bic: 'WELADE8LXXX',
    vorstand: 'Vorstandsvorsitz: Erika Mustermann',
    register: 'VR 1234, Amtsgericht Leipzig',
    kontakt: null,
    fusstext: null,
  },
  modus: 'brutto',
  betreff: 'Getränke für die Feier',
  einleitung: null,
  hinweis: null,
  bruttoCent: 11900,
  posten: [
    {
      pos: 1,
      art: 'ware',
      wareId: 'w1',
      gebindeId: 'g1',
      einheit: 'Kasten à 20 × 0,5 l',
      text: 'Ur-Krostitzer',
      anzahlMilli: 1000,
      einzelpreisCent: 2100,
      pfandCent: 310,
      pfandBetragCent: 310,
      steuersatz: 700,
      erloesKontoId: 'erloese_getraenke',
      erloesKontoName: 'Getränke',
      betragCent: 2100,
    },
    {
      pos: 2,
      art: 'frei',
      wareId: null,
      gebindeId: null,
      einheit: null,
      text: 'Raummiete',
      anzahlMilli: 1000,
      einzelpreisCent: 9500,
      pfandCent: null,
      pfandBetragCent: null,
      steuersatz: 1900,
      erloesKontoId: 'erloese_raum',
      erloesKontoName: 'Raummiete',
      betragCent: 9500,
    },
  ],
  summen: [
    { satz: 1900, netto: 7983, steuer: 1517, brutto: 9500 },
    { satz: 700, netto: 2252, steuer: 158, brutto: 2410 },
  ],
  stornoVon: null,
  stornoBegruendung: null,
  stornorechnung: null,
  buchungId: 'b1',
  buchungSeq: 12,
  zahlung: null,
  datei: null,
  erstelltVon: null,
  erstelltAm: '2027-01-15T10:00:00Z',
};

const storno: RechnungDetailDto = {
  ...rechnung,
  id: 'r2',
  nummer: '002-2027',
  istStorno: true,
  status: 'storniert',
  bruttoCent: -11900,
  stornoVon: { id: 'r1', nummer: '001-2027', rechnungsdatum: '2027-01-15' },
  stornoBegruendung: 'Falscher Empfänger',
  posten: rechnung.posten.map((p) => ({
    ...p,
    betragCent: -p.betragCent,
    pfandBetragCent: p.pfandBetragCent === null ? null : -p.pfandBetragCent,
  })),
  summen: rechnung.summen.map((s) => ({
    ...s,
    netto: -s.netto,
    steuer: -s.steuer,
    brutto: -s.brutto,
  })),
};

const logoDatei = fileURLToPath(new URL('../../assets/logo-rechnung.png', import.meta.url));

async function rendern(r: RechnungDetailDto, mitLogo = true): Promise<Buffer> {
  const require = createRequire(import.meta.url);
  const datei = (n: string) =>
    require.resolve(`@fontsource/noto-sans/files/noto-sans-latin-${n}.woff`);
  schriftenRegistrieren({
    normal: datei('400-normal'),
    fett: datei('700-normal'),
    kursiv: datei('400-italic'),
    fettKursiv: datei('700-italic'),
  });
  const strom = await pdf(
    <RechnungPdf rechnung={r} logo={mitLogo ? logoDatei : undefined} />,
  ).toBuffer();
  const teile: Buffer[] = [];
  for await (const t of strom) teile.push(Buffer.from(t as Uint8Array));
  return Buffer.concat(teile);
}

describe('Rechnung PDF', () => {
  it('names title and file by kind and number', () => {
    expect(rechnungTitel(rechnung)).toBe('Rechnung');
    expect(rechnungDateiname(rechnung)).toBe('Rechnung-001-2027.pdf');
    expect(rechnungDateiname(storno)).toBe('Stornorechnung-002-2027.pdf');
  });

  it('renders an invoice with a deposit line and two tax rates to a valid PDF', async () => {
    const bytes = await rendern(rechnung);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(3000);
    expect(bytes.toString('latin1')).toContain('/Title');
    expect(bytes.toString('latin1')).toContain('/Subtype /Image');
    expect((await rendern(rechnung, false)).toString('latin1')).not.toContain('/Subtype /Image');
  });

  it('renders a Stornorechnung with negative amounts', async () => {
    const bytes = await rendern(storno);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(3000);
  });
});
