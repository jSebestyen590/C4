import { describe, expect, it } from 'vitest';
import {
  abrechnungsMatrix,
  eventBetraegeMit,
  fehlbestandJe,
  grundbestandMengen,
  transfersBody,
  zielBestandMitNachschub,
} from './kassenFormular';

const st = (...p: [number, number][]) =>
  p.map(([nennwertCent, anzahl]) => ({ nennwertCent, anzahl }));

describe('fehlbestandJe', () => {
  it('meldet, was nach dem Transfer zum Grundbestand fehlt', () => {
    // Grundbestand 30, Ist 10, aus dem Ziel-Fach nur 10 -> 10 fehlen.
    expect([...fehlbestandJe({ 100: 10 }, st([100, 30]), { 100: -10 })]).toEqual([[100, 10]]);
    expect([...fehlbestandJe({ 100: 10 }, st([100, 30]), { 100: -20 })]).toEqual([]);
    expect([...fehlbestandJe({ 100: 30 }, st([100, 30]), {})]).toEqual([]);
    expect([...fehlbestandJe({ 100: 40 }, st([100, 30]), { 100: 10 })]).toEqual([]);
  });
});

describe('transfersBody', () => {
  it('nimmt den Transfer mit Vorzeichen und den Nachschub negativ', () => {
    const t = transfersBody(
      'zb',
      { 100: -20, 5000: 1, 200: 0, 500: null },
      {
        100: { fachId: 'tresor', stueck: 25 },
        200: { fachId: null, stueck: 5 },
      },
    );
    expect(t).toEqual([
      { fachId: 'zb', nennwertCent: 100, anzahl: -20 },
      { fachId: 'zb', nennwertCent: 5000, anzahl: 1 },
      { fachId: 'tresor', nennwertCent: 100, anzahl: -25 },
    ]);
  });
});

describe('zielBestandMitNachschub', () => {
  it('addiert den Nachschub zum Bestand des Ziel-Fachs', () => {
    const b = zielBestandMitNachschub(st([100, 10]), { 100: { fachId: 'tresor', stueck: 25 } });
    expect(b.find((x) => x.nennwertCent === 100)!.anzahl).toBe(35);
    expect(b).toHaveLength(13);
  });
});

describe('eventBetraegeMit', () => {
  it('legt Eingaben über den Vorschlag', () => {
    const v = [
      { eventId: 'a', zaehlungId: 'z1', betragCent: 5000 },
      { eventId: 'b', zaehlungId: 'z2', betragCent: 4000 },
    ];
    expect(eventBetraegeMit(v, { b: 3500 }).map((x) => x.betragCent)).toEqual([5000, 3500]);
    expect(eventBetraegeMit(v, { a: null }).map((x) => x.betragCent)).toEqual([0, 4000]);
  });
});

describe('grundbestandMengen', () => {
  it('übernimmt nur Nennwerte mit Anzahl', () => {
    expect(grundbestandMengen(st([100, 30], [200, 0]))).toEqual({ 100: 30 });
  });
});

describe('abrechnungsMatrix', () => {
  it('zeigt Kasse, Ziel-Fach und Nachschub-Fach vorher und nachher (25-Rollen-Beispiel)', () => {
    const m = abrechnungsMatrix({
      ist: st([100, 10]),
      transfers: [
        { fachId: 'zb', nennwertCent: 100, anzahl: -20 },
        { fachId: 'tresor', nennwertCent: 100, anzahl: -25 },
      ],
      zielFach: { id: 'zb', name: 'Zählbrett', bestand: st([100, 10]) },
      quellen: [{ id: 'tresor', name: 'Tresor', bestand: st([100, 100]) }],
    });
    const w = (key: string) => m.find((z) => z.key === key)!;
    expect(w('ist').werte).toEqual({ 100: 10 });
    expect(w('delta').werte).toEqual({ 100: 20 });
    expect(w('ziel-vorher').werte).toEqual({ 100: 10 });
    expect(w('ziel-nachher').werte).toEqual({ 100: 15 });
    expect(w('tresor-vorher').werte).toEqual({ 100: 100 });
    expect(w('tresor-nachher').werte).toEqual({ 100: 75 });
    expect(w('delta').summeCent).toBe(2000);
  });
  it('Überschuss geht als negatives Delta aus der Kasse', () => {
    const m = abrechnungsMatrix({
      ist: st([5000, 1]),
      transfers: [{ fachId: 'zb', nennwertCent: 5000, anzahl: 1 }],
      zielFach: { id: 'zb', name: 'Zählbrett', bestand: [] },
      quellen: [],
    });
    expect(m.find((z) => z.key === 'delta')!.werte).toEqual({ 5000: -1 });
    expect(m).toHaveLength(4);
  });
});
