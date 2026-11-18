import { describe, expect, it } from 'vitest';
import {
  belegBerechnen,
  belegBuchungszeilen,
  belegDateiSchluessel,
  belegEntwurfDatenSchema,
  belegNummer,
  belegPruefen,
  offeneAuslagen,
  erstattungBuchungszeilen,
  type BelegRechnung,
} from './belege';
import { pruefeBuchung } from './finanzen';

const p = (einzelpreisCent: number, steuersatz = 1900, anzahlMilli = 1000, kategorieId = 'k1') => ({
  anzahlMilli,
  einzelpreisCent,
  steuersatz,
  kategorieId,
});
const brutto = (
  posten: ReturnType<typeof p>[],
): BelegRechnung & { posten: ReturnType<typeof p>[] } => ({
  modus: 'brutto',
  posten,
  korrekturen: [],
});

describe('belegBerechnen', () => {
  it('splits a gross Beleg per tax rate', () => {
    const r = belegBerechnen(brutto([p(1190), p(214, 700)]));
    expect(r.summe).toBe(1404);
    expect(r.jeSteuersatz).toEqual([
      { satz: 1900, netto: 1000, steuer: 190, brutto: 1190 },
      { satz: 700, netto: 200, steuer: 14, brutto: 214 },
    ]);
  });

  it('calculates the tax on the sum of a rate, not per item', () => {
    // 3 x 0,35 EUR gross at 19 %: per item 0,06 each (0,18), on the sum 0,17.
    const r = belegBerechnen(brutto([p(35), p(35), p(35)]));
    expect(r.jeSteuersatz[0]).toEqual({ satz: 1900, netto: 88, steuer: 17, brutto: 105 });
  });

  it('multiplies quantity in thousandths with the unit price', () => {
    expect(belegBerechnen(brutto([p(333, 0, 1500)])).postenBetraege).toEqual([500]);
  });

  it('calculates net Belege with tax on the sum', () => {
    const r = belegBerechnen({ modus: 'netto', posten: [p(1000), p(1000, 700)], korrekturen: [] });
    expect(r.jeSteuersatz).toEqual([
      { satz: 1900, netto: 1000, steuer: 190, brutto: 1190 },
      { satz: 700, netto: 1000, steuer: 70, brutto: 1070 },
    ]);
    expect(r.summe).toBe(2260);
  });

  it('applies corrections up to 10 ct and rejects larger ones', () => {
    const k = (nettoCent: number, steuerCent: number) => ({
      steuersatz: 1900,
      nettoCent,
      steuerCent,
    });
    const ok = belegBerechnen({ modus: 'netto', posten: [p(1000)], korrekturen: [k(1, -2)] });
    expect(ok.fehler).toEqual([]);
    expect(ok.jeSteuersatz[0]).toEqual({ satz: 1900, netto: 1001, steuer: 188, brutto: 1189 });
    expect(
      belegBerechnen({ modus: 'netto', posten: [p(1000)], korrekturen: [k(0, 11)] }).fehler,
    ).toHaveLength(1);
    expect(
      belegBerechnen({ modus: 'brutto', posten: [p(1000)], korrekturen: [k(1, 0)] }).fehler,
    ).toHaveLength(1);
  });

  it('handles negative items (Pfandrückgabe) and rejects a Beleg that is not positive', () => {
    const r = belegBerechnen(brutto([p(1190), p(-250, 0)]));
    expect(r.summe).toBe(940);
    expect(r.jeSteuersatz.find((g) => g.satz === 0)).toEqual({
      satz: 0,
      netto: -250,
      steuer: 0,
      brutto: -250,
    });
    expect(belegBerechnen(brutto([p(-100, 0)])).fehler).toContain(
      'Die Summe des Belegs muss größer als 0 sein.',
    );
  });
});

describe('belegBuchungszeilen', () => {
  it('books gross Aufwand lines with Vorsteuer fields and a counter line that sums to 0', () => {
    const zeilen = belegBuchungszeilen(
      brutto([p(1190), p(214, 700, 1000, 'k2'), p(100, 0, 1000, 'k3')]),
      {
        kontoId: 'bank',
      },
    );
    expect(zeilen).toHaveLength(4);
    expect(zeilen[0]).toMatchObject({
      kontoId: 'k1',
      betragCent: 1190,
      nettoCent: 1000,
      steuerCent: 190,
      steuersatz: 1900,
      steuerArt: 'vorsteuer',
    });
    expect(zeilen[2]).toMatchObject({
      kontoId: 'k3',
      betragCent: 100,
      steuerArt: 'keine',
      nettoCent: null,
    });
    expect(zeilen[3]).toMatchObject({ kontoId: 'bank', betragCent: -1504 });
    expect(zeilen.reduce((s, z) => s + z.betragCent, 0)).toBe(0);
  });

  it('splits the tax of a rate over its categories and puts the rest cent on the largest', () => {
    const posten = [p(100, 1900, 1000, 'a'), p(100, 1900, 1000, 'b'), p(101, 1900, 1000, 'c')];
    const zeilen = belegBuchungszeilen(brutto(posten), { kontoId: 'bank' });
    const aufwand = zeilen.slice(0, 3);
    expect(aufwand.map((z) => z.betragCent)).toEqual([100, 100, 101]);
    expect(aufwand.reduce((s, z) => s + (z.steuerCent ?? 0), 0)).toBe(48); // 301 - round(301 / 1,19)
    expect(zeilen.reduce((s, z) => s + z.betragCent, 0)).toBe(0);
    for (const z of aufwand) expect((z.nettoCent ?? 0) + (z.steuerCent ?? 0)).toBe(z.betragCent);
  });

  it('turns a net Beleg with corrections into valid gross lines', () => {
    const zeilen = belegBuchungszeilen(
      {
        modus: 'netto',
        posten: [p(1000, 1900, 1000, 'a'), p(500, 1900, 1000, 'b')],
        korrekturen: [{ steuersatz: 1900, nettoCent: 1, steuerCent: -1 }],
      },
      { kontoId: 'bank' },
    );
    expect(zeilen.reduce((s, z) => s + z.betragCent, 0)).toBe(0);
    expect(zeilen.slice(0, 2).reduce((s, z) => s + (z.nettoCent ?? 0), 0)).toBe(1501);
    expect(zeilen.slice(0, 2).reduce((s, z) => s + (z.steuerCent ?? 0), 0)).toBe(284);
  });

  it('passes the signed denominations to the cash counter line', () => {
    const zeilen = belegBuchungszeilen(brutto([p(1250, 0)]), {
      kontoId: 'fach',
      stueckelung: [
        { nennwertCent: 2000, anzahl: -1 },
        { nennwertCent: 500, anzahl: 1 },
        { nennwertCent: 200, anzahl: 1 },
        { nennwertCent: 50, anzahl: 1 },
      ],
    });
    expect(zeilen.at(-1)?.betragCent).toBe(-1250);
    const konten = [
      { id: 'k1', name: 'K', stueckelung: false, archiviert: false },
      { id: 'fach', name: 'Fach', stueckelung: true, archiviert: false },
    ];
    expect(pruefeBuchung({ zeilen: zeilen.map((z) => ({ ...z })) }, konten)).toEqual([]);
  });
});

describe('Nummer, Dateischlüssel, Erstattungszeilen', () => {
  it('formats the Belegnummer', () => {
    expect(belegNummer(2027, 1)).toBe('B-2027-0001');
    expect(belegNummer(2027, 12345)).toBe('B-2027-12345');
  });
  it('builds the archive key from hash and type', () => {
    expect(belegDateiSchluessel('a'.repeat(64), 'image/jpeg')).toBe(`belege/${'a'.repeat(64)}.jpg`);
  });
  it('books an Erstattung from Auslagen', () => {
    const z = erstattungBuchungszeilen(1500, { kontoId: 'bank' });
    expect(z.map((x) => [x.kontoId, x.betragCent])).toEqual([
      ['auslagen', 1500],
      ['bank', -1500],
    ]);
  });
});

describe('belegPruefen', () => {
  const sha = 'b'.repeat(64);
  const gut = () =>
    belegEntwurfDatenSchema.parse({
      rechnungsstellerId: 'r1',
      belegdatum: '2027-01-05',
      posten: [{ kategorieId: 'k1', anzahlMilli: 1000, einzelpreisCent: 1190, steuersatz: 1900 }],
      zahlweg: 'bank',
      bezahldatum: '2027-01-06',
      datei: {
        sha256: sha,
        schluessel: belegDateiSchluessel(sha, 'application/pdf'),
        typ: 'application/pdf',
        name: 'a.pdf',
      },
    });

  it('accepts a complete Beleg', () => {
    expect(belegPruefen(gut())).toEqual([]);
  });

  it('reports the missing fields of an empty draft', () => {
    const felder = belegPruefen(belegEntwurfDatenSchema.parse({})).map((f) => f.feld);
    expect(felder).toEqual(['rechnungssteller', 'belegdatum', 'posten', 'datei', 'zahlweg']);
  });

  it('needs a reason instead of a file (Eigenbeleg)', () => {
    const d = { ...gut(), datei: null };
    expect(belegPruefen(d).map((f) => f.feld)).toEqual(['datei']);
    expect(belegPruefen({ ...d, eigenbelegBegruendung: 'Beleg verloren' })).toEqual([]);
  });

  it('needs the Zahlweg fields', () => {
    expect(belegPruefen({ ...gut(), bezahldatum: null }).map((f) => f.feld)).toEqual([
      'bezahldatum',
    ]);
    expect(belegPruefen({ ...gut(), zahlweg: 'auslage' }).map((f) => f.feld)).toEqual(['mitglied']);
    expect(belegPruefen({ ...gut(), zahlweg: 'bar' }).map((f) => f.feld)).toEqual([
      'fach',
      'stueckelung',
    ]);
  });

  it('checks that the Stückelung equals the amount', () => {
    const bar = { ...gut(), zahlweg: 'bar' as const, fachId: 'f1' };
    const falsch = { ...bar, stueckelung: [{ nennwertCent: 1000, anzahl: -1 }] };
    expect(belegPruefen(falsch).map((f) => f.feld)).toEqual(['stueckelung']);
    const richtig = {
      ...bar,
      stueckelung: [
        { nennwertCent: 2000, anzahl: -1 },
        { nennwertCent: 500, anzahl: 1 },
        { nennwertCent: 200, anzahl: 1 },
        { nennwertCent: 100, anzahl: 1 },
      ],
    };
    expect(
      belegPruefen({
        ...richtig,
        posten: [{ ...richtig.posten[0]!, einzelpreisCent: 1200, steuersatz: 0 }],
      }),
    ).toEqual([]);
  });
});

describe('offeneAuslagen', () => {
  const b = (id: string, mitgliedId: string, summeCent: number, buchungId = `b-${id}`) => ({
    id,
    mitgliedId,
    zahlweg: 'auslage' as const,
    summeCent,
    buchungId,
  });
  const belege = [
    b('1', 'm2', 500),
    b('2', 'm1', 300),
    b('3', 'm1', 200),
    { ...b('4', 'm1', 999), zahlweg: 'bank' as const },
  ];

  it('sums the open Auslagen per member', () => {
    const r = offeneAuslagen(belege, [], new Set());
    expect(r.map((x) => [x.mitgliedId, x.summeCent, x.belege.length])).toEqual([
      ['m1', 500, 2],
      ['m2', 500, 1],
    ]);
  });

  it('leaves out reimbursed and reversed Belege, and frees them when the Erstattung is reversed', () => {
    const erstattung = [{ buchungId: 'e-1', belegIds: ['2'] }];
    expect(offeneAuslagen(belege, erstattung, new Set(['b-3'])).map((x) => x.mitgliedId)).toEqual([
      'm2',
    ]);
    expect(
      offeneAuslagen(belege, erstattung, new Set(['e-1'])).find((x) => x.mitgliedId === 'm1')
        ?.summeCent,
    ).toBe(500);
  });
});
