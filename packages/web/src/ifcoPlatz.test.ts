import { describe, expect, it } from 'vitest';
import type { IfcoEintrag, IfcoTypEintrag } from './inventarDaten';
import { ifcoPlatzMasse, ifcosText, passtNochText, platzPasst, typAnzeige } from './ifcoPlatz';

const typ = (
  id: string,
  name: string,
  grundflaeche: 'gross' | 'klein',
  hoeheCm: number,
  archiviert = false,
): IfcoTypEintrag => ({ id, name, grundflaeche, hoeheCm, archiviert });
const typen = [
  typ('a', '6410', 'gross', 10),
  typ('b', '4310', 'klein', 10),
  typ('c', '6416', 'gross', 16),
  typ('x', 'alt', 'klein', 5, true),
];
const ifco = (
  id: string,
  typId: string | null,
  lagerortId = 'p',
  archiviert = false,
): IfcoEintrag => ({
  id,
  name: id,
  beschreibung: null,
  lagerortId,
  archiviert,
  typId,
  inhalt: [],
  ausleihe: null,
});
const platz = { hoeheCm: 20, stellflaechen: 1 };

describe('passtNochText', () => {
  it('lists the types that still fit, most room first', () => {
    expect(passtNochText(platz, [], typen)).toBe('Passt noch: 4× 4310 oder 2× 6410 oder 1× 6416');
    expect(passtNochText(platz, [ifco('i1', 'a')], typen)).toBe('Passt noch: 2× 4310 oder 1× 6410');
  });

  it('limits the list and ignores archived types', () => {
    expect(passtNochText(platz, [], typen, 2)).toBe('Passt noch: 4× 4310 oder 2× 6410');
    expect(passtNochText(platz, [], typen)).not.toContain('alt');
  });

  it('says Voll when nothing fits', () => {
    expect(passtNochText(platz, [ifco('i1', 'a'), ifco('i2', 'a')], typen)).toBe('Voll');
  });
});

describe('platzPasst', () => {
  const stehend = [ifco('i1', 'a'), ifco('i2', 'a')];
  it('needs a type', () => {
    expect(platzPasst(platz, 'p', ifco('n', null), null, [], typen)).toEqual({
      passt: false,
      grund: 'Typ nötig',
    });
  });
  it('rejects a full place and accepts one with room', () => {
    expect(platzPasst(platz, 'p', ifco('n', 'b'), 'b', stehend, typen).passt).toBe(false);
    expect(platzPasst(platz, 'p', ifco('n', 'b'), 'b', [stehend[0]!], typen).passt).toBe(true);
  });
  it('does not count the Ifco itself or archived Ifcos', () => {
    expect(platzPasst(platz, 'p', stehend[0]!, 'a', stehend, typen).passt).toBe(true);
    expect(
      platzPasst(platz, 'p', ifco('n', 'a'), 'a', [ifco('i1', 'a', 'p', true), ...stehend], typen)
        .passt,
    ).toBe(false);
    expect(
      platzPasst(platz, 'p', ifco('n', 'a'), 'a', [ifco('i1', 'a', 'p', true), stehend[0]!], typen)
        .passt,
    ).toBe(true);
  });
  it('ignores Ifcos at other places', () => {
    expect(platzPasst(platz, 'p', ifco('n', 'a'), 'a', [ifco('i9', 'c', 'q')], typen).passt).toBe(
      true,
    );
  });
});

describe('texts', () => {
  it('formats counts, types and dimensions', () => {
    expect(ifcosText(1)).toBe('1 Ifco');
    expect(ifcosText(2)).toBe('2 Ifcos');
    expect(typAnzeige('a', typen)).toBe('6410 · 60×40 · 10 cm');
    expect(typAnzeige(null, typen)).toBe('Ohne Typ');
    expect(ifcoPlatzMasse({ ifcoHoeheCm: null, ifcoStellflaechen: null })).toBeNull();
    expect(ifcoPlatzMasse({ ifcoHoeheCm: 20, ifcoStellflaechen: 1 })).toEqual(platz);
  });
});
