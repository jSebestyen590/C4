import { describe, expect, it } from 'vitest';
import {
  DATENEXPORT_TABELLEN,
  beschreibungTxt,
  betragCsv,
  csvFeld,
  datenexportEingabeSchema,
  indexXml,
  tabelleAlsCsv,
  type DatenexportDaten,
} from './finanzenDatenexport';

const leer: DatenexportDaten = {
  konten: [],
  buchungen: [],
  zeilen: [],
  stueckelung: [],
  belege: [],
  belegposten: [],
  rechnungssteller: [],
  festschreibungen: [],
};

describe('betragCsv', () => {
  it('formats cents with comma and sign', () => {
    expect(betragCsv(123456)).toBe('1234,56');
    expect(betragCsv(5)).toBe('0,05');
    expect(betragCsv(0)).toBe('0,00');
    expect(betragCsv(-1)).toBe('-0,01');
    expect(betragCsv(-123456)).toBe('-1234,56');
  });
});

describe('csvFeld', () => {
  it('leaves plain text alone and quotes special characters', () => {
    expect(csvFeld('Bier')).toBe('Bier');
    expect(csvFeld('a;b')).toBe('"a;b"');
    expect(csvFeld('sagt "hallo"')).toBe('"sagt ""hallo"""');
    expect(csvFeld('zwei\nZeilen')).toBe('"zwei\nZeilen"');
    expect(csvFeld('x\r\ny')).toBe('"x\r\ny"');
  });
});

describe('tabelleAlsCsv', () => {
  const buchungen = DATENEXPORT_TABELLEN.find((t) => t.datei === 'buchungen.csv')!;
  const zeilen = DATENEXPORT_TABELLEN.find((t) => t.datei === 'buchungszeilen.csv')!;

  it('writes header, CRLF and German dates', () => {
    const csv = tabelleAlsCsv(buchungen, {
      ...leer,
      buchungen: [
        {
          id: 'b1',
          seq: 1,
          datum: '2026-03-05',
          text: 'Text; mit "Zeichen"\nund Umbruch',
          quelleTyp: 'manuell',
          quelleId: null,
          eventId: null,
          stornoVon: null,
          erstelltVon: 'u',
          erstelltAm: '2026-03-05T10:00:00.000Z',
          prevHash: '0'.repeat(64),
          hash: 'h',
        },
      ],
    });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(buchungen.spalten.map((s) => s.name).join(';'));
    expect(csv).toContain('b1;1;05.03.2026;"Text; mit ""Zeichen""\nund Umbruch";manuell;;;;u;');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('writes negative amounts and empty values', () => {
    const csv = tabelleAlsCsv(zeilen, {
      ...leer,
      zeilen: [
        {
          buchungId: 'b1',
          pos: 2,
          kontoId: 'k',
          betragCent: -123456,
          nettoCent: null,
          steuerCent: null,
          steuersatz: null,
          steuerArt: 'keine',
        },
      ],
    });
    expect(csv.split('\r\n')[1]).toBe('b1;2;k;-1234,56;;;;keine');
  });
});

describe('indexXml', () => {
  const xml = indexXml(DATENEXPORT_TABELLEN, 'C4');
  it('has the DOCTYPE and every table and column', () => {
    expect(xml).toContain('<!DOCTYPE DataSet SYSTEM "gdpdu-01-08-2002.dtd">');
    for (const t of DATENEXPORT_TABELLEN) {
      expect(xml).toContain(`<URL>${t.datei}</URL>`);
      for (const s of t.spalten) expect(xml).toContain(`<Name>${s.name}</Name>`);
    }
  });
  it('lists the primary key columns first', () => {
    for (const t of DATENEXPORT_TABELLEN)
      expect(t.spalten.slice(0, t.primaer.length).map((s) => s.name)).toEqual(t.primaer);
  });
  it('only references known tables and columns', () => {
    for (const t of DATENEXPORT_TABELLEN)
      for (const f of t.fremd) {
        expect(DATENEXPORT_TABELLEN.some((x) => x.name === f.tabelle)).toBe(true);
        for (const s of f.spalten) expect(t.spalten.some((c) => c.name === s)).toBe(true);
      }
  });
});

describe('beschreibungTxt', () => {
  it('names the period and every file', () => {
    const txt = beschreibungTxt({
      von: '2025-01-01',
      bis: '2025-12-31',
      erstelltVon: 'anna',
      erstelltAm: '2026-01-02T10:00:00.000Z',
    });
    expect(txt).toContain('01.01.2025 bis 31.12.2025');
    expect(txt).toContain('hashlib');
    for (const t of DATENEXPORT_TABELLEN) expect(txt).toContain(t.datei);
  });
});

describe('datenexportEingabeSchema', () => {
  it('accepts a normal period', () => {
    expect(
      datenexportEingabeSchema.safeParse({ von: '2025-01-01', bis: '2025-12-31' }).success,
    ).toBe(true);
  });
  it('rejects von after bis and periods over 10 years', () => {
    expect(
      datenexportEingabeSchema.safeParse({ von: '2025-02-01', bis: '2025-01-01' }).success,
    ).toBe(false);
    expect(
      datenexportEingabeSchema.safeParse({ von: '2010-01-01', bis: '2020-01-01' }).success,
    ).toBe(false);
    expect(
      datenexportEingabeSchema.safeParse({ von: '2010-01-01', bis: '2019-12-31' }).success,
    ).toBe(true);
  });
});
