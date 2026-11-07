import { describe, expect, it } from 'vitest';
import {
  bausteinErzeugen,
  type BausteinAuswahlDaten,
  bausteinWahlDatenSchema,
  protokollLeer,
  type BausteinWahlDaten,
  type ProtokollDokument,
  type ProtokollKnoten,
  type ProtokollTeilnahmeWert,
} from './protokolle';
import { stimmenHinweisText, stimmenPruefen } from './protokollStimmen';
import type { MitgliedStatus } from './status';

type T = { sub: string; status: MitgliedStatus; wert: ProtokollTeilnahmeWert };
const mitglieder = (n: number): T[] =>
  Array.from({ length: n }, (_, i) => ({
    sub: `m${i}`,
    status: 'mitglied' as const,
    wert: 'anwesend' as const,
  }));

function doc(...gegenwaertiges: ProtokollKnoten[]): ProtokollDokument {
  const d = protokollLeer();
  d.content[1]!.content = [...gegenwaertiges, { type: 'paragraph' }];
  return d;
}
const eingabe = (n: number) => ({ art: 'sitzung' as const, teilnahme: mitglieder(n) });

const beschluss = (ja: number, nein: number, enthaltung: number, antrag = 'Bier') =>
  bausteinErzeugen('bausteinBeschluss', {
    antrag,
    ja,
    nein,
    enthaltung,
    ergebnis: null,
    wiederholung: null,
  });

function wahl(teil: Partial<BausteinWahlDaten>) {
  return bausteinErzeugen('bausteinWahl', {
    posten: 'Kasse',
    postenId: null,
    gueltigAb: '',
    anzahl: 1,
    stimmenProPerson: null,
    kandidaten: [],
    enthaltung: 0,
    stichwahlen: [],
    nichtAngetreten: [],
    annahme: {},
    wiederholung: null,
    ...teil,
  });
}
const kand = (id: string, stimmen: number) => ({ id, sub: id, name: '', stimmen });

describe('stimmenPruefen: Thema', () => {
  it('checks votes and Wahlen in the notes of a Thema like those in an Event', () => {
    const thema = bausteinErzeugen('bausteinThema', { titel: 'Bar' }, [
      { type: 'paragraph' },
      beschluss(1, 0, 0),
      wahl({ kandidaten: [kand('a', 1)], enthaltung: 0 }),
    ]);
    const ergebnis = stimmenPruefen(doc(thema), eingabe(5));
    expect(ergebnis.pruefungen.length).toBeGreaterThanOrEqual(2);
    expect(ergebnis.problems.length).toBe(2);
    expect(ergebnis.problems[0]!.text).toContain('Abstimmung');
  });
});

describe('stimmenPruefen: Abstimmung', () => {
  it('accepts exactly as many votes as members present', () => {
    expect(stimmenPruefen(doc(beschluss(3, 1, 1)), eingabe(5)).problems).toEqual([]);
  });

  it('reports too few and too many votes with the Antrag', () => {
    const fehlt = stimmenPruefen(doc(beschluss(2, 1, 1)), eingabe(5));
    expect(fehlt.problems).toHaveLength(1);
    expect(fehlt.problems[0]!.text).toBe(
      'Abstimmung „Bier“: 4 Stimmen, aber 5 Mitglieder anwesend.',
    );
    const zuviel = stimmenPruefen(doc(beschluss(4, 1, 1)), eingabe(5));
    expect(zuviel.problems[0]!.text).toBe(
      'Abstimmung „Bier“: 6 Stimmen, aber 5 Mitglieder anwesend.',
    );
  });

  it('uses singular and drops an empty Antrag', () => {
    const r = stimmenPruefen(doc(beschluss(0, 0, 0, '  ')), eingabe(1));
    expect(r.problems[0]!.text).toBe('Abstimmung: 0 Stimmen, aber 1 Mitglied anwesend.');
  });

  it('uses the present members at that point (Anwesenheit blocks)', () => {
    const geht = bausteinErzeugen('bausteinAnwesenheit', { art: 'geht', sub: 'm0', uhrzeit: '' });
    const d = doc(beschluss(2, 1, 1, 'vorher'), geht, beschluss(2, 1, 1, 'nachher'));
    const r = stimmenPruefen(d, eingabe(5));
    expect(r.problems.map((p) => p.text)).toEqual([
      'Abstimmung „vorher“: 4 Stimmen, aber 5 Mitglieder anwesend.',
    ]);
  });

  it('counts only present members with status mitglied', () => {
    const teilnahme: T[] = [
      ...mitglieder(3),
      { sub: 'a', status: 'anwaerter', wert: 'anwesend' },
      { sub: 'e', status: 'mitglied', wert: 'entschuldigt' },
    ];
    expect(stimmenPruefen(doc(beschluss(2, 1, 0)), { art: 'sitzung', teilnahme }).problems).toEqual(
      [],
    );
  });

  it('finds Bausteine nested in notes and carries the Baustein id', () => {
    const innen = beschluss(0, 0, 0, 'innen');
    const aussen = bausteinErzeugen('bausteinEvent', undefined, [{ type: 'paragraph' }, innen]);
    const r = stimmenPruefen(doc(aussen), eingabe(2));
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]!.bausteinId).toBe(innen.attrs.id);
  });

  it('ignores a Meinungsbild', () => {
    const m = bausteinErzeugen('bausteinMeinungsbild', {
      frage: 'x',
      optionen: [{ text: 'Ja', stimmen: 99 }],
    });
    expect(stimmenPruefen(doc(m), eingabe(5))).toEqual({ pruefungen: [], problems: [] });
  });
});

describe('stimmenPruefen: Neues EM und Aufnahme', () => {
  it('checks the optional vote of a Neues EM only when there is one', () => {
    const ohne = bausteinErzeugen('bausteinEm', {
      sub: null,
      name: 'Ede',
      abstimmung: null,
      wiederholung: null,
    });
    expect(stimmenPruefen(doc(ohne), eingabe(5)).problems).toEqual([]);
    const mit = bausteinErzeugen('bausteinEm', {
      sub: null,
      name: 'Ede',
      abstimmung: { ja: 1, nein: 0, enthaltung: 0, ergebnis: null },
      wiederholung: null,
    });
    expect(stimmenPruefen(doc(mit), eingabe(5)).problems[0]!.text).toBe(
      'Neues EM „Ede“, Abstimmung: 1 Stimme, aber 5 Mitglieder anwesend.',
    );
  });

  it('uses the person name for a Aufnahme and always checks the vote', () => {
    const a = bausteinErzeugen('bausteinAufnahme', {
      sub: 'x',
      name: '',
      abstimmung: { ja: 2, nein: 0, enthaltung: 0, ergebnis: null },
      wiederholung: null,
    });
    const r = stimmenPruefen(doc(a), {
      ...eingabe(2),
      personName: (s) => (s === 'x' ? 'Xaver' : undefined),
    });
    expect(r.problems).toEqual([]);
    const falsch = stimmenPruefen(doc(a), { ...eingabe(3), personName: () => 'Xaver' });
    expect(falsch.problems[0]!.text).toBe(
      'Aufnahme „Xaver“, Abstimmung: 2 Stimmen, aber 3 Mitglieder anwesend.',
    );
  });
});

describe('stimmenPruefen: Wahl', () => {
  it('main round: candidate votes plus Enthaltung = present × stimmenProPerson', () => {
    const ok = wahl({ anzahl: 2, kandidaten: [kand('a', 6), kand('b', 3)], enthaltung: 1 });
    expect(stimmenPruefen(doc(ok), eingabe(5)).problems).toEqual([]);
    const falsch = wahl({ anzahl: 2, kandidaten: [kand('a', 5), kand('b', 2)], enthaltung: 0 });
    expect(stimmenPruefen(doc(falsch), eingabe(5)).problems[0]!.text).toBe(
      'Wahl „Kasse“: 7 Stimmen, erwartet 10 (5 Mitglieder × 2 Stimmen).',
    );
  });

  it('stimmenProPerson overrides anzahl; null follows anzahl', () => {
    const eins = wahl({
      anzahl: 2,
      stimmenProPerson: 1,
      kandidaten: [kand('a', 3), kand('b', 2)],
    });
    expect(stimmenPruefen(doc(eins), eingabe(5)).problems).toEqual([]);
    const folgt = wahl({ anzahl: 2, kandidaten: [kand('a', 3), kand('b', 2)] });
    expect(stimmenPruefen(doc(folgt), eingabe(5)).problems).toHaveLength(1);
  });

  it('accepts old data without stimmenProPerson', () => {
    const geparst = bausteinWahlDatenSchema.parse({
      posten: 'x',
      anzahl: 3,
      kandidaten: [],
      enthaltung: 0,
      stichwahlen: [],
    });
    expect(geparst.stimmenProPerson).toBeNull();
    const alt = wahl({ anzahl: 3, kandidaten: [kand('a', 15)] });
    delete (alt.attrs.daten as Partial<BausteinWahlDaten>).stimmenProPerson;
    expect(stimmenPruefen(doc(alt), eingabe(5)).problems).toEqual([]);
  });

  it('rejects stimmenProPerson out of range', () => {
    const basis = { posten: '', anzahl: 1, kandidaten: [], enthaltung: 0, stichwahlen: [] };
    expect(bausteinWahlDatenSchema.safeParse({ ...basis, stimmenProPerson: 0 }).success).toBe(
      false,
    );
    expect(bausteinWahlDatenSchema.safeParse({ ...basis, stimmenProPerson: 21 }).success).toBe(
      false,
    );
  });

  it('checks Stichwahl rounds with min(stimmenProPerson, plaetze)', () => {
    // 5 present, 2 seats, 2 votes each: a 6, b 2, c 2 -> a is clear, b and c tie for the last seat.
    const hauptrunde = [kand('a', 6), kand('b', 2), kand('c', 2)];
    const stichwahl = (b: number, c: number, enthaltung: number) => ({
      stimmen: { b, c },
      enthaltung,
    });
    // 1 seat in the Stichwahl: 5 × min(2, 1) = 5 votes.
    const ok = wahl({
      anzahl: 2,
      kandidaten: hauptrunde,
      stichwahlen: [stichwahl(3, 2, 0)],
    });
    const r = stimmenPruefen(doc(ok), eingabe(5));
    expect(r.problems).toEqual([]);
    expect(r.pruefungen.map((p) => [p.runde, p.ist, p.soll])).toEqual([
      [0, 10, 10],
      [1, 5, 5],
    ]);
    const falsch = wahl({
      anzahl: 2,
      kandidaten: hauptrunde,
      stichwahlen: [stichwahl(3, 1, 0)],
    });
    expect(stimmenPruefen(doc(falsch), eingabe(5)).problems.map((p) => p.text)).toEqual([
      'Wahl „Kasse“ – Stichwahl 1: 4 Stimmen, erwartet 5 (5 Mitglieder × 1 Stimme).',
    ]);
  });

  it('keeps checking the held Stichwahl after a decline and blocks a tie the decline creates', () => {
    const hauptrunde = [kand('a', 6), kand('b', 2), kand('c', 2)];
    const gehalten = wahl({
      anzahl: 2,
      kandidaten: hauptrunde,
      stichwahlen: [{ stimmen: { b: 3, c: 2 }, enthaltung: 0 }],
      annahme: { b: false },
    });
    const r = stimmenPruefen(doc(gehalten), eingabe(5));
    expect(r.problems).toEqual([]);
    expect(r.pruefungen.map((p) => [p.runde, p.ist, p.soll])).toEqual([
      [0, 10, 10],
      [1, 5, 5],
    ]);
    // a declines in a one-seat election: b and c are tied for the new boundary.
    const neu = wahl({
      anzahl: 1,
      kandidaten: [kand('a', 3), kand('b', 1), kand('c', 1)],
      annahme: { a: false },
    });
    expect(stimmenPruefen(doc(neu), eingabe(5)).problems.map((p) => p.text)).toEqual([
      'Wahl „Kasse“: Stichwahl nötig (Gleichstand).',
    ]);
  });

  it('blocks an open tie that needs a Stichwahl', () => {
    const offen = wahl({
      anzahl: 1,
      kandidaten: [kand('a', 2), kand('b', 2), kand('c', 1)],
    });
    expect(stimmenPruefen(doc(offen), eingabe(5)).problems.map((p) => p.text)).toEqual([
      'Wahl „Kasse“: Stichwahl nötig (Gleichstand).',
    ]);
  });

  it('reports an empty Stichwahl round once (as vote count)', () => {
    const offen = wahl({
      anzahl: 1,
      kandidaten: [kand('a', 2), kand('b', 2), kand('c', 1)],
      stichwahlen: [{ stimmen: {}, enthaltung: 0 }],
    });
    const texte = stimmenPruefen(doc(offen), eingabe(5)).problems.map((p) => p.text);
    expect(texte).toEqual([
      'Wahl „Kasse“ – Stichwahl 1: 0 Stimmen, erwartet 5 (5 Mitglieder × 1 Stimme).',
    ]);
  });

  it('ignores stored Stichwahlen that no longer apply', () => {
    const w = wahl({
      anzahl: 1,
      kandidaten: [kand('a', 4), kand('b', 1)],
      stichwahlen: [{ stimmen: { a: 99 }, enthaltung: 0 }],
    });
    expect(stimmenPruefen(doc(w), eingabe(5)).problems).toEqual([]);
  });

  it('flags a Wahl without any vote when members are present', () => {
    const r = stimmenPruefen(doc(wahl({})), eingabe(3));
    expect(r.problems[0]!.text).toBe(
      'Wahl „Kasse“: 0 Stimmen, erwartet 3 (3 Mitglieder × 1 Stimme).',
    );
  });
});

function auswahl(teil: Partial<BausteinAuswahlDaten>) {
  return bausteinErzeugen('bausteinAuswahl', {
    frage: 'Wohin?',
    anzahl: 1,
    stimmenProPerson: null,
    optionen: [],
    enthaltung: 0,
    stichwahlen: [],
    wiederholung: null,
    ...teil,
  });
}
const opt = (id: string, stimmen: number) => ({ id, text: id, stimmen });

describe('stimmenPruefen: Auswahl', () => {
  it('main round: option votes plus Enthaltung = present × stimmenProPerson', () => {
    const ok = auswahl({ anzahl: 2, optionen: [opt('a', 6), opt('b', 3)], enthaltung: 1 });
    expect(stimmenPruefen(doc(ok), eingabe(5)).problems).toEqual([]);
    const falsch = auswahl({ anzahl: 2, optionen: [opt('a', 5), opt('b', 2)] });
    const r = stimmenPruefen(doc(falsch), eingabe(5));
    expect(r.problems[0]!.text).toBe(
      'Abstimmung „Wohin?“: 7 Stimmen, erwartet 10 (5 Mitglieder × 2 Stimmen).',
    );
    expect(r.pruefungen[0]).toMatchObject({ typ: 'wahl', runde: 0, ist: 7, soll: 10 });
  });

  it('stimmenProPerson overrides anzahl', () => {
    const a = auswahl({ anzahl: 2, stimmenProPerson: 1, optionen: [opt('a', 3), opt('b', 2)] });
    expect(stimmenPruefen(doc(a), eingabe(5)).problems).toEqual([]);
  });

  it('an open tie is a problem; a matching Stichwahl resolves it', () => {
    const offen = auswahl({ optionen: [opt('a', 2), opt('b', 2), opt('c', 1)] });
    expect(stimmenPruefen(doc(offen), eingabe(5)).problems.map((p) => p.text)).toEqual([
      'Abstimmung „Wohin?“: Stichwahl nötig (Gleichstand).',
    ]);
    const mit = auswahl({
      optionen: [opt('a', 2), opt('b', 2), opt('c', 1)],
      stichwahlen: [{ stimmen: { a: 3, b: 2 }, enthaltung: 0 }],
    });
    const r = stimmenPruefen(doc(mit), eingabe(5));
    expect(r.problems).toEqual([]);
    expect(r.pruefungen).toHaveLength(2);
    const falsch = auswahl({
      optionen: [opt('a', 2), opt('b', 2), opt('c', 1)],
      stichwahlen: [{ stimmen: { a: 3, b: 1 }, enthaltung: 0 }],
    });
    expect(stimmenPruefen(doc(falsch), eingabe(5)).problems[0]!.text).toBe(
      'Abstimmung „Wohin?“ – Stichwahl 1: 4 Stimmen, erwartet 5 (5 Mitglieder × 1 Stimme).',
    );
  });
});

describe('stimmenHinweisText', () => {
  it('formats the hint', () => {
    const r = stimmenPruefen(
      doc(beschluss(2, 1, 1), wahl({ anzahl: 2, kandidaten: [kand('a', 7)] })),
      eingabe(5),
    );
    expect(r.pruefungen.map(stimmenHinweisText)).toEqual([
      'Stimmen: 4 von 5',
      'Stimmen: 7 von 10 (5 × 2)',
    ]);
  });
});
