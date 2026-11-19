import { describe, expect, it } from 'vitest';
import {
  abgleichKorrekturSchema,
  basisMengeAnzeigen,
  lagerAbgleich,
  sollMengeBasis,
  type AbgleichIst,
  type AbgleichKorrektur,
  type AbgleichSoll,
} from './lagerAbgleich';
import type { Gebinde } from './waren';

const flasche: Gebinde = {
  id: 'f',
  menge: 0.5,
  einheit: 'l',
  verpackungseinheit: 'flasche',
  pfandCent: 8,
  unterGebindeId: null,
  unterAnzahl: null,
};
const kasten: Gebinde = {
  id: 'k',
  menge: null,
  einheit: null,
  verpackungseinheit: 'kasten',
  pfandCent: null,
  unterGebindeId: 'f',
  unterAnzahl: 20,
};
const alle = [flasche, kasten];

const ist = (datum: string, menge: number, vorgangId = `v-${datum}-${menge}`): AbgleichIst => ({
  wareId: 'w',
  datum,
  menge,
  vorgangId,
  lagerortName: 'Keller',
});
const soll = (datum: string, menge: number, belegId = `b-${datum}-${menge}`): AbgleichSoll => ({
  wareId: 'w',
  datum,
  menge,
  belegId,
  belegNummer: belegId,
  storniert: false,
});
const korrektur = (datum: string, menge: number): AbgleichKorrektur => ({
  id: `k-${datum}-${menge}`,
  wareId: 'w',
  datum,
  menge,
  grund: 'bruch',
  text: null,
  erstelltVon: 'a',
});
const rechne = (
  p: { ist?: AbgleichIst[]; soll?: AbgleichSoll[]; korrekturen?: AbgleichKorrektur[] },
  stichtag = '2026-01-01',
) => lagerAbgleich({ stichtag, ist: [], soll: [], korrekturen: [], ...p });

const eins = (...a: Parameters<typeof rechne>) => {
  const r = rechne(...a)[0];
  if (!r) throw new Error('keine Ware');
  return r;
};

describe('lagerAbgleich', () => {
  it('follows the example: Ist 10, Beleg 5, Beleg 5 -> 0, Ist 10, Beleg 9 -> 1', () => {
    const w = eins({
      ist: [ist('2026-02-01', 10), ist('2026-02-04', 10)],
      soll: [soll('2026-02-02', 5), soll('2026-02-03', 5), soll('2026-02-05', 9)],
    });
    expect(w.zeitleiste.map((e) => [e.art, e.menge, e.diskrepanz])).toEqual([
      ['ist', 10, 10],
      ['soll', 5, 5],
      ['soll', 5, 0],
      ['ist', 10, 10],
      ['soll', 9, 1],
    ]);
    expect([w.ist, w.soll, w.korrektur, w.diskrepanz]).toEqual([20, 19, 0, 1]);
  });

  it('orders the same day Ist, Soll, Korrektur', () => {
    const w = eins({
      korrekturen: [korrektur('2026-02-01', 1)],
      soll: [soll('2026-02-01', 3)],
      ist: [ist('2026-02-01', 5)],
    });
    expect(w.zeitleiste.map((e) => e.art)).toEqual(['ist', 'soll', 'korrektur']);
    expect(w.diskrepanz).toBe(1);
  });

  it('subtracts a Korrektur and reverts with the opposite one', () => {
    expect(
      eins({ ist: [ist('2026-02-01', 10)], korrekturen: [korrektur('2026-02-02', -2)] }).diskrepanz,
    ).toBe(12);
    expect(
      eins({
        ist: [ist('2026-02-01', 10)],
        soll: [soll('2026-02-01', 12)],
        korrekturen: [korrektur('2026-02-02', -2)],
      }).diskrepanz,
    ).toBe(0);
    expect(
      eins({
        ist: [ist('2026-02-01', 10)],
        korrekturen: [korrektur('2026-02-02', 3), korrektur('2026-02-03', -3)],
      }).diskrepanz,
    ).toBe(10);
  });

  it('respects the Stichtag boundary (the day itself counts)', () => {
    const w = eins(
      {
        ist: [ist('2025-12-31', 100), ist('2026-01-01', 10)],
        soll: [soll('2025-12-31', 50), soll('2026-01-01', 4)],
        korrekturen: [korrektur('2025-12-31', 7)],
      },
      '2026-01-01',
    );
    expect([w.ist, w.soll, w.korrektur]).toEqual([10, 4, 0]);
  });

  it('ignores reversed Belege and counts returns negative', () => {
    const w = eins({
      ist: [ist('2026-02-01', 10)],
      soll: [{ ...soll('2026-02-01', 8, 'x'), storniert: true }, soll('2026-02-02', -2)],
    });
    expect(w.soll).toBe(-2);
    expect(w.diskrepanz).toBe(12);
  });

  it('merges rows of one Vorgang / Beleg and omits Waren without entries', () => {
    const w = eins({
      ist: [ist('2026-02-01', 3, 'v1'), ist('2026-02-01', 4, 'v1')],
      soll: [soll('2026-02-01', 2, 'b1'), soll('2026-02-01', 2, 'b1')],
    });
    expect(w.zeitleiste).toHaveLength(2);
    expect([w.ist, w.soll]).toEqual([7, 4]);
    expect(rechne({})).toEqual([]);
  });

  it('sorts entries of the same day and art chronologically', () => {
    const r = rechne({
      ist: [
        { ...ist('2026-02-01', 1, 'v2'), zeit: '2026-02-01T12:00:00Z' },
        { ...ist('2026-02-01', 2, 'v1'), zeit: '2026-02-01T08:00:00Z' },
      ],
      soll: [
        { ...soll('2026-02-01', 1, 'b10'), belegNummer: 'B-2026-0010' },
        { ...soll('2026-02-01', 2, 'b7'), belegNummer: 'B-2026-0007' },
      ],
      korrekturen: [
        { ...korrektur('2026-02-01', 1), id: 'spaet', zeit: '2026-02-02T10:00:00Z' },
        { ...korrektur('2026-02-01', 2), id: 'frueh', zeit: '2026-02-02T09:00:00Z' },
      ],
    });
    const z = r[0]!.zeitleiste.map((e) =>
      e.art === 'ist' ? e.vorgangId : e.art === 'soll' ? e.belegId : e.id,
    );
    expect(z).toEqual(['v1', 'v2', 'b7', 'b10', 'frueh', 'spaet']);
  });
});

describe('Basiseinheiten', () => {
  it('converts Kasten and Flasche Posten', () => {
    expect(sollMengeBasis(2000, 'k', alle)).toBe(40);
    expect(sollMengeBasis(3000, 'f', alle)).toBe(3);
    expect(sollMengeBasis(-1000, 'k', alle)).toBe(-20);
  });

  it('formats mixed amounts', () => {
    expect(basisMengeAnzeigen(23, [flasche, kasten], alle)).toBe('1 Kasten, 3 Flaschen');
    expect(basisMengeAnzeigen(-20, [flasche, kasten], alle)).toBe('-1 Kasten');
    expect(basisMengeAnzeigen(5, [flasche], alle)).toBe('5 Flaschen');
    expect(basisMengeAnzeigen(0, [flasche], alle)).toBe('0');
  });
});

describe('abgleichKorrekturSchema', () => {
  const ok = { wareId: 'w', menge: -3, grund: 'bruch', datum: '2026-02-01' };
  it('accepts a valid Korrektur', () => {
    expect(abgleichKorrekturSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects menge 0 and sonstiges without text', () => {
    expect(abgleichKorrekturSchema.safeParse({ ...ok, menge: 0 }).success).toBe(false);
    expect(abgleichKorrekturSchema.safeParse({ ...ok, grund: 'sonstiges' }).success).toBe(false);
    expect(
      abgleichKorrekturSchema.safeParse({ ...ok, grund: 'sonstiges', text: ' Irgendwas ' }).success,
    ).toBe(true);
  });
});
