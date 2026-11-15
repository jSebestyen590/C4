import { describe, expect, it } from 'vitest';
import type { KontoDto } from '@c4/shared';
import {
  abweichungText,
  andereKonten,
  bargeldSeite,
  buchenPfad,
  uebernahmeLesen,
  umbuchenPfad,
  bestandFehler,
  faecherAus,
  mengenStueckelung,
  mengenSumme,
  umbuchenFehler,
  umbuchenZeilen,
  wechselnFehler,
  wechselnHinweis,
  wechselnZeilen,
} from './bargeldFormular';

const konto = (id: string, extra: Partial<KontoDto> = {}): KontoDto => ({
  id,
  name: id,
  art: 'bargeld',
  parentId: null,
  stueckelung: false,
  steuersatzStandard: null,
  archiviert: false,
  saldoCent: 0,
  saldoGesamtCent: 0,
  ...extra,
});
const konten = [
  konto('safe', { parentId: null }),
  konto('f1', { stueckelung: true, parentId: 'safe' }),
  konto('f2', { stueckelung: true, parentId: 'safe' }),
  konto('bank', { art: 'bank' }),
  konto('alt', { stueckelung: true, archiviert: true }),
];
const bestand = [
  { nennwertCent: 200, anzahl: 3 },
  { nennwertCent: 100, anzahl: 4 },
];

describe('Mengen', () => {
  it('summiert und baut die Stückelung', () => {
    const m = { 200: 2, 100: 1, 50: null };
    expect(mengenSumme(m)).toBe(500);
    expect(mengenStueckelung(m, -1)).toEqual([
      { nennwertCent: 100, anzahl: -1 },
      { nennwertCent: 200, anzahl: -2 },
    ]);
  });
  it('meldet Mengen über dem Bestand', () => {
    const f = bestandFehler({ 200: 4, 100: 1, 500: 1 }, bestand);
    expect(f.get(200)).toBe('Nur 3 vorhanden.');
    expect(f.get(500)).toBe('Nicht vorhanden.');
    expect(f.has(100)).toBe(false);
  });
});

describe('Kontoauswahl', () => {
  it('trennt Fächer von anderen Konten', () => {
    expect(faecherAus(konten).map((k) => k.id)).toEqual(['f1', 'f2']);
    expect(andereKonten(konten).map((k) => k.id)).toEqual(['bank']);
  });
});

describe('Umbuchen', () => {
  it('baut Zeilen mit Stückelung nur auf der Fach-Seite', () => {
    const z = umbuchenZeilen({ von: 'f1', nach: 'bank', mengen: { 200: 2 } }, konten);
    expect(z[0]).toMatchObject({
      kontoId: 'f1',
      betragCent: -400,
      stueckelung: [{ nennwertCent: 200, anzahl: -2 }],
    });
    expect(z[1]).toMatchObject({ kontoId: 'bank', betragCent: 400, stueckelung: null });
  });
  it('verlangt ein Fach, Beträge und genug Bestand', () => {
    expect(
      umbuchenFehler({ von: 'bank', nach: 'safe', mengen: { 100: 1 } }, konten, null).nach,
    ).toContain('keine Bargeld-Umbuchung');
    expect(
      umbuchenFehler({ von: 'f1', nach: 'f1', mengen: { 100: 1 } }, konten, bestand).nach,
    ).toContain('verschieden');
    expect(umbuchenFehler({ von: 'f1', nach: 'f2', mengen: {} }, konten, bestand).mengen).toContain(
      'mindestens eine',
    );
    expect(
      umbuchenFehler({ von: 'f1', nach: 'f2', mengen: { 200: 4 } }, konten, bestand).mengen,
    ).toContain('nicht genug');
    expect(
      umbuchenFehler({ von: 'f1', nach: 'f2', mengen: { 200: 3 } }, konten, bestand).alle,
    ).toEqual([]);
  });
});

describe('Wechseln', () => {
  it('zeigt den Unterschied und baut zwei Zeilen auf dem Fach', () => {
    const s = { fach: 'f1', raus: { 500: 1 }, rein: { 100: 4 } };
    expect(wechselnHinweis(s)).toBe('Noch 1,00 € Unterschied: Raus ist höher als Rein.');
    expect(wechselnFehler(s, [{ nennwertCent: 500, anzahl: 1 }])).toEqual([
      'Noch 1,00 € Unterschied: Raus ist höher als Rein.',
    ]);
    const ok = { ...s, rein: { 100: 5 } };
    expect(wechselnHinweis(ok)).toBeNull();
    expect(wechselnFehler(ok, [{ nennwertCent: 500, anzahl: 1 }])).toEqual([]);
    expect(wechselnZeilen(ok)).toMatchObject([
      { kontoId: 'f1', betragCent: -500, stueckelung: [{ nennwertCent: 500, anzahl: -1 }] },
      { kontoId: 'f1', betragCent: 500, stueckelung: [{ nennwertCent: 100, anzahl: 5 }] },
    ]);
  });
  it('sperrt mehr Raus als im Bestand', () => {
    const s = { fach: 'f1', raus: { 200: 5 }, rein: { 100: 10 } };
    expect(wechselnFehler(s, bestand)).toContain('Im Fach ist nicht genug vorhanden.');
  });
});

describe('abweichungText', () => {
  it('formuliert zu wenig und zu viel', () => {
    expect(abweichungText(50, -1)).toBe('0,50 €: 1 Stück zu wenig');
    expect(abweichungText(200, 3)).toBe('2,00 €: 3 Stück zu viel');
    expect(abweichungText(200, 0)).toBe('');
  });
});

describe('bargeldSeite und Links', () => {
  const k = (id: string) => konten.find((x) => x.id === id);
  it('entscheidet nach Fach', () => {
    expect(bargeldSeite(k('f1'), k('bank'))).toBe('bargeld');
    expect(bargeldSeite(k('bank'), k('f2'))).toBe('bargeld');
    expect(bargeldSeite(k('bank'), konto('kasse'))).toBe('buchen');
    expect(bargeldSeite(k('bank'), undefined)).toBeNull();
  });
  it('baut Links mit Vorbelegung', () => {
    expect(umbuchenPfad({ von: 'a', nach: 'b' })).toBe('/finanzen/bargeld/umbuchen?von=a&nach=b');
    expect(umbuchenPfad()).toBe('/finanzen/bargeld/umbuchen');
    expect(buchenPfad({ von: 'a', nach: null })).toBe('/finanzen/buchen?modus=umbuchung&von=a');
    expect(buchenPfad({ von: 'a', nach: 'b', text: 'Ä & b', datum: '2027-01-05' })).toBe(
      '/finanzen/buchen?modus=umbuchung&von=a&nach=b&text=%C3%84+%26+b&datum=2027-01-05',
    );
  });
  it('liest Text und Datum aus dem Link', () => {
    expect(uebernahmeLesen(new URLSearchParams('text=Hallo&datum=2027-01-05'))).toEqual({
      text: 'Hallo',
      datum: '2027-01-05',
    });
    expect(uebernahmeLesen(new URLSearchParams('datum=kaputt'))).toEqual({
      text: null,
      datum: null,
    });
  });
});
