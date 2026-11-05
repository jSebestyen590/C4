import { describe, expect, it } from 'vitest';
import {
  anwesenheitsVerlauf,
  beschlussfaehigkeit,
  datumKurz,
  erscheintUhrzeiten,
  eventUeberschrift,
  vergangenesUeberschrift,
} from './protokollAnwesenheit';
import {
  bausteinAnwesenheitDatenSchema,
  bausteinErzeugen,
  bausteinLeer,
  protokollDokumentPruefen,
  protokollKopfSchema,
  protokollLeer,
  protokollVorschlag,
  type AnwesenheitArt,
  type ProtokollDokument,
  type ProtokollKnoten,
  type ProtokollTeilnahmeWert,
} from './protokolle';
import type { MitgliedStatus } from './status';

type T = { sub: string; status: MitgliedStatus; wert: ProtokollTeilnahmeWert };
const mitglieder = (n: number, wert: ProtokollTeilnahmeWert = 'anwesend'): T[] =>
  Array.from({ length: n }, (_, i) => ({ sub: `m${i}`, status: 'mitglied' as const, wert }));

const anw = (art: AnwesenheitArt, sub: string | null, uhrzeit = '') =>
  bausteinErzeugen('bausteinAnwesenheit', { art, sub, uhrzeit });
const beschluss = () => bausteinErzeugen('bausteinBeschluss');

function doc(...gegenwaertiges: ProtokollKnoten[]): ProtokollDokument {
  const d = protokollLeer();
  d.content[1]!.content = [...gegenwaertiges, { type: 'paragraph' }];
  return d;
}

describe('beschlussfaehigkeit', () => {
  it('needs more than half in a Sitzung', () => {
    expect(beschlussfaehigkeit('sitzung', 10, 5)).toEqual({
      gesamt: 10,
      anwesend: 5,
      mindestens: 6,
      beschlussfaehig: false,
    });
    expect(beschlussfaehigkeit('sitzung', 10, 6).beschlussfaehig).toBe(true);
    expect(beschlussfaehigkeit('sitzung', 9, 4).beschlussfaehig).toBe(false);
    expect(beschlussfaehigkeit('sitzung', 9, 5)).toMatchObject({
      mindestens: 5,
      beschlussfaehig: true,
    });
    expect(beschlussfaehigkeit('sitzung', 1, 1).beschlussfaehig).toBe(true);
  });

  it('needs more than two thirds in a Mitgliederversammlung', () => {
    expect(beschlussfaehigkeit('mitgliederversammlung', 10, 6).beschlussfaehig).toBe(false);
    expect(beschlussfaehigkeit('mitgliederversammlung', 10, 7)).toMatchObject({
      mindestens: 7,
      beschlussfaehig: true,
    });
    expect(beschlussfaehigkeit('mitgliederversammlung', 9, 6).beschlussfaehig).toBe(false);
    expect(beschlussfaehigkeit('mitgliederversammlung', 9, 7)).toMatchObject({ mindestens: 7 });
    expect(beschlussfaehigkeit('mitgliederversammlung', 9, 7).beschlussfaehig).toBe(true);
    expect(beschlussfaehigkeit('mitgliederversammlung', 3, 2).beschlussfaehig).toBe(false);
    expect(beschlussfaehigkeit('mitgliederversammlung', 3, 3)).toMatchObject({
      mindestens: 3,
      beschlussfaehig: true,
    });
  });

  it('is never beschlussfähig without members', () => {
    expect(beschlussfaehigkeit('sitzung', 0, 0).beschlussfaehig).toBe(false);
    expect(beschlussfaehigkeit('mitgliederversammlung', 0, 0).beschlussfaehig).toBe(false);
  });
});

describe('anwesenheitsVerlauf', () => {
  it('counts the present members at the opening, others not', () => {
    const teilnahme: T[] = [
      ...mitglieder(4),
      { sub: 'v', status: 'mitglied', wert: 'verspaetet' },
      { sub: 'e', status: 'mitglied', wert: 'entschuldigt' },
      { sub: 'u', status: 'mitglied', wert: 'unentschuldigt' },
      { sub: 'a1', status: 'anwaerter', wert: 'anwesend' },
      { sub: 'em', status: 'em', wert: 'anwesend' },
      { sub: 'x', status: 'extern', wert: 'anwesend' },
    ];
    const { start, bausteine } = anwesenheitsVerlauf(doc(), { art: 'sitzung', teilnahme });
    expect(start).toEqual({ gesamt: 7, anwesend: 4, mindestens: 4, beschlussfaehig: true });
    expect(bausteine).toEqual({});
  });

  it('counts a late member only from the erscheint block on', () => {
    const teilnahme: T[] = [
      ...mitglieder(4),
      { sub: 'v', status: 'mitglied', wert: 'verspaetet' },
      { sub: 'u', status: 'mitglied', wert: 'unentschuldigt' },
    ];
    const b1 = beschluss();
    const e = anw('erscheint', 'v', '21:00');
    const b2 = beschluss();
    const { start, bausteine } = anwesenheitsVerlauf(doc(b1, e, b2), {
      art: 'mitgliederversammlung',
      teilnahme,
    });
    // 6 members, MV needs 5: the late one is the fifth.
    expect(start).toMatchObject({ gesamt: 6, anwesend: 4, mindestens: 5, beschlussfaehig: false });
    expect(bausteine[b1.attrs.id]).toMatchObject({
      anwesend: 4,
      beschlussfaehig: false,
      wechsel: false,
    });
    expect(bausteine[e.attrs.id]).toMatchObject({
      anwesend: 5,
      beschlussfaehig: true,
      wechsel: true,
    });
    expect(bausteine[b2.attrs.id]).toMatchObject({
      anwesend: 5,
      beschlussfaehig: true,
      wechsel: false,
    });
  });

  it('removes a member on geht and flags the change', () => {
    const teilnahme = mitglieder(5);
    const g1 = anw('geht', 'm0');
    const g2 = anw('geht', 'm1');
    const b = beschluss();
    const { bausteine } = anwesenheitsVerlauf(doc(g1, g2, b), { art: 'sitzung', teilnahme });
    // 5 members, needs 3: 4 present, then 3 present (still), then the block after two leavers.
    expect(bausteine[g1.attrs.id]).toMatchObject({ anwesend: 4, wechsel: false });
    expect(bausteine[g2.attrs.id]).toMatchObject({
      anwesend: 3,
      beschlussfaehig: true,
      wechsel: false,
    });
    const g3 = anw('geht', 'm2');
    const r = anwesenheitsVerlauf(doc(g1, g2, g3, b), { art: 'sitzung', teilnahme });
    expect(r.bausteine[g3.attrs.id]).toMatchObject({
      anwesend: 2,
      beschlussfaehig: false,
      wechsel: true,
    });
    expect(r.bausteine[b.attrs.id]).toMatchObject({
      anwesend: 2,
      beschlussfaehig: false,
      wechsel: false,
    });
  });

  it('ignores double erscheint, geht of an absent member and non-members', () => {
    const teilnahme: T[] = [
      ...mitglieder(2),
      { sub: 'e', status: 'mitglied', wert: 'entschuldigt' },
      { sub: 'a1', status: 'anwaerter', wert: 'anwesend' },
      { sub: 'em', status: 'em', wert: 'anwesend' },
    ];
    const blocks = [
      anw('erscheint', 'm0'), // already present
      anw('geht', 'e'), // absent
      anw('geht', 'a1'), // Anwärter
      anw('erscheint', 'em'),
      anw('geht', 'unbekannt'),
      anw('erscheint', null),
    ];
    const { start, bausteine } = anwesenheitsVerlauf(doc(...blocks), { art: 'sitzung', teilnahme });
    expect(start.anwesend).toBe(2);
    for (const b of blocks) {
      expect(bausteine[b.attrs.id]).toMatchObject({ gesamt: 3, anwesend: 2, wechsel: false });
    }
    // A second erscheint does not count twice, and one geht removes only once.
    const r = anwesenheitsVerlauf(
      doc(anw('erscheint', 'e'), anw('erscheint', 'e'), anw('geht', 'e'), anw('geht', 'e')),
      { art: 'sitzung', teilnahme },
    );
    const werte = Object.values(r.bausteine).map((b) => b.anwesend);
    expect(werte).toEqual([3, 3, 2, 2]);
  });

  it('walks all sections in order and into Baustein content', () => {
    const teilnahme: T[] = [...mitglieder(1), { sub: 'v', status: 'mitglied', wert: 'verspaetet' }];
    const innen = anw('erscheint', 'v');
    const aussen = beschluss();
    aussen.content = [{ type: 'paragraph' }, innen];
    const vorher = beschluss();
    const d = protokollLeer();
    d.content[0]!.content = [vorher, { type: 'paragraph' }];
    d.content[1]!.content = [aussen, { type: 'paragraph' }];
    const nachher = beschluss();
    d.content[2]!.content = [nachher, { type: 'paragraph' }];
    const { bausteine } = anwesenheitsVerlauf(d, { art: 'sitzung', teilnahme });
    expect(bausteine[vorher.attrs.id]!.anwesend).toBe(1);
    expect(bausteine[aussen.attrs.id]!.anwesend).toBe(1);
    expect(bausteine[innen.attrs.id]!.anwesend).toBe(2);
    expect(bausteine[nachher.attrs.id]!.anwesend).toBe(2);
  });

  it('applies the thresholds with 10 members', () => {
    const lauf = (art: 'sitzung' | 'mitgliederversammlung', da: number) => {
      const teilnahme = [
        ...mitglieder(da),
        ...mitglieder(10 - da, 'unentschuldigt').map((m, i) => ({ ...m, sub: `x${i}` })),
      ];
      return anwesenheitsVerlauf(doc(), { art, teilnahme }).start;
    };
    expect(lauf('sitzung', 5).beschlussfaehig).toBe(false);
    expect(lauf('sitzung', 6)).toMatchObject({ mindestens: 6, beschlussfaehig: true });
    expect(lauf('mitgliederversammlung', 6).beschlussfaehig).toBe(false);
    expect(lauf('mitgliederversammlung', 7)).toMatchObject({
      mindestens: 7,
      beschlussfaehig: true,
    });
  });
});

describe('erscheintUhrzeiten', () => {
  it('returns the first erscheint time per member', () => {
    const d = doc(
      anw('erscheint', 'a', '21:00'),
      anw('erscheint', 'a', '22:00'),
      anw('erscheint', 'b', ''),
      anw('erscheint', 'b', '21:30'),
      anw('geht', 'c', '23:00'),
      anw('erscheint', null, '20:00'),
    );
    expect(erscheintUhrzeiten(d)).toEqual({ a: '21:00', b: '21:30' });
  });
});

describe('bausteinAnwesenheit', () => {
  it('is empty by default and validated strictly', () => {
    expect(bausteinLeer('bausteinAnwesenheit')).toEqual({
      art: 'erscheint',
      sub: null,
      uhrzeit: '',
    });
    expect(protokollDokumentPruefen(doc(anw('geht', 'a', '21:05')))).toBeNull();
    expect(protokollDokumentPruefen(doc(anw('geht', null)))).toBeNull();
    for (const kaputt of [
      { art: 'kommt', sub: null, uhrzeit: '' },
      { art: 'geht', sub: null, uhrzeit: '25:00' },
      { art: 'geht', sub: null, uhrzeit: '9:00' },
      { art: 'geht', sub: null, uhrzeit: '', extra: 1 },
    ]) {
      expect(bausteinAnwesenheitDatenSchema.safeParse(kaputt).success).toBe(false);
    }
    const d = doc(
      bausteinErzeugen('bausteinAnwesenheit', { art: 'geht', sub: null, uhrzeit: '99:99' }),
    );
    expect(protokollDokumentPruefen(d)).not.toBeNull();
  });

  it('is not copied into the suggestion for the next protocol', () => {
    const d = doc(anw('erscheint', 'a', '21:00'), beschluss());
    d.content[2]!.content = [anw('geht', 'b', '22:00'), { type: 'paragraph' }];
    const v = protokollVorschlag({ sitzungDatum: '2026-11-03', letztes: d, events: {} });
    expect(JSON.stringify(v)).not.toContain('bausteinAnwesenheit');
    expect(JSON.stringify(v)).not.toContain('bausteinBeschluss');
  });

  it('records the quorum at each Neues EM block without a change', () => {
    const em = bausteinErzeugen('bausteinEm');
    const d = doc(em, anw('geht', 'm0'), bausteinErzeugen('bausteinEm'));
    const t = mitglieder(3);
    const v = anwesenheitsVerlauf(d, { art: 'sitzung', teilnahme: t });
    expect(v.bausteine[em.attrs!.id as string]).toMatchObject({
      anwesend: 3,
      beschlussfaehig: true,
      wechsel: false,
    });
    const spaeter = d.content[1]!.content![2]!;
    expect(v.bausteine[spaeter.attrs!.id as string]).toMatchObject({
      anwesend: 2,
      wechsel: false,
    });
    const nicht = anwesenheitsVerlauf(doc(em), {
      art: 'sitzung',
      teilnahme: mitglieder(3, 'entschuldigt'),
    });
    expect(nicht.bausteine[em.attrs!.id as string]).toMatchObject({ beschlussfaehig: false });
  });
});

describe('Aufnahme, Meinungsbild and nested blocks', () => {
  it('records the quorum at an Aufnahme block', () => {
    const a = bausteinErzeugen('bausteinAufnahme');
    const v = anwesenheitsVerlauf(doc(anw('geht', 'm0'), a), {
      art: 'sitzung',
      teilnahme: mitglieder(3),
    });
    expect(v.bausteine[a.attrs.id]).toMatchObject({ anwesend: 2, wechsel: false });
    expect(v.anwesendePersonen).toEqual({});
  });

  it('counts everybody present at a Meinungsbild (all statuses, chosen EMs)', () => {
    const vorher = bausteinErzeugen('bausteinMeinungsbild');
    const nachher = bausteinErzeugen('bausteinMeinungsbild');
    const teilnahme: T[] = [
      ...mitglieder(2),
      { sub: 'v', status: 'mitglied', wert: 'verspaetet' },
      { sub: 'e', status: 'mitglied', wert: 'entschuldigt' },
      { sub: 'a1', status: 'anwaerter', wert: 'anwesend' },
      { sub: 'a2', status: 'anwaerter', wert: 'verspaetet' },
    ];
    const v = anwesenheitsVerlauf(
      doc(
        vorher,
        anw('erscheint', 'v'),
        anw('erscheint', 'a2'),
        anw('erscheint', 'a2'),
        anw('geht', 'a1'),
        anw('geht', 'm0'),
        nachher,
      ),
      { art: 'sitzung', teilnahme, ems: [{ sub: 'em1' }] },
    );
    expect(v.anwesendePersonen[vorher.attrs.id]).toBe(4);
    expect(v.anwesendePersonen[nachher.attrs.id]).toBe(4);
    // No quorum entry for it.
    expect(v.bausteine[vorher.attrs.id]).toBeUndefined();
  });

  it('gives a nested Abstimmung and Meinungsbild their state in document order', () => {
    const teilnahme: T[] = [...mitglieder(1), { sub: 'v', status: 'mitglied', wert: 'verspaetet' }];
    const abstimmung = bausteinErzeugen('bausteinBeschluss');
    const meinung = bausteinErzeugen('bausteinMeinungsbild');
    const innen = anw('erscheint', 'v');
    const abstimmung2 = bausteinErzeugen('bausteinBeschluss');
    const ereignis = bausteinErzeugen('bausteinEvent', undefined, [
      { type: 'paragraph' },
      abstimmung,
      meinung,
      innen,
      abstimmung2,
    ]);
    const nachher = bausteinErzeugen('bausteinBeschluss');
    const v = anwesenheitsVerlauf(doc(ereignis, nachher), { art: 'sitzung', teilnahme });
    expect(v.bausteine[abstimmung.attrs.id]!.anwesend).toBe(1);
    expect(v.anwesendePersonen[meinung.attrs.id]).toBe(1);
    expect(v.bausteine[abstimmung2.attrs.id]!.anwesend).toBe(2);
    expect(v.bausteine[nachher.attrs.id]!.anwesend).toBe(2);
  });
});

describe('protokollKopfSchema additions', () => {
  it('reads an old kopf without the new fields', () => {
    const kopf = protokollKopfSchema.parse({ teilnahme: { a: 'anwesend' }, gaeste: 'x' });
    expect(kopf).toMatchObject({
      sitzungsleitung: null,
      protokollfuehrung: null,
      eroeffnung: '',
      verspaetung: {},
      statusSchnappschuss: null,
      artSchnappschuss: null,
    });
  });

  it('validates the times', () => {
    expect(
      protokollKopfSchema.safeParse({ eroeffnung: '19:30', verspaetung: { a: '20:05' } }).success,
    ).toBe(true);
    expect(protokollKopfSchema.safeParse({ eroeffnung: '24:00' }).success).toBe(false);
    expect(protokollKopfSchema.safeParse({ verspaetung: { a: '7:5' } }).success).toBe(false);
    expect(protokollKopfSchema.safeParse({ statusSchnappschuss: { a: 'boss' } }).success).toBe(
      false,
    );
    expect(
      protokollKopfSchema.safeParse({ artSchnappschuss: 'mitgliederversammlung' }).success,
    ).toBe(true);
  });
});

describe('headings', () => {
  it('formats short dates', () => {
    expect(datumKurz('2026-02-11')).toBe('11.02.');
    expect(datumKurz('2026-05-31', '2026-06-02')).toBe('31.05. – 02.06.');
    expect(datumKurz('2026-05-31', '2026-05-31')).toBe('31.05.');
    expect(datumKurz('2026-05-31', '')).toBe('31.05.');
    expect(datumKurz('', '2026-06-02')).toBe('');
    expect(datumKurz(null)).toBe('');
  });

  it('builds the headings', () => {
    expect(
      eventUeberschrift({ name: 'Sommerfest', datum: '2026-05-31', bisDatum: '2026-06-02' }),
    ).toBe('31.05. – 02.06. Sommerfest');
    expect(eventUeberschrift({ name: 'Sommerfest', datum: null, bisDatum: null })).toBe(
      'Sommerfest',
    );
    expect(eventUeberschrift({ name: '', datum: '2026-02-11', bisDatum: null })).toBe('11.02.');
    expect(vergangenesUeberschrift({ name: 'Barabend', datum: '2026-02-11' })).toBe(
      '11.02. Barabend',
    );
  });
});
