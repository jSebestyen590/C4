import { describe, expect, it } from 'vitest';
import { bausteinErzeugen, type ProtokollKnoten } from '@c4/shared';
import { hatBilder, notizAbschnitte } from './notizAbschnitte';

const text = (t: string): ProtokollKnoten => ({
  type: 'paragraph',
  content: [{ type: 'text', text: t }],
});
const bild = (n: number): ProtokollKnoten => ({
  type: 'protokollBild',
  attrs: { schluessel: `k${n}`, breite: 'voll', ausrichtung: 'mitte', beschreibung: '' },
});

describe('notizAbschnitte', () => {
  it('keeps notes without a nested Baustein in one piece and takes the images out of the text', () => {
    const a = notizAbschnitte([text('a'), bild(1), text('b'), bild(2)]);
    expect(a).toEqual([
      { art: 'text', knoten: [text('a'), text('b')], bilder: [bild(1), bild(2)] },
    ]);
  });

  it('splits at every nested Baustein and keeps those whole and in order', () => {
    const abstimmung = bausteinErzeugen('bausteinBeschluss', undefined, [text('x'), bild(9)]);
    const wahl = bausteinErzeugen('bausteinWahl');
    const thema = bausteinErzeugen('bausteinThema');
    const meinung = bausteinErzeugen('bausteinMeinungsbild');
    const a = notizAbschnitte([
      text('vor'),
      bild(1),
      abstimmung,
      bild(2),
      wahl,
      thema,
      text('zwischen'),
      meinung,
      text('nach'),
    ]);
    expect(a.map((x) => x.art)).toEqual([
      'text',
      'baustein',
      'text',
      'baustein',
      'baustein',
      'text',
      'baustein',
      'text',
    ]);
    expect(a[0]).toEqual({ art: 'text', knoten: [text('vor')], bilder: [bild(1)] });
    expect(a[1]).toEqual({ art: 'baustein', knoten: abstimmung });
    expect(a[2]).toEqual({ art: 'text', knoten: [], bilder: [bild(2)] });
    expect(a[5]).toEqual({ art: 'text', knoten: [text('zwischen')], bilder: [] });
    expect(a[7]).toEqual({ art: 'text', knoten: [text('nach')], bilder: [] });
  });

  it('gives nothing for no notes and tells whether there are images', () => {
    expect(notizAbschnitte([])).toEqual([]);
    expect(hatBilder([text('a')])).toBe(false);
    expect(hatBilder([text('a'), bild(1)])).toBe(true);
  });
});
