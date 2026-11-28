import { describe, expect, it } from 'vitest';
import { EUER_ZEILEN, EUER_ZEILEN_ZUORDENBAR, kontoHatEuerZeile } from './finanzenEuer';
import {
  csvText,
  einkaufAuswertung,
  euerAuswertung,
  eventEinnahmen,
  eventVerlauf,
  guvAuswertung,
  pfandSaldo,
  ustAuswertung,
  zeitraeumeZwischen,
  zeitraumLabel,
  zeitraumSchluessel,
  auswertungZeitraumSchema,
  type AuswertungKonto,
  type AuswertungZeile,
  type EinkaufPostenRoh,
} from './finanzenAuswertungen';
import { kontoEingabeSchema } from './finanzen';
import type { Gebinde } from './waren';

const SAETZE = [
  { ab: '2020-01-01', regel: 1900, ermaessigt: 700 },
  { ab: '2020-07-01', regel: 1600, ermaessigt: 500 },
  { ab: '2021-01-01', regel: 1900, ermaessigt: 700 },
];

let n = 0;
const zeile = (p: Partial<AuswertungZeile>): AuswertungZeile => ({
  buchungId: `b${++n}`,
  datum: '2027-03-10',
  quelleTyp: 'frei',
  eventId: null,
  stornoVon: null,
  kontoId: 'x',
  betragCent: 0,
  nettoCent: null,
  steuerCent: null,
  steuersatz: null,
  steuerArt: 'keine',
  ...p,
});

describe('Zeiträume', () => {
  it('keys and labels', () => {
    expect(zeitraumSchluessel('2027-03-31', 'monat')).toBe('2027-03');
    expect(zeitraumSchluessel('2027-03-31', 'quartal')).toBe('2027-Q1');
    expect(zeitraumSchluessel('2027-04-01', 'quartal')).toBe('2027-Q2');
    expect(zeitraumSchluessel('2027-12-31', 'jahr')).toBe('2027');
    expect(zeitraumLabel('2027-03')).toBe('März 2027');
    expect(zeitraumLabel('2027-Q1')).toBe('1. Quartal 2027');
    expect(zeitraumLabel('2027')).toBe('2027');
  });

  it('has no gaps across quarter borders and years', () => {
    expect(
      zeitraeumeZwischen('2027-02-15', '2027-07-01', 'quartal').map((z) => z.schluessel),
    ).toEqual(['2027-Q1', '2027-Q2', '2027-Q3']);
    expect(
      zeitraeumeZwischen('2026-11-30', '2027-02-01', 'monat').map((z) => z.schluessel),
    ).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(zeitraeumeZwischen('2025-05-05', '2027-01-01', 'jahr')).toHaveLength(3);
  });

  it('validates the query', () => {
    expect(
      auswertungZeitraumSchema.safeParse({ von: '2027-02-01', bis: '2027-01-01' }).success,
    ).toBe(false);
    expect(
      auswertungZeitraumSchema.safeParse({ von: '2010-01-01', bis: '2027-01-01' }).success,
    ).toBe(false);
    expect(auswertungZeitraumSchema.parse({ von: '2027-01-01', bis: '2027-12-31' }).intervall).toBe(
      'monat',
    );
  });
});

describe('ustAuswertung', () => {
  const erloes19 = (datum: string, brutto: number, o: Partial<AuswertungZeile> = {}) => {
    const netto = Math.round((brutto * 100) / 119);
    return zeile({
      datum,
      kontoId: 'bar',
      betragCent: -brutto,
      nettoCent: -netto,
      steuerCent: -(brutto - netto),
      steuersatz: 1900,
      steuerArt: 'ust',
      ...o,
    });
  };

  it('sums Bemessung, USt, Vorsteuer and rounds the Kz down to whole euros', () => {
    const r = ustAuswertung(
      [
        erloes19('2027-03-10', 11_900), // 100,00 net
        erloes19('2027-03-11', 5_950), // 50,00 net
        zeile({
          datum: '2027-03-12',
          nettoCent: -10_099,
          steuerCent: -707,
          steuersatz: 700,
          steuerArt: 'ust',
        }),
        zeile({
          datum: '2027-03-13',
          betragCent: 2_380,
          nettoCent: 2_000,
          steuerCent: 380,
          steuersatz: 1900,
          steuerArt: 'vorsteuer',
        }),
        zeile({ datum: '2027-03-14', betragCent: 500 }),
      ],
      '2027-03-01',
      '2027-04-30',
      'monat',
      SAETZE,
    );
    const maerz = r.zeitraeume[0]!;
    expect(maerz.schluessel).toBe('2027-03');
    expect(maerz.zeilen.map((z) => z.satz)).toEqual([1900, 700]);
    expect(maerz.zeilen[0]).toMatchObject({
      art: 'regel',
      bemessungCent: 15_000,
      ustCent: 2_850,
      vorsteuerCent: 380,
    });
    expect(maerz.kennzahlen).toEqual({
      kz81Euro: 150,
      kz86Euro: 100,
      kz66Cent: 380,
      kz83Cent: 2_850 + 707 - 380,
    });
    expect(r.zeitraeume[1]!.zeilen).toEqual([]);
  });

  it('keeps a Storno in the following month in its own month', () => {
    const r = ustAuswertung(
      [erloes19('2027-03-31', 11_900), erloes19('2027-04-02', -11_900, { stornoVon: 'b1' })],
      '2027-03-01',
      '2027-04-30',
      'monat',
      SAETZE,
    );
    expect(r.zeitraeume[0]!.kennzahlen.kz83Cent).toBe(1_900);
    expect(r.zeitraeume[1]!.kennzahlen.kz83Cent).toBe(-1_900);
  });

  it('assigns the old 16 % rate to Kz 81 by the booking date and other rates to „sonstige“', () => {
    const alt = zeile({
      datum: '2020-08-05',
      nettoCent: -10_000,
      steuerCent: -1_600,
      steuersatz: 1600,
      steuerArt: 'ust',
    });
    const neu = zeile({
      datum: '2021-02-05',
      nettoCent: -10_000,
      steuerCent: -1_600,
      steuersatz: 1600,
      steuerArt: 'ust',
    });
    const r = ustAuswertung([alt, neu], '2020-08-01', '2021-02-28', 'jahr', SAETZE);
    expect(r.zeitraeume[0]!.kennzahlen.kz81Euro).toBe(100);
    expect(r.zeitraeume[1]!.kennzahlen.kz81Euro).toBe(0);
    expect(r.zeitraeume[1]!.zeilen[0]!.art).toBe('sonstige');
  });

  it('shows the Vorauszahlung of the account ust-finanzamt', () => {
    const r = ustAuswertung(
      [
        zeile({ kontoId: 'ust-finanzamt', betragCent: 1_000 }),
        zeile({ kontoId: 'ust-finanzamt', betragCent: -200 }),
      ],
      '2027-03-01',
      '2027-03-31',
      'monat',
      SAETZE,
    );
    expect(r.zeitraeume[0]!.vorauszahlungCent).toBe(800);
  });
});

const konten: AuswertungKonto[] = [
  { id: 'getraenke', name: 'Getränke', art: 'erloes', parentId: null, euerZeile: 'umsatz' },
  { id: 'bier', name: 'Bier', art: 'erloes', parentId: 'getraenke', euerZeile: 'umsatz' },
  { id: 'miete', name: 'Miete', art: 'aufwand', parentId: null, euerZeile: 'raumkosten' },
  { id: 'sonst', name: 'Sonstiges', art: 'aufwand', parentId: null, euerZeile: null },
  { id: 'spende', name: 'Spenden', art: 'neutral', parentId: null, euerZeile: 'nicht_steuerbar' },
  { id: 'eroeffnung', name: 'Eröffnung', art: 'neutral', parentId: null, euerZeile: null },
  {
    id: 'ust-finanzamt',
    name: 'Umsatzsteuer Finanzamt',
    art: 'neutral',
    parentId: null,
    euerZeile: null,
  },
  { id: 'bank', name: 'Bank', art: 'bank', parentId: null, euerZeile: null },
];

describe('guvAuswertung', () => {
  it('uses netto ?? betrag, shows Erlöse positive and indents sub accounts', () => {
    const r = guvAuswertung(
      [
        zeile({
          kontoId: 'bier',
          betragCent: -11_900,
          nettoCent: -10_000,
          steuerCent: -1_900,
          steuerArt: 'ust',
          steuersatz: 1900,
        }),
        zeile({ kontoId: 'miete', betragCent: 30_000 }),
        zeile({ kontoId: 'miete', datum: '2027-04-01', betragCent: 30_000 }),
        zeile({ kontoId: 'bank', betragCent: 5_000 }),
      ],
      konten,
      '2027-03-01',
      '2027-04-30',
      'monat',
    );
    expect(r.erloese.map((e) => [e.kontoId, e.ebene, e.werteCent])).toEqual([
      ['getraenke', 0, [10_000, 0]],
      ['bier', 1, [10_000, 0]],
    ]);
    expect(r.aufwand.map((e) => e.kontoId)).toEqual(['miete']);
    expect(r.summen.erloeseCent).toEqual([10_000, 0]);
    expect(r.summen.ergebnisCent).toEqual([10_000 - 30_000, -30_000]);
    expect(r.gesamt).toEqual({ erloeseCent: 10_000, aufwandCent: 60_000, ergebnisCent: -50_000 });
  });
});

describe('euerAuswertung', () => {
  it('groups by line, adds computed lines, flags unassigned accounts and splits ust-finanzamt', () => {
    const r = euerAuswertung(
      [
        zeile({
          kontoId: 'bier',
          betragCent: -11_900,
          nettoCent: -10_000,
          steuerCent: -1_900,
          steuerArt: 'ust',
          steuersatz: 1900,
        }),
        zeile({
          kontoId: 'miete',
          betragCent: 23_800,
          nettoCent: 20_000,
          steuerCent: 3_800,
          steuerArt: 'vorsteuer',
          steuersatz: 1900,
        }),
        zeile({ kontoId: 'sonst', betragCent: 1_000 }),
        zeile({ kontoId: 'spende', betragCent: -2_000 }),
        zeile({ kontoId: 'eroeffnung', betragCent: -99_999 }),
        zeile({ kontoId: 'ust-finanzamt', betragCent: 700 }),
        zeile({ kontoId: 'ust-finanzamt', betragCent: -300 }),
        zeile({ kontoId: 'miete', datum: '2026-12-31', betragCent: 99_999 }),
      ],
      konten,
      2027,
    );
    const betrag = (z: string) => r.zeilen.find((x) => x.zeile === z)!.betragCent;
    expect(betrag('umsatz')).toBe(10_000);
    expect(betrag('raumkosten')).toBe(20_000);
    expect(betrag('nicht_steuerbar')).toBe(2_000);
    expect(betrag('ust_vereinnahmt')).toBe(1_900);
    expect(betrag('vorsteuer_gezahlt')).toBe(3_800);
    expect(betrag('ust_zahlung')).toBe(700);
    expect(betrag('ust_erstattung')).toBe(300);
    expect(r.nichtZugeordnet).toEqual([
      { kontoId: 'sonst', name: 'Sonstiges', seite: 'ausgabe', betragCent: 1_000 },
    ]);
    expect(r.summeEinnahmenCent).toBe(10_000 + 2_000 + 1_900 + 300);
    expect(r.summeAusgabenCent).toBe(20_000 + 3_800 + 700 + 1_000);
    expect(r.ueberschussCent).toBe(r.summeEinnahmenCent - r.summeAusgabenCent);
  });
  it('nets kassendifferenz per year into sonstige Einnahmen or Ausgaben', () => {
    const kd = {
      id: 'kassendifferenz',
      name: 'Kassendifferenz',
      art: 'neutral' as const,
      parentId: null,
      euerZeile: null,
    };
    const ueberschuss = euerAuswertung(
      [
        zeile({ kontoId: 'kassendifferenz', betragCent: -500 }),
        zeile({ kontoId: 'kassendifferenz', betragCent: 200 }),
      ],
      [...konten, kd],
      2027,
    );
    const konto = (r: typeof ueberschuss, z: string) =>
      r.zeilen.find((x) => x.zeile === z)!.konten;
    expect(konto(ueberschuss, 'sonstige_einnahmen')).toEqual([
      { kontoId: 'kassendifferenz', name: 'Kassendifferenz', betragCent: 300 },
    ]);
    expect(konto(ueberschuss, 'sonstige_ausgaben')).toEqual([]);
    expect(ueberschuss.ueberschussCent).toBe(300);
    const fehlbetrag = euerAuswertung(
      [zeile({ kontoId: 'kassendifferenz', betragCent: 400 })],
      [...konten, kd],
      2027,
    );
    expect(konto(fehlbetrag, 'sonstige_ausgaben')[0]!.betragCent).toBe(400);
    expect(fehlbetrag.ueberschussCent).toBe(-400);
  });
});

describe('Konto-EÜR-Zeile', () => {
  it('has no computed lines to assign and only fits Erlös, Aufwand, Neutral', () => {
    expect(EUER_ZEILEN_ZUORDENBAR).not.toContain('ust_vereinnahmt');
    expect(EUER_ZEILEN_ZUORDENBAR).toContain(Object.keys(EUER_ZEILEN)[0]);
    expect(kontoHatEuerZeile('bank')).toBe(false);
    const ok = kontoEingabeSchema.safeParse({ name: 'X', art: 'aufwand', euerZeile: 'werbung' });
    expect(ok.success).toBe(true);
    expect(
      kontoEingabeSchema.safeParse({ name: 'X', art: 'bank', euerZeile: 'werbung' }).success,
    ).toBe(false);
    expect(
      kontoEingabeSchema.safeParse({ name: 'X', art: 'aufwand', euerZeile: 'ust_vereinnahmt' })
        .success,
    ).toBe(false);
  });
});

describe('Events', () => {
  const roh = (o: Partial<Parameters<typeof eventEinnahmen>[0][number]>) => ({
    eventId: 'e1',
    titel: 'Party',
    beginn: '2027-03-12T21:00:00Z',
    kategorieId: 'k1',
    kategorieName: 'Party',
    kategorieFarbe: 'grape',
    quelle: 'bar' as const,
    bruttoCent: 1_190,
    nettoCent: 1_000,
    ...o,
  });

  it('splits bar and karte per event', () => {
    const r = eventEinnahmen([
      roh({}),
      roh({ quelle: 'karte', bruttoCent: 2_380, nettoCent: 2_000 }),
      roh({ eventId: 'e0', beginn: '2027-03-01T20:00:00Z' }),
    ]);
    expect(r.map((e) => e.eventId)).toEqual(['e0', 'e1']);
    expect(r[1]).toMatchObject({
      barBruttoCent: 1_190,
      karteNettoCent: 2_000,
      summeBruttoCent: 3_570,
      summeNettoCent: 3_000,
    });
  });

  it('groups the Verlauf by Berlin date', () => {
    // 2027-03-31 23:30 UTC is already April 1 in Berlin.
    const v = eventVerlauf(
      [roh({ beginn: '2027-03-31T23:30:00Z' }), roh({ beginn: '2027-03-10T20:00:00Z' })],
      '2027-03-01',
      '2027-04-30',
      'monat',
    );
    expect(v.punkte.map((p) => [p.schluessel, p.nettoCent])).toEqual([
      ['2027-04', 1_000],
      ['2027-03', 1_000],
    ]);
    expect(v.kategorien).toHaveLength(1);
  });
});

describe('einkaufAuswertung', () => {
  const flasche: Gebinde = {
    id: 'fl',
    menge: 0.5,
    einheit: 'l',
    verpackungseinheit: 'flasche',
    pfandCent: 8,
    unterGebindeId: null,
    unterAnzahl: null,
  };
  const kasten: Gebinde = {
    id: 'ka',
    menge: null,
    einheit: null,
    verpackungseinheit: 'kasten',
    pfandCent: 150,
    unterGebindeId: 'fl',
    unterAnzahl: 20,
  };
  const dose: Gebinde = {
    id: 'do',
    menge: 330,
    einheit: 'kg',
    verpackungseinheit: 'dose',
    pfandCent: null,
    unterGebindeId: null,
    unterAnzahl: null,
  };
  const p = (o: Partial<EinkaufPostenRoh>): EinkaufPostenRoh => ({
    wareId: 'w1',
    wareName: 'Pils',
    standardGebindeId: 'ka',
    gebindeId: 'ka',
    anzahlMilli: 2_000,
    betragCent: 4_000,
    steuersatz: 1900,
    modus: 'netto',
    eigenbeleg: false,
    ...o,
  });
  const pfand = { anfangCent: 0, zugangCent: 0, abgangCent: 0, endeCent: 0 };

  it('resolves Obergebinde and averages the net price', () => {
    const r = einkaufAuswertung(
      [p({}), p({ gebindeId: 'fl', anzahlMilli: 10_000, betragCent: 1_000 })],
      [flasche, kasten],
      2027,
      pfand,
    );
    expect(r.waren).toHaveLength(1);
    const w = r.waren[0]!;
    expect(w.mengeMilli).toBe(25_000); // 2 Kästen = 40 Flaschen + 10 = 50 × 0,5 l
    expect(w.einheit).toBe('l');
    expect(w.nettoCent).toBe(5_000);
    expect(w.preisJeEinheitCent).toBe(200);
    expect(w.preisJeStandardGebindeCent).toBe(2_000); // 50 Flaschen = 2,5 Kästen -> 50,00 / 2,5
  });

  it('turns gross Belege into net and keeps mixed units apart', () => {
    const r = einkaufAuswertung(
      [
        p({ modus: 'brutto', betragCent: 11_900 }),
        p({ gebindeId: 'do', anzahlMilli: 1_000, betragCent: 100, standardGebindeId: null }),
      ],
      [flasche, kasten, dose],
      2027,
      pfand,
    );
    expect(r.waren.map((w) => [w.einheit, w.nettoCent])).toEqual([
      ['kg', 100],
      ['l', 10_000],
    ]);
  });

  it('computes the Pfand balance', () => {
    const s = pfandSaldo(
      [
        { datum: '2026-12-31', betragCent: 1_000 },
        { datum: '2027-01-01', betragCent: 500 },
        { datum: '2027-06-01', betragCent: -200 },
        { datum: '2028-01-01', betragCent: 9_999 },
      ],
      2027,
    );
    expect(s).toEqual({ anfangCent: 1_000, zugangCent: 500, abgangCent: 200, endeCent: 1_300 });
  });
});

describe('csvText', () => {
  it('escapes, formats cents and starts with a BOM', () => {
    const t = csvText(
      ['Name', 'Betrag'],
      [
        ['a;b', { cent: -123_456 }],
        ['Sag "hi"', 1.5],
        ['Zeile\nzwei', null],
      ],
    );
    expect(t).toBe('﻿Name;Betrag\r\n"a;b";-1234,56\r\n"Sag ""hi""";1,5\r\n"Zeile\nzwei";\r\n');
  });
});
