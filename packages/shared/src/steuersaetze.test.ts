import { describe, expect, it } from 'vitest';
import {
  belegBerechnen,
  belegBuchungszeilen,
  belegEinreichenSchema,
  belegEntwurfDatenSchema,
  belegPruefen,
  belegdatumAlt,
  einzelpreisAusGesamt,
  istEigenbeleg,
  steuersatzZeitraumEingabeSchema,
  postenBetrag,
  belegDateiSchluessel,
} from './belege';
import { pruefeBuchung } from './finanzen';
import {
  steuersatzArtVon,
  steuersatzFuerArt,
  steuersatzGueltigAm,
  steuersatzUmstellen,
  steuersaetzeAm,
  zeitraumEnde,
} from './steuersaetze';

const Z = [
  { id: 'z1', ab: '2007-01-01', regel: 1900, ermaessigt: 700 },
  { id: 'z2', ab: '2020-07-01', regel: 1600, ermaessigt: 500 },
  { id: 'z3', ab: '2021-01-01', regel: 1900, ermaessigt: 700 },
];

describe('steuersaetzeAm', () => {
  it('uses the last period starting on or before the date', () => {
    expect(steuersaetzeAm(Z, '2020-06-30').saetze).toEqual([1900, 700, 0]);
    expect(steuersaetzeAm(Z, '2020-07-01').saetze).toEqual([1600, 500, 0]);
    expect(steuersaetzeAm(Z, '2020-12-31')).toMatchObject({ regel: 1600, ermaessigt: 500 });
    expect(steuersaetzeAm(Z, '2021-01-01')).toMatchObject({ regel: 1900, ermaessigt: 700 });
    expect(steuersaetzeAm(Z, '2030-01-01').regel).toBe(1900);
  });

  it('uses the first period before it and the fallback without periods', () => {
    expect(steuersaetzeAm(Z, '2000-01-01').regel).toBe(1900);
    expect(steuersaetzeAm([], '2026-01-01').saetze).toEqual([1900, 700, 0]);
  });

  it('is independent of the list order', () => {
    expect(steuersaetzeAm([Z[2]!, Z[0]!, Z[1]!], '2020-08-01').regel).toBe(1600);
  });

  it('checks whether a rate is valid at a date', () => {
    expect(steuersatzGueltigAm(Z, 1900, '2020-08-01')).toBe(false);
    expect(steuersatzGueltigAm(Z, 1600, '2020-08-01')).toBe(true);
    expect(steuersatzGueltigAm(Z, 0, '2020-08-01')).toBe(true);
  });
});

describe('Art und Satz', () => {
  const covid = { regel: 1600, ermaessigt: 500 };
  it('maps Art to rate and back', () => {
    expect(steuersatzFuerArt('regel', covid)).toBe(1600);
    expect(steuersatzFuerArt('ermaessigt', covid)).toBe(500);
    expect(steuersatzFuerArt('keine', covid)).toBe(0);
    expect(steuersatzFuerArt(null, covid)).toBeNull();
    expect(steuersatzArtVon(1600, covid)).toBe('regel');
    expect(steuersatzArtVon(500, covid)).toBe('ermaessigt');
    expect(steuersatzArtVon(0, covid)).toBe('keine');
    expect(steuersatzArtVon(1900, covid)).toBeNull();
  });

  it('converts a rate to the same Art in another period', () => {
    const normal = { regel: 1900, ermaessigt: 700 };
    expect(steuersatzUmstellen(1900, normal, covid)).toBe(1600);
    expect(steuersatzUmstellen(700, normal, covid)).toBe(500);
    expect(steuersatzUmstellen(0, normal, covid)).toBe(0);
    expect(steuersatzUmstellen(1234, normal, covid)).toBe(1234);
  });

  it('finds the end of a period', () => {
    expect(zeitraumEnde(Z, '2020-07-01')).toBe('2021-01-01');
    expect(zeitraumEnde(Z, '2021-01-01')).toBeNull();
  });

  it('validates a new period', () => {
    expect(
      steuersatzZeitraumEingabeSchema.safeParse({ ab: '2030-01-01', regel: 2000, ermaessigt: 700 })
        .success,
    ).toBe(true);
    expect(
      steuersatzZeitraumEingabeSchema.safeParse({ ab: '2030-01-01', regel: 700, ermaessigt: 700 })
        .success,
    ).toBe(false);
  });
});

const sha = 'a'.repeat(64);
const datei = {
  sha256: sha,
  schluessel: belegDateiSchluessel(sha, 'application/pdf'),
  typ: 'application/pdf',
  name: 'a.pdf',
};
const kontext = { heute: '2026-11-20', zeitraeume: Z };
const beleg = (extra: Record<string, unknown> = {}, satz = 1900) =>
  belegEntwurfDatenSchema.parse({
    rechnungsstellerId: 'r1',
    belegdatum: '2026-11-01',
    belegsummeCent: 1190,
    posten: [
      {
        kategorieId: 'k1',
        text: 'Deko',
        anzahlMilli: 1000,
        einzelpreisCent: 1190,
        steuersatz: satz,
      },
    ],
    zahlweg: 'bank',
    bezahldatum: '2026-11-02',
    datei,
    ...extra,
  });

describe('belegPruefen: Belegdatum und Steuersatz', () => {
  it('rejects a Belegdatum in the future', () => {
    expect(belegPruefen(beleg(), kontext)).toEqual([]);
    expect(belegPruefen(beleg({ belegdatum: '2026-11-21' }), kontext)).toEqual([
      { feld: 'belegdatum', meldung: 'Das Belegdatum darf nicht in der Zukunft liegen.' },
    ]);
    expect(belegPruefen(beleg({ belegdatum: '2026-11-20' }), kontext)).toEqual([]);
  });

  it('requires the rate to be valid at the Belegdatum (Covid period)', () => {
    const covid = beleg({ belegdatum: '2020-08-15', bezahldatum: '2020-08-16' }, 1900);
    expect(belegPruefen(covid, kontext).map((f) => f.meldung)).toEqual([
      'Kategorien, Zeile 1: Der Steuersatz 19 % gilt am Belegdatum nicht (erlaubt: 16 %, 5 %, 0 %).',
    ]);
    const ok = beleg(
      { belegdatum: '2020-08-15', bezahldatum: '2020-08-16', belegsummeCent: 1190 },
      1600,
    );
    expect(belegPruefen(ok, kontext)).toEqual([]);
  });

  it('asks for the Anzahl', () => {
    const d = beleg({
      posten: [
        { kategorieId: 'k1', text: 'Deko', anzahlMilli: 0, einzelpreisCent: 100, steuersatz: 1900 },
      ],
    });
    expect(belegPruefen(d, kontext).map((f) => f.meldung)).toContain(
      'Kategorien, Zeile 1: Bitte gib die Anzahl an.',
    );
  });

  it('flags a Belegdatum older than two months', () => {
    expect(belegdatumAlt('2026-09-19', '2026-11-20')).toBe(true);
    expect(belegdatumAlt('2026-09-20', '2026-11-20')).toBe(false);
    expect(belegdatumAlt('2026-11-01', '2026-11-20')).toBe(false);
  });

  it('member submissions must not be dated in the future', () => {
    const basis = { datei, betragCent: 100, belegdatum: '2026-01-01' };
    expect(belegEinreichenSchema.safeParse(basis).success).toBe(true);
    expect(belegEinreichenSchema.safeParse({ ...basis, belegdatum: '2999-01-01' }).success).toBe(
      false,
    );
  });
});

describe('Gesamtpreis', () => {
  it('uses the Gesamtpreis as the exact amount, the Einzelpreis is derived', () => {
    expect(postenBetrag({ anzahlMilli: 8000, einzelpreisCent: 100, gesamtCent: 799 })).toBe(799);
    expect(einzelpreisAusGesamt(799, 8000)).toBe(100);
    expect(einzelpreisAusGesamt(1000, 3000)).toBe(333);
    expect(einzelpreisAusGesamt(5, 0)).toBe(0);
  });

  it('keeps the Gesamtpreis through the totals and the lines (no rounding difference)', () => {
    const r = {
      modus: 'brutto' as const,
      posten: [
        {
          anzahlMilli: 8000,
          einzelpreisCent: 100,
          gesamtCent: 799,
          steuersatz: 700,
          kategorieId: 'k1',
        },
      ],
      korrekturen: [],
    };
    expect(belegBerechnen(r).summe).toBe(799);
    const zeilen = belegBuchungszeilen(r, { kontoId: 'bank' });
    expect(zeilen.find((z) => z.kontoId === 'k1')?.betragCent).toBe(799);
    expect(zeilen.reduce((s, z) => s + z.betragCent, 0)).toBe(0);
  });

  it('does not use it for Leergut and for the deposit', () => {
    expect(
      postenBetrag({ anzahlMilli: 2000, einzelpreisCent: 50, gesamtCent: 999, art: 'leergut' }),
    ).toBe(-100);
  });
});

describe('Eigenbeleg ohne Vorsteuer', () => {
  const posten = [
    { anzahlMilli: 1000, einzelpreisCent: 1190, steuersatz: 1900, kategorieId: 'k1' },
    { anzahlMilli: 1000, einzelpreisCent: 214, steuersatz: 700, kategorieId: 'k2' },
  ];
  it('detects an Eigenbeleg (no file, with reason)', () => {
    expect(istEigenbeleg({ datei: null, eigenbelegBegruendung: 'weg' })).toBe(true);
    expect(istEigenbeleg({ datei, eigenbelegBegruendung: null })).toBe(false);
    expect(istEigenbeleg({ eigenbeleg: true })).toBe(true);
  });

  it('has no tax in Brutto and books the full amount without Vorsteuer', () => {
    const r = { modus: 'brutto' as const, posten, korrekturen: [], eigenbeleg: true };
    const b = belegBerechnen(r);
    expect(b.jeSteuersatz.map((g) => [g.satz, g.netto, g.steuer, g.brutto])).toEqual([
      [1900, 1190, 0, 1190],
      [700, 214, 0, 214],
    ]);
    const zeilen = belegBuchungszeilen(r, { kontoId: 'auslagen' });
    expect(zeilen.map((z) => [z.kontoId, z.betragCent, z.steuerArt, z.steuerCent])).toEqual([
      ['k1', 1190, 'keine', null],
      ['k2', 214, 'keine', null],
      ['auslagen', -1404, 'keine', null],
    ]);
    expect(pruefeBuchung({ zeilen }, [])).not.toContain('Die Zeilen ergeben nicht 0.');
  });

  it('books Pfand and Leergut of an Eigenbeleg without Vorsteuer too', () => {
    const r = {
      modus: 'brutto' as const,
      posten: [
        {
          art: 'ware' as const,
          anzahlMilli: 1000,
          einzelpreisCent: 1000,
          pfandCent: 150,
          steuersatz: 1900,
          kategorieId: 'k1',
        },
        { art: 'leergut' as const, anzahlMilli: 1000, einzelpreisCent: 80, steuersatz: 1900 },
      ],
      korrekturen: [],
      eigenbeleg: true,
    };
    const zeilen = belegBuchungszeilen(r, { kontoId: 'bank' });
    expect(zeilen.every((z) => z.steuerArt === 'keine' && z.nettoCent === null)).toBe(true);
    expect(zeilen.reduce((s, z) => s + z.betragCent, 0)).toBe(0);
    expect(zeilen.find((z) => z.kontoId === 'pfand')?.betragCent).toBe(70);
  });

  it('Netto: the calculated tax is part of the paid amount, all of it is expense', () => {
    const r = {
      modus: 'netto' as const,
      posten: [{ anzahlMilli: 1000, einzelpreisCent: 1000, steuersatz: 1900, kategorieId: 'k1' }],
      korrekturen: [],
      eigenbeleg: true,
    };
    const zeilen = belegBuchungszeilen(r, { kontoId: 'bank' });
    expect(zeilen[0]).toMatchObject({ kontoId: 'k1', betragCent: 1190, steuerArt: 'keine' });
    expect(zeilen[1]).toMatchObject({ kontoId: 'bank', betragCent: -1190 });
  });

  it('a Beleg with a file keeps the Vorsteuer', () => {
    const r = {
      modus: 'brutto' as const,
      posten,
      korrekturen: [],
      datei,
      eigenbelegBegruendung: null,
    };
    expect(belegBuchungszeilen(r, { kontoId: 'bank' })[0]).toMatchObject({
      steuerArt: 'vorsteuer',
    });
  });
});
