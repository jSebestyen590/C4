import { describe, expect, it } from 'vitest';
import {
  artikelListeBilden,
  artikelVorschlaegeBilden,
  belegBerechnen,
  belegBuchungVerschoben,
  belegBuchungszeilen,
  belegDateiSchluessel,
  belegEntwurfDatenSchema,
  belegNummer,
  belegPruefen,
  offeneAuslagen,
  erstattungBuchungszeilen,
  postenBetrag,
  einreichungStatus,
  warengruppeKategorie,
  PFAND_KONTO_ID,
  type BelegRechnung,
} from './belege';
import { formatEuro, pruefeBuchung } from './finanzen';

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

  it('handles negative items (Pfandrückgabe) and allows a Beleg sum of 0 or below', () => {
    const r = belegBerechnen(brutto([p(1190), p(-250, 0)]));
    expect(r.summe).toBe(940);
    expect(r.jeSteuersatz.find((g) => g.satz === 0)).toEqual({
      satz: 0,
      netto: -250,
      steuer: 0,
      brutto: -250,
    });
    expect(belegBerechnen(brutto([p(-100, 0)]))).toMatchObject({ summe: -100, fehler: [] });
    expect(belegBerechnen(brutto([p(100, 0), p(-100, 0)]))).toMatchObject({ summe: 0, fehler: [] });
  });

  it('counts Leergut negative: quantity times Pfand, rounded', () => {
    expect(postenBetrag({ art: 'leergut', anzahlMilli: 1000, einzelpreisCent: 310 })).toBe(-310);
    expect(postenBetrag({ art: 'leergut', anzahlMilli: 2500, einzelpreisCent: 15 })).toBe(-38);
    expect(postenBetrag({ art: 'kategorie', anzahlMilli: 1000, einzelpreisCent: 310 })).toBe(310);
    const r = belegBerechnen({
      modus: 'brutto',
      posten: [{ art: 'leergut', anzahlMilli: 1000, einzelpreisCent: 310, steuersatz: 0 }],
      korrekturen: [],
    });
    expect(r).toMatchObject({ postenBetraege: [-310], summe: -310, fehler: [] });
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
  it('books a negative Erstattung (the member pays in) with signs reversed', () => {
    const z = erstattungBuchungszeilen(-1500, {
      kontoId: 'fach',
      stueckelung: [{ nennwertCent: 500, anzahl: 3 }],
    });
    expect(z.map((x) => [x.kontoId, x.betragCent])).toEqual([
      ['auslagen', -1500],
      ['fach', 1500],
    ]);
    expect(z[1]!.stueckelung).toEqual([{ nennwertCent: 500, anzahl: 3 }]);
  });
});

const PRUEF_KONTEXT = {
  heute: '2027-06-01',
  zeitraeume: [
    { ab: '2007-01-01', regel: 1900, ermaessigt: 700 },
    { ab: '2020-07-01', regel: 1600, ermaessigt: 500 },
    { ab: '2021-01-01', regel: 1900, ermaessigt: 700 },
  ],
};
const pruefen = (d: Parameters<typeof belegPruefen>[0]) => belegPruefen(d, PRUEF_KONTEXT);

describe('belegPruefen', () => {
  const sha = 'b'.repeat(64);
  const gut = () =>
    belegEntwurfDatenSchema.parse({
      rechnungsstellerId: 'r1',
      belegdatum: '2027-01-05',
      belegsummeCent: 1190,
      posten: [
        {
          kategorieId: 'k1',
          text: 'Deko',
          anzahlMilli: 1000,
          einzelpreisCent: 1190,
          steuersatz: 1900,
        },
      ],
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
    expect(pruefen(gut())).toEqual([]);
  });

  it('checks the Steuersatz on the Belegdatum, but not for an Eigenbeleg', () => {
    const falsch = { ...gut(), posten: [{ ...gut().posten[0]!, steuersatz: 1600 }] };
    expect(pruefen(falsch).map((f) => f.meldung)).toEqual([
      expect.stringContaining('gilt am Belegdatum nicht'),
    ]);
    expect(pruefen({ ...falsch, datei: null, eigenbelegBegruendung: 'Bon weg' })).toEqual([]);
  });

  it('reports the missing fields of an empty draft', () => {
    const felder = pruefen(belegEntwurfDatenSchema.parse({})).map((f) => f.feld);
    expect(felder).toEqual([
      'rechnungssteller',
      'belegdatum',
      'posten',
      'belegsumme',
      'datei',
      'zahlweg',
    ]);
  });

  it('requires the Belegsumme and that it equals the sum of the Posten', () => {
    expect(pruefen({ ...gut(), belegsummeCent: null })).toEqual([
      { feld: 'belegsumme', meldung: 'Bitte gib die Belegsumme an.' },
    ]);
    expect(pruefen({ ...gut(), belegsummeCent: 1000 })).toEqual([
      {
        feld: 'belegsumme',
        meldung: `Die Posten ergeben ${formatEuro(1190)}, die Belegsumme ist ${formatEuro(1000)}.`,
      },
    ]);
  });

  it('accepts a Beleg that adds up to 0 without Fach and Stückelung (Bar)', () => {
    const d = { ...gut(), belegsummeCent: 0 };
    d.posten = [
      d.posten[0]!,
      { art: 'leergut', text: 'K', anzahlMilli: 1000, einzelpreisCent: 1190, steuersatz: 1900 },
    ];
    expect(pruefen(d)).toEqual([]);
    expect(pruefen({ ...d, zahlweg: 'bar' })).toEqual([]);
    expect(
      pruefen({ ...d, zahlweg: 'bar', stueckelung: [{ nennwertCent: 100, anzahl: 1 }] }).map(
        (f) => f.feld,
      ),
    ).toEqual(['stueckelung']);
  });

  it('allows a Beleg sum of 0 or below (Leergut only) for every Zahlweg', () => {
    const leergut = {
      art: 'leergut' as const,
      text: 'Kästen',
      anzahlMilli: 1000,
      einzelpreisCent: 310,
      steuersatz: 0,
    };
    const neg = { ...gut(), posten: [leergut], belegsummeCent: -310 };
    expect(pruefen(neg)).toEqual([]);
    expect(pruefen({ ...neg, zahlweg: 'auslage', mitgliedId: 'm1' })).toEqual([]);
    const bar = { ...neg, zahlweg: 'bar' as const, fachId: 'f1' };
    expect(
      pruefen({ ...bar, stueckelung: [{ nennwertCent: 100, anzahl: 3 }] }).map((f) => f.feld),
    ).toEqual(['stueckelung']);
    expect(
      pruefen({
        ...bar,
        stueckelung: [
          { nennwertCent: 200, anzahl: 1 },
          { nennwertCent: 100, anzahl: 1 },
          { nennwertCent: 10, anzahl: 1 },
        ],
      }),
    ).toEqual([]);
  });

  it('needs a reason instead of a file (Eigenbeleg)', () => {
    const d = { ...gut(), datei: null };
    expect(pruefen(d).map((f) => f.feld)).toEqual(['datei']);
    expect(pruefen({ ...d, eigenbelegBegruendung: 'Beleg verloren' })).toEqual([]);
  });

  it('needs the Zahlweg fields', () => {
    expect(pruefen({ ...gut(), bezahldatum: null }).map((f) => f.feld)).toEqual(['bezahldatum']);
    expect(pruefen({ ...gut(), zahlweg: 'auslage' }).map((f) => f.feld)).toEqual(['mitglied']);
    expect(pruefen({ ...gut(), zahlweg: 'bar' }).map((f) => f.feld)).toEqual([
      'fach',
      'stueckelung',
    ]);
  });

  it('checks that the Stückelung equals the amount', () => {
    const bar = { ...gut(), zahlweg: 'bar' as const, fachId: 'f1' };
    const falsch = { ...bar, stueckelung: [{ nennwertCent: 1000, anzahl: -1 }] };
    expect(pruefen(falsch).map((f) => f.feld)).toEqual(['stueckelung']);
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
      pruefen({
        ...richtig,
        posten: [{ ...richtig.posten[0]!, einzelpreisCent: 1200, steuersatz: 0 }],
        belegsummeCent: 1200,
      }),
    ).toEqual([]);
  });
});

describe('offeneAuslagen (0)', () => {
  it('ignores a Beleg of 0', () => {
    const b = (id: string, summeCent: number) => ({
      id,
      mitgliedId: 'm1',
      zahlweg: 'auslage' as const,
      summeCent,
      buchungId: `b-${id}`,
    });
    const r = offeneAuslagen([b('1', 0), b('2', 500)], [], new Set());
    expect(r.map((m) => m.belege.map((x) => x.id))).toEqual([['2']]);
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

describe('Ware, Pfand und Leergut', () => {
  const ware = (einzelpreisCent: number, pfandCent: number | null, steuersatz = 1900) => ({
    art: 'ware' as const,
    anzahlMilli: 2000,
    einzelpreisCent,
    steuersatz,
    pfandCent,
    kategorieId: 'getraenke',
  });

  it('adds the deposit per Gebinde to the sum per tax rate', () => {
    const r = belegBerechnen({
      modus: 'brutto',
      posten: [ware(1190, 150)],
      korrekturen: [],
    });
    expect(r.postenBetraege).toEqual([2380]);
    expect(r.pfandBetraege).toEqual([300]);
    expect(r.summe).toBe(2680);
    expect(r.jeSteuersatz[0]).toMatchObject({ satz: 1900, brutto: 2680, netto: 2252 });
  });

  it('adds the deposit to the net sum of a Netto Beleg and taxes it', () => {
    const r = belegBerechnen({ modus: 'netto', posten: [ware(1000, 250)], korrekturen: [] });
    expect(r.jeSteuersatz[0]).toMatchObject({ netto: 2500, steuer: 475, brutto: 2975 });
  });

  it('keeps mixed tax rates with deposit apart', () => {
    const r = belegBerechnen({
      modus: 'brutto',
      posten: [ware(1000, 100, 1900), ware(500, null, 700)],
      korrekturen: [],
    });
    expect(r.jeSteuersatz.map((g) => [g.satz, g.brutto])).toEqual([
      [1900, 2200],
      [700, 1000],
    ]);
  });

  it('books Ware to the category and the deposit to Pfand, grouped by Konto and rate', () => {
    const zeilen = belegBuchungszeilen(
      { modus: 'brutto', posten: [ware(1190, 150)], korrekturen: [] },
      { kontoId: 'bank' },
    );
    expect(zeilen.map((z) => [z.kontoId, z.betragCent, z.steuersatz])).toEqual([
      ['getraenke', 2380, 1900],
      ['pfand', 300, 1900],
      ['bank', -2680, null],
    ]);
    const konten = ['getraenke', 'pfand', 'bank'].map((id) => ({
      id,
      name: id,
      stueckelung: false,
      archiviert: false,
    }));
    expect(pruefeBuchung({ zeilen: zeilen.map((z) => ({ ...z })) }, konten)).toEqual([]);
  });

  it('books a Leergut return against Pfand', () => {
    const zeilen = belegBuchungszeilen(
      {
        modus: 'brutto',
        posten: [
          ware(1190, 150),
          { art: 'leergut', anzahlMilli: 2000, einzelpreisCent: 150, steuersatz: 1900 },
        ],
        korrekturen: [],
      },
      { kontoId: 'bank' },
    );
    // Pfand and Leergut cancel out: no empty Pfand line.
    expect(zeilen.map((z) => [z.kontoId, z.betragCent])).toEqual([
      ['getraenke', 2380],
      ['bank', -2380],
    ]);
  });

  it('merges Pfand and Leergut of a rate into one line', () => {
    const zeilen = belegBuchungszeilen(
      {
        modus: 'brutto',
        posten: [
          ware(1190, 150),
          { art: 'leergut', anzahlMilli: 1000, einzelpreisCent: 100, steuersatz: 1900 },
        ],
        korrekturen: [],
      },
      { kontoId: 'bank' },
    );
    expect(zeilen.filter((z) => z.kontoId === 'pfand')).toHaveLength(1);
    expect(zeilen.find((z) => z.kontoId === 'pfand')!.betragCent).toBe(200);
  });

  it('groups Ware and Kategorie items of the same Konto', () => {
    const zeilen = belegBuchungszeilen(
      {
        modus: 'brutto',
        posten: [ware(1000, null), p(500, 1900, 1000, 'getraenke')],
        korrekturen: [],
      },
      { kontoId: 'bank' },
    );
    expect(zeilen.map((z) => [z.kontoId, z.betragCent])).toEqual([
      ['getraenke', 2500],
      ['bank', -2500],
    ]);
  });
});

describe('belegPruefen mit Ware', () => {
  const basis = {
    rechnungsstellerId: 'r1',
    belegdatum: '2027-01-05',
    zahlweg: 'auslage',
    mitgliedId: 'm1',
    eigenbelegBegruendung: 'weg',
  };
  const wareRoh = (extra: Record<string, unknown> = {}) => ({
    art: 'ware',
    wareId: 'w1',
    gebindeId: 'g1',
    kategorieId: 'k1',
    anzahlMilli: 3000,
    einzelpreisCent: 1000,
    steuersatz: 1900,
    ...extra,
  });
  const pruefe = (posten: unknown[], extra: Record<string, unknown> = {}) =>
    pruefen(belegEntwurfDatenSchema.parse({ ...basis, posten, ...extra }));

  it('treats a posten without art as Kategorie', () => {
    const d = belegEntwurfDatenSchema.parse({
      posten: [{ kategorieId: 'k1', anzahlMilli: 1000, einzelpreisCent: 100, steuersatz: 0 }],
    });
    expect(d.posten[0]!.art).toBe('kategorie');
  });

  it('accepts Ware and Leergut', () => {
    expect(
      pruefe(
        [
          wareRoh(),
          {
            art: 'leergut',
            text: 'Kästen',
            anzahlMilli: 1000,
            einzelpreisCent: 150,
            steuersatz: 1900,
          },
        ],
        { belegsummeCent: 2850 },
      ),
    ).toEqual([]);
  });

  it('requires Ware, Gebinde and a text for Leergut', () => {
    const fehler = pruefe([
      wareRoh({ wareId: null }),
      wareRoh({ gebindeId: null }),
      wareRoh({ wareId: null }),
      { art: 'leergut', anzahlMilli: 1000, einzelpreisCent: 150, steuersatz: 0 },
      { art: 'leergut', text: 'Kästen', anzahlMilli: 0, einzelpreisCent: 150, steuersatz: 0 },
    ]);
    expect(fehler.filter((f) => f.feld === 'posten').map((f) => f.meldung)).toEqual([
      'Waren, Zeile 1: Bitte wähle eine Ware.',
      'Waren, Zeile 2: Bitte wähle ein Gebinde.',
      'Waren, Zeile 3: Bitte wähle eine Ware.',
      'Leergut, Zeile 1: Bitte beschreibe das Leergut.',
      'Leergut, Zeile 2: Bitte gib die Anzahl an.',
    ]);
    expect(
      belegEntwurfDatenSchema.safeParse({
        ...basis,
        posten: [{ art: 'leergut', anzahlMilli: -1000, einzelpreisCent: 150, steuersatz: 0 }],
      }).success,
    ).toBe(false);
    expect(
      belegEntwurfDatenSchema.safeParse({
        ...basis,
        posten: [{ art: 'leergut', anzahlMilli: 1000, einzelpreisCent: -150, steuersatz: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe('warengruppeKategorie', () => {
  const gruppen = [
    { id: 'a', parentId: null, kategorieId: 'k1' },
    { id: 'b', parentId: 'a', kategorieId: null },
    { id: 'c', parentId: 'b', kategorieId: 'k2' },
    { id: 'd', parentId: 'c', kategorieId: null },
    { id: 'x', parentId: null, kategorieId: null },
  ];
  it('inherits from the nearest ancestor with an assignment', () => {
    expect(warengruppeKategorie(gruppen, 'b')).toBe('k1');
    expect(warengruppeKategorie(gruppen, 'd')).toBe('k2');
    expect(warengruppeKategorie(gruppen, 'a')).toBe('k1');
  });
  it('returns null without assignment or for an unknown group', () => {
    expect(warengruppeKategorie(gruppen, 'x')).toBeNull();
    expect(warengruppeKategorie(gruppen, 'nope')).toBeNull();
    expect(warengruppeKategorie(gruppen, null)).toBeNull();
  });
});

describe('einreichungStatus', () => {
  it('derives the status from draft and Beleg', () => {
    const s = einreichungStatus;
    expect(s({ entwurfStatus: 'eingereicht', beleg: null })).toBe('eingereicht');
    expect(s({ entwurfStatus: 'verworfen', beleg: null })).toBe('verworfen');
    expect(s({ entwurfStatus: null, beleg: { storniert: false, erstattet: false } })).toBe(
      'gebucht',
    );
    expect(s({ entwurfStatus: null, beleg: { storniert: false, erstattet: true } })).toBe(
      'erstattet',
    );
    expect(s({ entwurfStatus: null, beleg: { storniert: true, erstattet: true } })).toBe(
      'storniert',
    );
  });
});

describe('belegBuchungszeilen mit Leergut (vorzeichenrichtig)', () => {
  const kat = (einzelpreisCent: number, steuersatz = 1900, kategorieId = 'getraenke') => ({
    art: 'kategorie' as const,
    anzahlMilli: 1000,
    einzelpreisCent,
    steuersatz,
    kategorieId,
  });
  const leergut = (einzelpreisCent: number, steuersatz = 1900) => ({
    art: 'leergut' as const,
    anzahlMilli: 1000,
    einzelpreisCent,
    steuersatz,
  });
  const summe = (z: { betragCent: number }[]) => z.reduce((s, x) => s + x.betragCent, 0);
  const brutto0 = (posten: Parameters<typeof belegBuchungszeilen>[0]['posten']) =>
    belegBuchungszeilen({ modus: 'brutto', posten, korrekturen: [] }, { kontoId: 'bank' });

  it('books Kategorie 10,00 and Leergut -3,10 with their own signs (brutto)', () => {
    const z = brutto0([kat(1000), leergut(310)]);
    expect(z[0]).toMatchObject({ kontoId: 'getraenke', betragCent: 1000 });
    expect(z[1]).toMatchObject({ kontoId: PFAND_KONTO_ID, betragCent: -310 });
    expect(z[1]!.nettoCent! + z[1]!.steuerCent!).toBe(-310);
    expect(z[0]!.nettoCent! + z[0]!.steuerCent!).toBe(1000);
    expect(z[2]).toMatchObject({ kontoId: 'bank', betragCent: -690 });
    expect(summe(z)).toBe(0);
  });

  it('has no counter line when the Beleg sums to 0', () => {
    const z = brutto0([kat(310), leergut(310)]);
    expect(z).toHaveLength(2);
    expect(z[0]).toMatchObject({ kontoId: 'getraenke', betragCent: 310 });
    expect(z[1]).toMatchObject({ kontoId: PFAND_KONTO_ID, betragCent: -310 });
    expect(summe(z)).toBe(0);
  });

  it('works in netto mode with Leergut', () => {
    const z = belegBuchungszeilen(
      { modus: 'netto', posten: [kat(1000), leergut(300)], korrekturen: [] },
      { kontoId: 'bank' },
    );
    expect(z[0]).toMatchObject({ betragCent: 1190, nettoCent: 1000, steuerCent: 190 });
    expect(z[1]).toMatchObject({ betragCent: -357, nettoCent: -300, steuerCent: -57 });
    expect(summe(z)).toBe(0);
  });

  it('handles mixed rates and Ware with Pfand and Leergut together', () => {
    const ware = {
      art: 'ware' as const,
      anzahlMilli: 2000,
      einzelpreisCent: 1190,
      steuersatz: 1900,
      pfandCent: 150,
      kategorieId: 'getraenke',
    };
    const z = brutto0([ware, leergut(310), kat(214, 700, 'essen')]);
    const pfand = z.filter((x) => x.kontoId === PFAND_KONTO_ID);
    expect(pfand).toHaveLength(1);
    expect(pfand[0]!.betragCent).toBe(300 - 310);
    expect(z.find((x) => x.kontoId === 'getraenke')!.betragCent).toBe(2380);
    expect(z.find((x) => x.kontoId === 'essen')).toMatchObject({ betragCent: 214, nettoCent: 200 });
    expect(summe(z)).toBe(0);
  });
});

describe('Artikel', () => {
  it('adds the default tax rate to the suggestions (null when unknown)', () => {
    const r = artikelVorschlaegeBilden(
      [
        { artikel: 'Deko', kategorieId: 'k1', anzahl: 2 },
        { artikel: 'deko ', kategorieId: 'k2', anzahl: 1 },
        { artikel: 'Tüte', kategorieId: 'k1', anzahl: 1 },
      ],
      new Map([['deko', 'ermaessigt' as const]]),
    );
    expect(r.map((e) => [e.artikel, e.steuersatzArt])).toEqual([
      ['Deko', 'ermaessigt'],
      ['Tüte', null],
    ]);
  });

  it('lists Artikel with Kategorien, Posten count and latest booking', () => {
    const r = artikelListeBilden(
      [
        { id: 'a2', name: 'Tüte', steuersatzArt: 'regel' as const },
        { id: 'a1', name: 'Deko', steuersatzArt: 'ermaessigt' as const },
      ],
      [
        { artikel: 'Deko', kategorieId: 'k1', anzahl: 1, zuletztAm: '2027-01-01T10:00:00Z' },
        { artikel: 'deko', kategorieId: 'k2', anzahl: 3, zuletztAm: '2027-02-01T10:00:00Z' },
      ],
    );
    expect(r).toEqual([
      {
        id: 'a1',
        name: 'Deko',
        steuersatzArt: 'ermaessigt',
        kategorien: [
          { kategorieId: 'k2', anzahl: 3 },
          { kategorieId: 'k1', anzahl: 1 },
        ],
        postenAnzahl: 4,
        zuletztAm: '2027-02-01T10:00:00Z',
      },
      {
        id: 'a2',
        name: 'Tüte',
        steuersatzArt: 'regel',
        kategorien: [],
        postenAnzahl: 0,
        zuletztAm: null,
      },
    ]);
  });
});

describe('belegBuchungVerschoben', () => {
  const b = { belegdatum: '2026-10-01', bezahldatum: '2026-10-03' };
  it('compares with the Belegdatum for an Auslage, else the Bezahldatum', () => {
    expect(belegBuchungVerschoben({ ...b, zahlweg: 'auslage', buchungsdatum: '2026-10-01' })).toBe(
      false,
    );
    expect(belegBuchungVerschoben({ ...b, zahlweg: 'auslage', buchungsdatum: '2026-11-01' })).toBe(
      true,
    );
    expect(belegBuchungVerschoben({ ...b, zahlweg: 'bar', buchungsdatum: '2026-10-03' })).toBe(
      false,
    );
    expect(belegBuchungVerschoben({ ...b, zahlweg: 'bar', buchungsdatum: '2026-10-01' })).toBe(
      true,
    );
  });
});
