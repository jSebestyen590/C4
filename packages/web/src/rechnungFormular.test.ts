import { describe, expect, it } from 'vitest';
import type { BelegWareDto, KontoDto } from '@c4/shared';
import {
  datenZuFormular,
  erloesKonten,
  formularFehler,
  formularSumme,
  formularZuDaten,
  gefuellteZeilen,
  gebindePatch,
  hatInhalt,
  leeresFormular,
  neueZeile,
  nettoVonBrutto,
  tabellenZeilen,
  warePatch,
  zeileHinzufuegen,
  zeileLeer,
  type RechnungFormular,
} from './rechnungFormular';

const saetze = { regel: 1900, ermaessigt: 700 };
const zeitraeume = [{ ab: '2007-01-01', regel: 1900, ermaessigt: 700 }];

const ware: BelegWareDto = {
  id: 'w1',
  name: 'Ur-Krostitzer',
  warengruppeId: 'g',
  kategorieId: null,
  aliase: [],
  standardGebindeId: 'k',
  gebinde: [
    { id: 'k', bezeichnung: 'Kasten', pfandGesamtCent: 310, letzterPreisCent: 2100 },
    { id: 'f', bezeichnung: 'Fass', pfandGesamtCent: null, letzterPreisCent: null },
  ],
};

const konto = (id: string, extra: Partial<KontoDto> = {}): KontoDto => ({
  id,
  name: id,
  art: 'erloes',
  parentId: null,
  stueckelung: false,
  steuersatzArt: 'regel',
  archiviert: false,
  saldoCent: 0,
  saldoGesamtCent: 0,
  ...extra,
});

describe('rechnungFormular', () => {
  it('keeps empty rows out of the draft data and sorts Waren before free text', () => {
    const frei = {
      ...neueZeile('frei'),
      text: ' Miete ',
      anzahl: '1',
      einzelpreisCent: 5000,
      erloesKontoId: 'e1',
    };
    const w = {
      ...neueZeile('ware'),
      wareId: 'w1',
      gebindeId: 'k',
      anzahl: '2',
      einzelpreisCent: 2100,
      pfandCent: 310,
      erloesKontoId: 'e1',
    };
    const f: RechnungFormular = {
      ...leeresFormular(),
      betreff: ' Feier ',
      leistungVon: '2027-01-10',
      posten: [frei, neueZeile('ware'), w],
    };
    const daten = formularZuDaten(f);
    expect(daten.posten.map((p) => p.art)).toEqual(['ware', 'frei']);
    expect(daten.betreff).toBe('Feier');
    expect(daten.posten[1]).toMatchObject({ art: 'frei', text: 'Miete', anzahlMilli: 1000 });
    expect(daten.posten[0]).toMatchObject({ art: 'ware', anzahlMilli: 2000, pfandCent: 310 });
  });

  it('round-trips the form through the draft data', () => {
    const f: RechnungFormular = {
      ...leeresFormular(),
      empfaenger: { typ: 'extern', id: 'x' },
      leistungVon: '2027-01-10',
      leistungBis: '2027-01-12',
      zahlungszielTage: 30,
      betreff: 'Betreff',
      hinweis: 'Hinweis',
      modus: 'netto',
      posten: [
        {
          ...neueZeile('frei'),
          text: 'Miete',
          anzahl: '1,5',
          einzelpreisCent: 1000,
          preisFormel: '10',
          erloesKontoId: 'e1',
        },
      ],
    };
    const zurueck = datenZuFormular(formularZuDaten(f));
    expect(zurueck).toMatchObject({
      empfaenger: { typ: 'extern', id: 'x' },
      leistungBis: '2027-01-12',
      zahlungszielTage: 30,
      modus: 'netto',
      hinweis: 'Hinweis',
    });
    expect(zurueck.posten[0]).toMatchObject({ text: 'Miete', anzahl: '1,5', preisFormel: '10' });
  });

  it('shows exactly one empty row per table', () => {
    const leere = { ware: neueZeile('ware'), frei: neueZeile('frei') };
    const w = { ...neueZeile('ware'), wareId: 'w1' };
    const zeilen = tabellenZeilen([w], leere, 'ware');
    expect(zeilen.map((z) => [z.leer, z.nr])).toEqual([
      [false, 1],
      [true, null],
    ]);
    expect(tabellenZeilen([], leere, 'frei')).toHaveLength(1);
    expect(zeileLeer(w)).toBe(false);
    expect(gefuellteZeilen([neueZeile('ware'), w])).toEqual([w]);
    expect(zeileHinzufuegen([neueZeile('frei')], neueZeile('ware'))[0]!.art).toBe('ware');
  });

  it('detects content worth saving', () => {
    expect(hatInhalt(leeresFormular())).toBe(false);
    expect(hatInhalt({ ...leeresFormular(), betreff: 'x' })).toBe(true);
  });

  it('reports what is missing and calculates totals per rate with deposit', () => {
    const fehler = formularFehler(leeresFormular(), zeitraeume).map((x) => x.feld);
    expect(fehler).toEqual(expect.arrayContaining(['empfaenger', 'leistung', 'betreff', 'posten']));
    const f: RechnungFormular = {
      ...leeresFormular(),
      posten: [
        {
          ...neueZeile('ware'),
          wareId: 'w1',
          gebindeId: 'k',
          anzahl: '1',
          einzelpreisCent: 2100,
          pfandCent: 310,
          steuersatz: 700,
          erloesKontoId: 'e1',
        },
      ],
    };
    expect(formularSumme(f).summe).toBe(2410);
    const ohnePreis = { ...f, posten: [{ ...f.posten[0]!, einzelpreisCent: null }] };
    expect(formularFehler(ohnePreis, zeitraeume).some((x) => x.meldung.includes('Preis'))).toBe(
      true,
    );
  });

  it('lists only bookable Erlös-Kategorien', () => {
    const liste = [
      konto('a'),
      konto('gruppe'),
      konto('kind', { parentId: 'gruppe' }),
      konto('alt', { archiviert: true }),
      konto('aufwand', { art: 'aufwand' }),
    ];
    expect(erloesKonten(liste).map((k) => k.id)).toEqual(['a', 'kind']);
  });

  it('prefills Gebinde, deposit, price and Erlös-Kategorie when a Ware is chosen', () => {
    const erloes = [konto('e1', { steuersatzArt: 'ermaessigt' })];
    const patch = warePatch(
      [ware],
      erloes,
      'e1',
      { erloesKontoId: null, steuersatz: 1900 },
      'w1',
      'brutto',
      saetze,
    );
    expect(patch).toMatchObject({
      wareId: 'w1',
      gebindeId: 'k',
      pfandCent: 310,
      einzelpreisCent: 2100,
      erloesKontoId: 'e1',
      steuersatz: 700,
    });
    // A net form converts the last gross price.
    const netto = warePatch(
      [ware],
      erloes,
      'e1',
      { erloesKontoId: 'e1', steuersatz: 700 },
      'w1',
      'netto',
      saetze,
    );
    expect(netto.einzelpreisCent).toBe(nettoVonBrutto(2100, 700));
    expect(gebindePatch(ware, 'f', 'brutto', 700)).toEqual({ gebindeId: 'f', pfandCent: null });
  });
});
