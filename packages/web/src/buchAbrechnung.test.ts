import { describe, expect, it } from 'vitest';
import { naechsteOffene, rechneZeile, strichePruefen } from './buchAbrechnung';

const seite = (
  saldoCent: number,
  tarif: { strichwertCent: number; maxUeberzugCent: number } | null,
) => ({
  saldoCent,
  tarif,
});
const tarif = { strichwertCent: 150, maxUeberzugCent: 3000 };

describe('strichePruefen', () => {
  it('reads digits and treats everything else as empty', () => {
    expect(strichePruefen('12')).toBe(12);
    expect(strichePruefen(' 3 ')).toBe(3);
    expect(strichePruefen('')).toBe(0);
    expect(strichePruefen('-2')).toBe(0);
    expect(strichePruefen('1,5')).toBe(0);
  });
});

describe('rechneZeile', () => {
  it('ignores an untouched row', () => {
    const r = rechneZeile(seite(-500, tarif), undefined);
    expect(r.leer).toBe(true);
    expect(r.ueberzug).toBe(false);
    expect(r.saldoDanachCent).toBe(-500);
  });

  it('computes the balance after Striche, Bar and Abzahlung', () => {
    const r = rechneZeile(seite(-500, tarif), { striche: '4', barCent: 100, abzahlungCent: 1000 });
    expect(r.wirkungCent).toBe(1000 - 600 - 100);
    expect(r.saldoDanachCent).toBe(-200);
    expect(r.ueberzug).toBe(false);
  });

  it('flags an overdraft only below the limit', () => {
    expect(
      rechneZeile(seite(0, tarif), { striche: '20', barCent: null, abzahlungCent: null }).ueberzug,
    ).toBe(false);
    expect(
      rechneZeile(seite(0, tarif), { striche: '21', barCent: null, abzahlungCent: null }).ueberzug,
    ).toBe(true);
  });

  it('cannot save Striche without a tarif but Bar and Abzahlung are fine', () => {
    expect(
      rechneZeile(seite(0, null), { striche: '1', barCent: null, abzahlungCent: null }).ohneTarif,
    ).toBe(true);
    expect(
      rechneZeile(seite(0, null), { striche: '', barCent: 100, abzahlungCent: null }).ohneTarif,
    ).toBe(false);
  });
});

describe('naechsteOffene', () => {
  const ids = ['a', 'b', 'c'];
  it('skips closed rows and wraps around', () => {
    expect(naechsteOffene(ids, new Set(['a']), 'a')).toBe('b');
    expect(naechsteOffene(ids, new Set(['a', 'b']), 'a')).toBe('c');
    expect(naechsteOffene(ids, new Set(['b', 'c']), 'c')).toBe('a');
  });
  it('is null when no other row is open', () => {
    expect(naechsteOffene(ids, new Set(['a', 'b', 'c']), 'a')).toBeNull();
    expect(naechsteOffene(ids, new Set(['b', 'c']), 'a')).toBeNull();
  });
});
