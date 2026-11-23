import { describe, expect, it } from 'vitest';
import { BILD_TYP, type ProtokollKnoten } from '@c4/shared';
import { bildNummern, bildUnterschrift } from './bildNummern';

const bild = (beschreibung?: string): ProtokollKnoten => ({
  type: BILD_TYP,
  attrs: { schluessel: 'k', beschreibung },
});
const baustein = (...content: ProtokollKnoten[]): ProtokollKnoten => ({
  type: 'bausteinThema',
  content,
});

describe('bildNummern', () => {
  it('numbers only described images, in document order, without gaps', () => {
    const a = bild('Erstes');
    const b = bild('');
    const c = bild('  ');
    const d = bild('Zweites');
    const e = bild(undefined);
    const f = bild('Drittes');
    const dok: ProtokollKnoten = {
      type: 'doc',
      content: [
        { type: 'abschnitt', content: [a, b, baustein(c, baustein(d), e)] },
        { type: 'abschnitt', content: [f] },
      ],
    };
    const n = bildNummern(dok);
    expect([a, b, c, d, e, f].map((k) => n.get(k))).toEqual([
      1,
      undefined,
      undefined,
      2,
      undefined,
      3,
    ]);
  });

  it('builds the caption', () => {
    expect(bildUnterschrift(3, ' Aufbau ')).toBe('Abb. 3: Aufbau');
  });
});
