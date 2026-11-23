import { describe, expect, it } from 'vitest';
import { belegBerechnen } from './belege';
import { pruefeBuchung } from './finanzen';
import {
  ERLOESE_OFFEN_KONTO_ID,
  FORDERUNGEN_KONTO_ID,
  rechnungBerechnen,
  rechnungDateiSchluessel,
  rechnungEntwurfDatenSchema,
  rechnungNummer,
  rechnungPruefen,
  rechnungStatus,
  rechnungStellungsZeilen,
  rechnungUeberfaellig,
  rechnungWarnungen,
  rechnungZahlungPruefen,
  rechnungZahlungsZeilen,
  rechnungZahlungSchema,
  faelligAm,
  letzterPreisJeGebinde,
  warenGebindeKey,
  type RechnungEntwurfDaten,
} from './rechnungen';
import { STEUERSATZ_ZEITRAEUME_SEED } from './steuersaetze';

const frei = (
  einzelpreisCent: number,
  steuersatz = 1900,
  erloesKontoId = 'e1',
  anzahlMilli = 1000,
) => ({
  art: 'frei' as const,
  text: 'Leistung',
  anzahlMilli,
  einzelpreisCent,
  steuersatz,
  erloesKontoId,
  preisFormel: null,
});
const ware = (einzelpreisCent: number, pfandCent: number | null, steuersatz = 700) => ({
  art: 'ware' as const,
  wareId: 'w1',
  gebindeId: 'g1',
  text: 'Cola',
  anzahlMilli: 1000,
  einzelpreisCent,
  pfandCent,
  steuersatz,
  erloesKontoId: 'e2',
  preisFormel: null,
});

const kontext = { heute: '2026-11-23', zeitraeume: STEUERSATZ_ZEITRAEUME_SEED };
const daten = (over: Partial<RechnungEntwurfDaten> = {}): RechnungEntwurfDaten =>
  rechnungEntwurfDatenSchema.parse({
    empfaenger: { typ: 'extern', id: 'x' },
    leistungVon: '2026-11-20',
    betreff: 'Getränke',
    posten: [frei(10000)],
    ...over,
  });

describe('rechnungBerechnen', () => {
  it('uses the Beleg calculation (gross, mixed rates, deposit)', () => {
    const r = { modus: 'brutto' as const, posten: [frei(10000, 1900), ware(2100, 310)] };
    const b = rechnungBerechnen(r);
    expect(b.summe).toBe(10000 + 2410);
    expect(b.pfandBetraege).toEqual([0, 310]);
    expect(b.jeSteuersatz.map((g) => g.satz)).toEqual([1900, 700]);
    expect(b.fehler).toEqual([]);
  });

  it('calculates the tax on the sum of a rate when net', () => {
    const b = rechnungBerechnen({
      modus: 'netto',
      posten: [frei(333, 1900), frei(333, 1900), frei(333, 1900)],
    });
    // 999 net, tax round(999 * 0.19) = 190 (not 3 x 63)
    expect(b.jeSteuersatz).toEqual([{ satz: 1900, netto: 999, steuer: 190, brutto: 1189 }]);
  });

  it('matches belegBerechnen', () => {
    const p = [frei(1234, 1900), frei(99, 700)];
    expect(rechnungBerechnen({ modus: 'brutto', posten: p }).summe).toBe(
      belegBerechnen({
        modus: 'brutto',
        korrekturen: [],
        posten: p.map((x) => ({ ...x, art: 'kategorie' as const })),
      }).summe,
    );
  });
});

describe('journal lines', () => {
  const konten = ['e1', 'e2', 'bank', 'pfand', FORDERUNGEN_KONTO_ID, ERLOESE_OFFEN_KONTO_ID].map(
    (id) => ({ id, name: id, stueckelung: false, archiviert: false }),
  );

  it('books the Stellung without revenue and tax', () => {
    const z = rechnungStellungsZeilen(11900);
    expect(z.map((x) => [x.kontoId, x.betragCent, x.steuerArt])).toEqual([
      [FORDERUNGEN_KONTO_ID, 11900, 'keine'],
      [ERLOESE_OFFEN_KONTO_ID, -11900, 'keine'],
    ]);
    expect(pruefeBuchung({ zeilen: z }, konten)).toEqual([]);
  });

  it('books the payment with USt per Erlöskonto and rate, deposit against Pfand', () => {
    const r = {
      modus: 'brutto' as const,
      posten: [frei(11900, 1900, 'e1'), ware(2100, 310)],
    };
    const z = rechnungZahlungsZeilen(r, { kontoId: 'bank' });
    expect(z[0]).toMatchObject({ kontoId: 'bank', betragCent: 14310 });
    expect(z[1]).toMatchObject({ kontoId: FORDERUNGEN_KONTO_ID, betragCent: -14310 });
    expect(z[2]).toMatchObject({ kontoId: ERLOESE_OFFEN_KONTO_ID, betragCent: 14310 });
    expect(z.find((x) => x.kontoId === 'e1')).toMatchObject({
      betragCent: -11900,
      nettoCent: -10000,
      steuerCent: -1900,
      steuersatz: 1900,
      steuerArt: 'ust',
    });
    const e2 = z.find((x) => x.kontoId === 'e2')!;
    const pfand = z.find((x) => x.kontoId === 'pfand')!;
    expect(e2).toMatchObject({ betragCent: -2100, steuerArt: 'ust', steuersatz: 700 });
    expect(pfand).toMatchObject({ betragCent: -310, steuerArt: 'ust', steuersatz: 700 });
    expect(e2.nettoCent! + pfand.nettoCent!).toBe(-Math.round((2410 * 10000) / 10700));
    expect(z.reduce((s, x) => s + x.betragCent, 0)).toBe(0);
    expect(pruefeBuchung({ zeilen: z }, konten)).toEqual([]);
  });

  it('puts the money on the Fach with the Stückelung', () => {
    const z = rechnungZahlungsZeilen(
      { modus: 'brutto', posten: [frei(5000)] },
      { kontoId: 'safe', stueckelung: [{ nennwertCent: 5000, anzahl: 1 }] },
    );
    expect(z[0]).toMatchObject({
      kontoId: 'safe',
      stueckelung: [{ nennwertCent: 5000, anzahl: 1 }],
    });
  });

  it('books net invoices with tax on top', () => {
    const z = rechnungZahlungsZeilen(
      { modus: 'netto', posten: [frei(10000)] },
      { kontoId: 'bank' },
    );
    expect(z[0]!.betragCent).toBe(11900);
    expect(z[3]).toMatchObject({ betragCent: -11900, nettoCent: -10000, steuerCent: -1900 });
  });

  it('books a 0 % item without USt fields', () => {
    const z = rechnungZahlungsZeilen(
      { modus: 'brutto', posten: [frei(5000, 0)] },
      { kontoId: 'bank' },
    );
    expect(z[3]).toMatchObject({ betragCent: -5000, steuerArt: 'keine', nettoCent: null });
  });
});

describe('rechnungPruefen', () => {
  it('accepts a complete draft', () => {
    expect(rechnungPruefen(daten(), kontext)).toEqual([]);
  });

  it('reports missing fields with table and row', () => {
    const f = rechnungPruefen(
      daten({
        empfaenger: null,
        leistungVon: null,
        betreff: '',
        posten: [
          { ...frei(100), erloesKontoId: null, text: '' },
          { ...ware(100, null), wareId: null, erloesKontoId: null },
        ],
      }),
      kontext,
    ).map((x) => x.meldung);
    expect(f).toContain('Bitte wähle einen Empfänger.');
    expect(f).toContain('Bitte gib das Leistungsdatum an.');
    expect(f).toContain('Bitte gib einen Betreff an.');
    expect(f).toContain('Freitext, Zeile 1: Bitte wähle eine Erlös-Kategorie.');
    expect(f).toContain('Freitext, Zeile 1: Bitte gib den Text an.');
    expect(f).toContain('Waren, Zeile 1: Bitte wähle eine Ware.');
  });

  it('rejects an invalid tax rate and a zero total', () => {
    const f = rechnungPruefen(daten({ posten: [frei(0, 1234)] }), kontext).map((x) => x.meldung);
    expect(f.some((m) => m.startsWith('Freitext, Zeile 1: Der Steuersatz 12,34 %'))).toBe(true);
    expect(f).toContain('Die Rechnung muss einen Betrag über 0 € ergeben.');
  });
});

describe('rechnungWarnungen', () => {
  it('warns about a future service date, a high amount and zero prices', () => {
    const w = rechnungWarnungen({
      daten: daten({ leistungVon: '2026-12-01', posten: [frei(60000), frei(0)] }),
      heute: '2026-11-23',
    }).map((x) => x.code);
    expect(w).toEqual(['leistung_zukunft', 'hoher_betrag', 'preis_null']);
  });
  it('has no warnings for a normal draft', () => {
    expect(rechnungWarnungen({ daten: daten(), heute: '2026-11-23' })).toEqual([]);
  });
});

describe('rechnungZahlungPruefen', () => {
  const k = { heute: '2026-11-23', rechnungsdatum: '2026-11-20', bruttoCent: 5000 };
  it('rejects a future payment date, warns before the Rechnungsdatum', () => {
    expect(
      rechnungZahlungPruefen(
        { zahlweg: 'bank', datum: '2026-11-24', fachId: null, stueckelung: [] },
        k,
      ).fehler,
    ).toHaveLength(1);
    expect(
      rechnungZahlungPruefen(
        { zahlweg: 'bank', datum: '2026-11-19', fachId: null, stueckelung: [] },
        k,
      ).warnungen.map((w) => w.code),
    ).toEqual(['zahlung_vor_rechnung']);
  });
  it('checks Fach and Stückelung for cash', () => {
    const bar = (stueckelung: { nennwertCent: number; anzahl: number }[], fachId: string | null) =>
      rechnungZahlungPruefen({ zahlweg: 'bar', datum: '2026-11-22', fachId, stueckelung }, k)
        .fehler;
    expect(bar([{ nennwertCent: 5000, anzahl: 1 }], 'safe')).toEqual([]);
    expect(bar([{ nennwertCent: 1000, anzahl: 1 }], 'safe')[0]).toMatch(/passt nicht/);
    expect(bar([], null)).toHaveLength(2);
  });
  it('requires a Fach for cash in the schema', () => {
    const r = rechnungZahlungSchema.safeParse({
      idempotenzSchluessel: crypto.randomUUID(),
      zahlweg: 'bar',
      datum: '2026-11-22',
    });
    expect(r.success).toBe(false);
  });
});

describe('number, status, due date', () => {
  it('formats the number with three digits and the year', () => {
    expect(rechnungNummer(2027, 1)).toBe('001-2027');
    expect(rechnungNummer(2027, 1234)).toBe('1234-2027');
  });
  it('derives the status', () => {
    const s = (istStorno: boolean, stornoRechnungVorhanden: boolean, bezahlt: boolean) =>
      rechnungStatus({ istStorno, stornoRechnungVorhanden, bezahlt });
    expect(s(false, false, false)).toBe('gestellt');
    expect(s(false, false, true)).toBe('bezahlt');
    expect(s(false, true, false)).toBe('storniert');
    expect(s(true, false, false)).toBe('storniert');
  });
  it('marks overdue only for gestellt', () => {
    expect(rechnungUeberfaellig('gestellt', '2026-11-22', '2026-11-23')).toBe(true);
    expect(rechnungUeberfaellig('gestellt', '2026-11-23', '2026-11-23')).toBe(false);
    expect(rechnungUeberfaellig('bezahlt', '2026-01-01', '2026-11-23')).toBe(false);
  });
  it('adds the Zahlungsziel', () => {
    expect(faelligAm('2026-12-20', 14)).toBe('2027-01-03');
  });
  it('builds the archive key', () => {
    expect(rechnungDateiSchluessel('ab')).toBe('rechnungen/ab.pdf');
  });
});

describe('letzterPreisJeGebinde', () => {
  it('takes the newest price per Ware and Gebinde and converts net to gross', () => {
    const preise = letzterPreisJeGebinde([
      { wareId: 'w', gebindeId: 'g', modus: 'netto', einzelpreisCent: 1000, steuersatz: 1900 },
      { wareId: 'w', gebindeId: 'g', modus: 'brutto', einzelpreisCent: 500, steuersatz: 1900 },
      { wareId: 'w', gebindeId: 'h', modus: 'brutto', einzelpreisCent: 700, steuersatz: 700 },
      { wareId: null, gebindeId: null, modus: 'brutto', einzelpreisCent: 1, steuersatz: 0 },
    ]);
    expect(preise.get(warenGebindeKey('w', 'g'))).toBe(1190);
    expect(preise.get(warenGebindeKey('w', 'h'))).toBe(700);
    expect(preise.size).toBe(2);
  });
});
