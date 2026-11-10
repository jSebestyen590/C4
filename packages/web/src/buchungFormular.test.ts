import { describe, expect, it } from 'vitest';
import type { PruefKonto } from '@c4/shared';
import {
  buchungBody,
  formularFehler,
  freieZeilen,
  leereZeile,
  summeCent,
  summeText,
  umbuchungZeilen,
  type FormularStand,
} from './buchungFormular';

const konten: PruefKonto[] = [
  { id: 'a', name: 'Bank', stueckelung: false, archiviert: false },
  { id: 'b', name: 'Geldtransit', stueckelung: false, archiviert: false },
  { id: 'c', name: 'Alt', stueckelung: false, archiviert: true },
];

const frei = (zeilen: FormularStand['zeilen']): FormularStand => ({
  modus: 'frei',
  von: null,
  an: null,
  betrag: '',
  zeilen,
});
const umbuchung = (
  von: string | null,
  an: string | null,
  betrag: number | string,
): FormularStand => ({
  modus: 'umbuchung',
  von,
  an,
  betrag,
  zeilen: [],
});

describe('umbuchungZeilen', () => {
  it('books the amount out of one and into the other account', () => {
    const z = umbuchungZeilen('a', 'b', 12.5);
    expect(z.map((x) => [x.kontoId, x.betragCent])).toEqual([
      ['a', -1250],
      ['b', 1250],
    ]);
    expect(summeCent(z)).toBe(0);
  });
  it('parses typed text', () => {
    expect(umbuchungZeilen('a', 'b', '1.234,56')[1]?.betragCent).toBe(123456);
  });
});

describe('freieZeilen', () => {
  it('signs by side and ignores a typed sign', () => {
    const soll = { ...leereZeile('soll'), kontoId: 'a', betrag: 5 };
    const haben = { ...leereZeile('haben'), kontoId: 'b', betrag: 5 };
    expect(freieZeilen([soll, haben]).map((z) => z.betragCent)).toEqual([500, -500]);
  });
  it('treats an empty field as 0', () => {
    expect(freieZeilen([leereZeile()])[0]?.betragCent).toBe(0);
  });
});

describe('summeText', () => {
  it('says when balanced', () => expect(summeText(0)).toContain('geht auf'));
  it('says what is open', () => {
    expect(summeText(500)).toContain('noch 5,00 € im Haben offen');
    expect(summeText(-500)).toContain('noch 5,00 € im Soll offen');
  });
});

describe('formularFehler', () => {
  it('accepts a balanced free booking', () => {
    const z = [
      { ...leereZeile('soll'), kontoId: 'a', betrag: 5 },
      { ...leereZeile('haben'), kontoId: 'b', betrag: 5 },
    ];
    expect(formularFehler(frei(z), konten)).toEqual([]);
  });
  it('reports an unbalanced free booking', () => {
    const z = [
      { ...leereZeile('soll'), kontoId: 'a', betrag: 5 },
      { ...leereZeile('haben'), kontoId: 'b', betrag: 4 },
    ];
    expect(formularFehler(frei(z), konten).join(' ')).toContain('geht nicht auf');
  });
  it('reports a missing account', () => {
    const z = [
      { ...leereZeile('soll'), kontoId: null, betrag: 5 },
      { ...leereZeile('haben'), kontoId: 'b', betrag: 5 },
    ];
    expect(formularFehler(frei(z), konten).join(' ')).toContain('Das Konto gibt es nicht');
  });
  it('accepts an Umbuchung and rejects same account, zero and archived', () => {
    expect(formularFehler(umbuchung('a', 'b', 3), konten)).toEqual([]);
    expect(formularFehler(umbuchung('a', 'a', 3), konten)).toContain(
      'Die beiden Konten müssen verschieden sein.',
    );
    expect(formularFehler(umbuchung('a', 'b', ''), konten)).toContain(
      'Bitte gib einen Betrag über 0 an.',
    );
    expect(formularFehler(umbuchung('a', 'c', 3), konten).join(' ')).toContain('archiviert');
    expect(formularFehler(umbuchung(null, 'b', 3), konten).length).toBeGreaterThan(0);
  });
});

describe('buchungBody', () => {
  it('sets the source type by mode and trims the text', () => {
    const b = buchungBody({ datum: '2026-01-02', text: ' Test ' }, umbuchung('a', 'b', 1));
    expect(b.quelleTyp).toBe('umbuchung');
    expect(b.text).toBe('Test');
    expect(buchungBody({ datum: '2026-01-02', text: 'x' }, frei([])).quelleTyp).toBe('manuell');
  });
});
