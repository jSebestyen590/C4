import { describe, expect, it } from 'vitest';
import {
  BAUSTEIN_TYPEN,
  PROTOKOLL_MAX_BYTES,
  PROTOKOLL_MAX_TIEFE,
  bausteinErzeugen,
  bausteinLeer,
  beschlussErgebnisVorschlag,
  wahlErgebnis,
  protokollAnlegenSchema,
  protokollDokumentPruefen,
  protokollDokumentSchema,
  protokollEventIds,
  protokollKopfLeer,
  protokollKopfSchema,
  protokollLeer,
  protokollSpeichernSchema,
  protokollVorschlag,
  teilnahmeAbleiten,
  type BausteinKnoten,
  type BausteinWahlDaten,
  type ProtokollDokument,
  type ProtokollEventInfo,
  type ProtokollKnoten,
} from './protokolle';

const absatz = (text: string): ProtokollKnoten => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

function dokument(teile: {
  vergangenes?: ProtokollKnoten[];
  gegenwaertiges?: ProtokollKnoten[];
  zukuenftiges?: ProtokollKnoten[];
}): ProtokollDokument {
  const doc = protokollLeer();
  doc.content[0]!.content = teile.vergangenes ?? [{ type: 'paragraph' }];
  doc.content[1]!.content = teile.gegenwaertiges ?? [{ type: 'paragraph' }];
  doc.content[2]!.content = teile.zukuenftiges ?? [{ type: 'paragraph' }];
  return doc;
}

const eventBaustein = (
  daten: Partial<ReturnType<typeof bausteinLeer<'bausteinEvent'>>>,
  text = '',
): BausteinKnoten<'bausteinEvent'> =>
  bausteinErzeugen('bausteinEvent', { ...bausteinLeer('bausteinEvent'), ...daten }, [absatz(text)]);

const info = (beginn: string, ende: string, extra: Partial<ProtokollEventInfo> = {}) => ({
  titel: 'Barabend',
  beginn,
  ende,
  abgesagt: false,
  ...extra,
});

describe('protokollLeer', () => {
  it('has the three sections in order, each with an empty paragraph', () => {
    const doc = protokollLeer();
    expect(doc.content.map((a) => a.attrs?.art)).toEqual([
      'vergangenes',
      'gegenwaertiges',
      'zukuenftiges',
    ]);
    expect(doc.content.every((a) => a.content?.length === 1)).toBe(true);
    expect(protokollDokumentPruefen(doc)).toBeNull();
  });
});

describe('protokollDokumentPruefen', () => {
  it('accepts valid Bausteine of every type with free text', () => {
    const doc = dokument({
      vergangenes: [bausteinErzeugen('bausteinVergangenesEvent')],
      gegenwaertiges: [
        bausteinErzeugen('bausteinAnwaerter'),
        bausteinErzeugen('bausteinBeschluss'),
        bausteinErzeugen('bausteinEm'),
        bausteinErzeugen('bausteinEm', {
          sub: 'a',
          name: '',
          abstimmung: { ja: 8, nein: 3, enthaltung: 2, ergebnis: 'angenommen' },
        }),
      ],
      zukuenftiges: [eventBaustein({ name: 'Barabend', datum: '2026-12-01' }, 'Text')],
    });
    expect(protokollDokumentPruefen(doc)).toBeNull();
    expect(protokollDokumentSchema.safeParse(doc).success).toBe(true);
  });

  it('checks the fields of a Neues EM block strictly', () => {
    const em = (daten: unknown) =>
      protokollDokumentPruefen(
        dokument({ gegenwaertiges: [bausteinErzeugen('bausteinEm', daten as never)] }),
      );
    const ok = { ja: 1, nein: 0, enthaltung: 0, ergebnis: null };
    expect(em({ sub: null, name: 'Gast', abstimmung: ok })).toBeNull();
    expect(em({ sub: null, name: '', abstimmung: { ...ok, ergebnis: 'x' } })).not.toBeNull();
    expect(em({ sub: null, name: '', abstimmung: { ...ok, ja: -1 } })).not.toBeNull();
    expect(em({ sub: null, name: '', abstimmung: { ...ok, extra: 1 } })).not.toBeNull();
    expect(em({ sub: null, name: 'x'.repeat(201), abstimmung: null })).not.toBeNull();
    expect(em({ sub: null, name: '' })).not.toBeNull();
    expect(bausteinErzeugen('bausteinEm').attrs.daten).toEqual({
      sub: null,
      name: '',
      abstimmung: null,
    });
  });

  it('accepts quotes in a section and in the free text of a Baustein', () => {
    const zitat: ProtokollKnoten = { type: 'blockquote', content: [absatz('Zitat')] };
    const baustein = bausteinErzeugen('bausteinBeschluss', undefined, [absatz('Text'), zitat]);
    const doc = dokument({ vergangenes: [zitat], gegenwaertiges: [baustein] });
    expect(protokollDokumentPruefen(doc)).toBeNull();
    expect(protokollDokumentSchema.safeParse(doc).success).toBe(true);
  });

  it('checks Meinungsbild and Aufnahme strictly', () => {
    const pruefen = (typ: 'bausteinMeinungsbild' | 'bausteinAufnahme', daten: unknown) =>
      protokollDokumentPruefen(
        dokument({ gegenwaertiges: [bausteinErzeugen(typ, daten as never)] }),
      );
    expect(bausteinLeer('bausteinMeinungsbild')).toEqual({
      frage: '',
      optionen: [
        { text: 'Ja', stimmen: 0 },
        { text: 'Nein', stimmen: 0 },
        { text: 'Enthaltung', stimmen: 0 },
      ],
    });
    // Fresh arrays on every call.
    expect(bausteinLeer('bausteinMeinungsbild').optionen).not.toBe(
      bausteinLeer('bausteinMeinungsbild').optionen,
    );
    const ok = { frage: 'Ernst oder Spaß?', optionen: [{ text: 'Ernst', stimmen: 4 }] };
    expect(pruefen('bausteinMeinungsbild', ok)).toBeNull();
    expect(pruefen('bausteinMeinungsbild', { ...ok, extra: 1 })).not.toBeNull();
    expect(pruefen('bausteinMeinungsbild', { ...ok, frage: 'x'.repeat(501) })).not.toBeNull();
    expect(
      pruefen('bausteinMeinungsbild', { ...ok, optionen: [{ text: 'x'.repeat(101), stimmen: 0 }] }),
    ).not.toBeNull();
    expect(
      pruefen('bausteinMeinungsbild', { ...ok, optionen: [{ text: 'a', stimmen: -1 }] }),
    ).not.toBeNull();
    expect(
      pruefen('bausteinMeinungsbild', { ...ok, optionen: [{ text: 'a', stimmen: 1.5 }] }),
    ).not.toBeNull();
    const dreizehn = Array.from({ length: 13 }, () => ({ text: 'a', stimmen: 0 }));
    expect(pruefen('bausteinMeinungsbild', { ...ok, optionen: dreizehn })).not.toBeNull();
    expect(pruefen('bausteinMeinungsbild', { ...ok, optionen: dreizehn.slice(1) })).toBeNull();

    const stimmen = { ja: 5, nein: 1, enthaltung: 0, ergebnis: 'angenommen' };
    expect(pruefen('bausteinAufnahme', { sub: 'a', name: '', abstimmung: stimmen })).toBeNull();
    expect(pruefen('bausteinAufnahme', { sub: null, name: 'Max', abstimmung: stimmen })).toBeNull();
    expect(pruefen('bausteinAufnahme', { sub: null, name: 'Max' })).not.toBeNull();
    expect(
      pruefen('bausteinAufnahme', { sub: null, name: 'Max', abstimmung: null }),
    ).not.toBeNull();
    expect(
      pruefen('bausteinAufnahme', { sub: null, name: 'x'.repeat(201), abstimmung: stimmen }),
    ).not.toBeNull();
  });

  it('accepts an Abstimmung and a Meinungsbild inside the free text of another Baustein', () => {
    const ereignis = bausteinErzeugen('bausteinEvent', bausteinLeer('bausteinEvent'), [
      absatz('Text'),
      bausteinErzeugen('bausteinBeschluss'),
      bausteinErzeugen('bausteinMeinungsbild'),
      { type: 'paragraph' },
    ]);
    const doc = dokument({ zukuenftiges: [ereignis] });
    expect(protokollDokumentPruefen(doc)).toBeNull();
    expect(protokollDokumentSchema.safeParse(doc).success).toBe(true);
    // Still checked strictly inside.
    const kaputt = bausteinErzeugen('bausteinBeschluss', { antrag: 1 } as never);
    expect(
      protokollDokumentPruefen(
        dokument({
          zukuenftiges: [
            bausteinErzeugen('bausteinEvent', bausteinLeer('bausteinEvent'), [kaputt]),
          ],
        }),
      ),
    ).not.toBeNull();
  });

  it('knows empty defaults for every Baustein type', () => {
    for (const typ of BAUSTEIN_TYPEN) {
      const doc = dokument({ gegenwaertiges: [bausteinErzeugen(typ)] });
      expect(protokollDokumentPruefen(doc), typ).toBeNull();
    }
  });

  it('rejects documents that are not exactly the three sections in order', () => {
    expect(protokollDokumentPruefen(null)).not.toBeNull();
    expect(protokollDokumentPruefen({ type: 'doc', content: [] })).not.toBeNull();
    const doc = protokollLeer();
    expect(protokollDokumentPruefen({ ...doc, content: [...doc.content].reverse() })).toMatch(
      /Reihenfolge/,
    );
    expect(protokollDokumentPruefen({ ...doc, content: doc.content.slice(0, 2) })).not.toBeNull();
    expect(protokollDokumentPruefen({ type: 'page', content: doc.content })).not.toBeNull();
  });

  it('rejects nested sections and nested docs', () => {
    const doc = dokument({
      gegenwaertiges: [{ type: 'abschnitt', attrs: { art: 'vergangenes' } }],
    });
    expect(protokollDokumentPruefen(doc)).not.toBeNull();
  });

  it('validates Bausteine strictly', () => {
    const kaputt = (aendern: (b: BausteinKnoten<'bausteinBeschluss'>) => void) => {
      const b = bausteinErzeugen('bausteinBeschluss');
      aendern(b);
      return protokollDokumentPruefen(dokument({ gegenwaertiges: [b] }));
    };
    expect(kaputt((b) => (b.attrs.daten.ja = -1))).not.toBeNull();
    expect(kaputt((b) => (b.attrs.daten.nein = 1.5))).not.toBeNull();
    expect(kaputt((b) => (b.attrs.id = 'keine-uuid'))).not.toBeNull();
    expect(
      kaputt((b) => ((b.attrs.daten as unknown as { extra: number }).extra = 1)),
    ).not.toBeNull();
    expect(
      kaputt((b) => ((b.attrs.daten as unknown as { ergebnis: string }).ergebnis = 'vielleicht')),
    ).not.toBeNull();
    expect(kaputt((b) => ((b as { attrs?: unknown }).attrs = undefined))).not.toBeNull();
    const ev = eventBaustein({ datum: '31.12.2026' as never });
    expect(protokollDokumentPruefen(dokument({ zukuenftiges: [ev] }))).not.toBeNull();
    const zeit = eventBaustein({ beginnZeit: '25:00' });
    expect(protokollDokumentPruefen(dokument({ zukuenftiges: [zeit] }))).not.toBeNull();
  });

  it('accepts drafts with empty fields', () => {
    const ev = eventBaustein({ name: '', datum: null, beginnZeit: null });
    expect(protokollDokumentPruefen(dokument({ zukuenftiges: [ev] }))).toBeNull();
  });

  it('allows unknown node types as generic nodes', () => {
    const doc = dokument({
      gegenwaertiges: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Titel' }] },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [absatz('x')] }],
        },
        { type: 'somethingNew', attrs: { a: 1 } },
      ],
    });
    expect(protokollDokumentPruefen(doc)).toBeNull();
  });

  it('rejects malformed generic nodes', () => {
    expect(
      protokollDokumentPruefen(dokument({ gegenwaertiges: [{ type: 5 } as never] })),
    ).not.toBeNull();
    expect(
      protokollDokumentPruefen(dokument({ gegenwaertiges: [{ type: 'p', text: 5 } as never] })),
    ).not.toBeNull();
    expect(
      protokollDokumentPruefen(
        dokument({ gegenwaertiges: [{ type: 'p', content: 'x' } as never] }),
      ),
    ).not.toBeNull();
    expect(
      protokollDokumentPruefen(
        dokument({ gegenwaertiges: [{ type: 'p', marks: [{ type: 3 }] } as never] }),
      ),
    ).not.toBeNull();
  });

  it('limits the depth', () => {
    const tief = (n: number): ProtokollKnoten =>
      n === 0 ? { type: 'paragraph' } : { type: 'blockquote', content: [tief(n - 1)] };
    // abschnitt = depth 1, so the chain below it may have PROTOKOLL_MAX_TIEFE - 1 levels.
    expect(
      protokollDokumentPruefen(dokument({ gegenwaertiges: [tief(PROTOKOLL_MAX_TIEFE - 2)] })),
    ).toBeNull();
    expect(
      protokollDokumentPruefen(dokument({ gegenwaertiges: [tief(PROTOKOLL_MAX_TIEFE)] })),
    ).toMatch(/verschachtelt/);
  });

  it('limits the size', () => {
    const gross = absatz('x'.repeat(PROTOKOLL_MAX_BYTES));
    expect(protokollDokumentPruefen(dokument({ gegenwaertiges: [gross] }))).toMatch(/zu groß/);
  });
});

describe('beschlussErgebnisVorschlag', () => {
  it('suggests the majority, a tie is rejected, no votes give nothing', () => {
    expect(beschlussErgebnisVorschlag(5, 2)).toBe('angenommen');
    expect(beschlussErgebnisVorschlag(2, 5)).toBe('abgelehnt');
    expect(beschlussErgebnisVorschlag(3, 3)).toBe('abgelehnt');
    expect(beschlussErgebnisVorschlag(0, 0)).toBeNull();
    // Enthaltungen are not an argument: 1 Ja, 0 Nein (and 10 Enthaltungen) is a majority.
    expect(beschlussErgebnisVorschlag(1, 0)).toBe('angenommen');
  });
});

describe('teilnahmeAbleiten', () => {
  it('maps the answer to the attendance', () => {
    expect(teilnahmeAbleiten('teilnahme')).toBe('anwesend');
    expect(teilnahmeAbleiten('absage')).toBe('entschuldigt');
    expect(teilnahmeAbleiten(null)).toBe('unentschuldigt');
  });
});

describe('protokollKopfSchema', () => {
  it('fills defaults and keeps the overrides', () => {
    expect(protokollKopfSchema.parse({})).toEqual(protokollKopfLeer());
    const kopf = protokollKopfSchema.parse({
      teilnahme: { a: 'verspaetet' },
      ems: ['e1'],
      gaeste: 'Gast',
    });
    expect(kopf).toMatchObject({ teilnahme: { a: 'verspaetet' }, ems: ['e1'], gaeste: 'Gast' });
  });
  it('rejects unknown attendance values and fields', () => {
    expect(protokollKopfSchema.safeParse({ teilnahme: { a: 'da' } }).success).toBe(false);
    expect(protokollKopfSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe('input schemas', () => {
  it('lets inhalt and kopf out when creating', () => {
    expect(protokollAnlegenSchema.safeParse({ eventId: 'e1' }).success).toBe(true);
    expect(protokollAnlegenSchema.safeParse({ eventId: '' }).success).toBe(false);
    expect(
      protokollAnlegenSchema.safeParse({ eventId: 'e1', inhalt: { type: 'doc' } }).success,
    ).toBe(false);
  });
  it('needs inhalt, kopf and version when saving', () => {
    const ok = { inhalt: protokollLeer(), kopf: protokollKopfLeer(), version: 1 };
    expect(protokollSpeichernSchema.safeParse(ok).success).toBe(true);
    expect(protokollSpeichernSchema.safeParse({ ...ok, version: 0 }).success).toBe(false);
    expect(protokollSpeichernSchema.safeParse({ ...ok, version: undefined }).success).toBe(false);
  });
});

describe('protokollVorschlag', () => {
  const sitzung = '2026-11-10';
  const bausteine = (doc: ProtokollDokument, abschnitt: number) =>
    (doc.content[abschnitt]!.content ?? []).filter((k) => k.type.startsWith('baustein'));

  it('is empty without a previous protocol', () => {
    expect(protokollVorschlag({ sitzungDatum: sitzung, letztes: null, events: {} })).toEqual(
      protokollLeer(),
    );
  });

  it('turns past events into Vergangenes Event blocks, sorted by date, with empty text', () => {
    const letztes = dokument({
      gegenwaertiges: [
        eventBaustein({ name: 'Spät', datum: '2026-11-05', eventId: 'e2' }, 'Rückblick'),
        eventBaustein({ name: 'Früh', datum: '2026-11-02', eventId: 'e1' }),
        eventBaustein({ name: 'Ohne Datum' }),
      ],
    });
    const doc = protokollVorschlag({ sitzungDatum: sitzung, letztes, events: {} });
    const vergangen = bausteine(doc, 0);
    expect(vergangen.map((v) => v.type)).toEqual([
      'bausteinVergangenesEvent',
      'bausteinVergangenesEvent',
    ]);
    expect(vergangen.map((v) => v.attrs?.daten)).toEqual([
      { eventId: 'e1', name: 'Früh', datum: '2026-11-02' },
      { eventId: 'e2', name: 'Spät', datum: '2026-11-05' },
    ]);
    expect(vergangen[0]!.content).toEqual([{ type: 'paragraph' }]);
    // The block without a date has no end yet: it stays upcoming.
    expect(bausteine(doc, 2).map((b) => (b.attrs?.daten as { name: string }).name)).toEqual([
      'Ohne Datum',
    ]);
    expect(bausteine(doc, 1)).toEqual([]);
    expect(protokollDokumentPruefen(doc)).toBeNull();
  });

  it('uses the end date of multi-day events and treats the Sitzung day as not yet past', () => {
    const letztes = dokument({
      zukuenftiges: [
        eventBaustein({ name: 'Lager', datum: '2026-11-07', bisDatum: '2026-11-12' }),
        eventBaustein({ name: 'Heute', datum: sitzung }),
        eventBaustein({ name: 'Gestern', datum: '2026-11-09' }),
      ],
    });
    const doc = protokollVorschlag({ sitzungDatum: sitzung, letztes, events: {} });
    expect(bausteine(doc, 0).map((b) => (b.attrs?.daten as { name: string }).name)).toEqual([
      'Gestern',
    ]);
    expect(bausteine(doc, 2).map((b) => (b.attrs?.daten as { name: string }).name)).toEqual([
      'Lager',
      'Heute',
    ]);
  });

  it('keeps future events with their text and new ids', () => {
    const original = eventBaustein({ name: 'Barabend', datum: '2026-12-01' }, 'Wer macht Musik?');
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes: dokument({ zukuenftiges: [original] }),
      events: {},
    });
    const kopie = bausteine(doc, 2)[0]!;
    expect(kopie.content).toEqual([absatz('Wer macht Musik?')]);
    expect(kopie.attrs?.daten).toEqual(original.attrs.daten);
    expect(kopie.attrs?.id).not.toBe(original.attrs.id);
    expect(kopie).not.toBe(original);
  });

  it('does not carry Abstimmung and Meinungsbild blocks inside an event over', () => {
    const original = bausteinErzeugen('bausteinEvent', bausteinLeer('bausteinEvent'), [
      absatz('Text'),
      bausteinErzeugen('bausteinBeschluss'),
      bausteinErzeugen('bausteinMeinungsbild'),
    ]);
    const nur = bausteinErzeugen('bausteinEvent', bausteinLeer('bausteinEvent'), [
      bausteinErzeugen('bausteinBeschluss'),
    ]);
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes: dokument({ zukuenftiges: [original, nur] }),
      events: {},
    });
    const [a, b] = bausteine(doc, 2);
    expect(a!.content).toEqual([absatz('Text')]);
    expect(b!.content).toEqual([{ type: 'paragraph' }]);
  });

  it('does not carry Wahl blocks inside an event over', () => {
    const original = bausteinErzeugen('bausteinEvent', bausteinLeer('bausteinEvent'), [
      absatz('Text'),
      bausteinErzeugen('bausteinWahl'),
    ]);
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes: dokument({ zukuenftiges: [original] }),
      events: {},
    });
    expect(bausteine(doc, 2)[0]!.content).toEqual([absatz('Text')]);
  });

  it('refreshes name, dates and times from the calendar', () => {
    const letztes = dokument({
      zukuenftiges: [
        eventBaustein(
          {
            name: 'Alt',
            datum: '2026-12-01',
            beginnZeit: '19:00',
            endeZeit: '23:00',
            eventId: 'e1',
          },
          'Text',
        ),
      ],
    });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes,
      // 2026-12-05 is winter time: 20:00Z = 21:00 Berlin
      events: new Map([
        ['e1', info('2026-12-05T20:00:00.000Z', '2026-12-06T00:30:00.000Z', { titel: 'Neu' })],
      ]),
    });
    expect(bausteine(doc, 2)[0]!.attrs?.daten).toMatchObject({
      name: 'Neu',
      datum: '2026-12-05',
      bisDatum: '2026-12-06',
      beginnZeit: '21:00',
      endeZeit: '01:30',
      eventId: 'e1',
    });
    expect(bausteine(doc, 2)[0]!.content).toEqual([absatz('Text')]);
  });

  it('classifies by the refreshed date: a moved event may become past or future', () => {
    const letztes = dokument({
      zukuenftiges: [
        eventBaustein({ name: 'Verschoben', datum: '2026-12-01', eventId: 'e1' }),
        eventBaustein({ name: 'Vorgezogen', datum: '2026-12-01', eventId: 'e2' }),
      ],
    });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes,
      events: {
        e1: info('2026-11-20T18:00:00.000Z', '2026-11-20T21:00:00.000Z'),
        e2: info('2026-11-03T18:00:00.000Z', '2026-11-03T21:00:00.000Z'),
      },
    });
    expect(bausteine(doc, 0).map((b) => (b.attrs?.daten as { eventId: string }).eventId)).toEqual([
      'e2',
    ]);
    expect(bausteine(doc, 2).map((b) => (b.attrs?.daten as { eventId: string }).eventId)).toEqual([
      'e1',
    ]);
  });

  it('drops cancelled events and keeps events that are gone from the calendar as written', () => {
    const letztes = dokument({
      zukuenftiges: [
        eventBaustein({ name: 'Abgesagt', datum: '2026-12-01', eventId: 'e1' }),
        eventBaustein({ name: 'Gelöscht', datum: '2026-12-02', eventId: 'e2' }),
        eventBaustein({ name: 'Abgesagt vorbei', datum: '2026-11-01', eventId: 'e3' }),
      ],
    });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes,
      events: {
        e1: info('2026-12-01T18:00:00.000Z', '2026-12-01T21:00:00.000Z', { abgesagt: true }),
        e3: info('2026-11-01T18:00:00.000Z', '2026-11-01T21:00:00.000Z', { abgesagt: true }),
      },
    });
    expect(bausteine(doc, 0)).toEqual([]);
    expect(bausteine(doc, 2).map((b) => (b.attrs?.daten as { name: string }).name)).toEqual([
      'Gelöscht',
    ]);
  });

  it('removes duplicates by eventId but keeps blocks without one', () => {
    const letztes = dokument({
      vergangenes: [eventBaustein({ name: 'Doppelt', datum: '2026-12-01', eventId: 'e1' }, 'A')],
      zukuenftiges: [
        eventBaustein({ name: 'Doppelt', datum: '2026-12-01', eventId: 'e1' }, 'B'),
        eventBaustein({ name: 'Frei', datum: '2026-12-03' }),
        eventBaustein({ name: 'Frei', datum: '2026-12-03' }),
      ],
    });
    const doc = protokollVorschlag({ sitzungDatum: sitzung, letztes, events: {} });
    expect(bausteine(doc, 2)).toHaveLength(3);
    expect(bausteine(doc, 2)[0]!.content).toEqual([absatz('A')]);
  });

  it('ignores the old Vergangenes Event, Anwärter, Neues EM and Beschluss blocks', () => {
    const letztes = dokument({
      vergangenes: [bausteinErzeugen('bausteinVergangenesEvent')],
      gegenwaertiges: [
        bausteinErzeugen('bausteinAnwaerter'),
        bausteinErzeugen('bausteinBeschluss'),
        bausteinErzeugen('bausteinEm'),
      ],
    });
    expect(protokollVorschlag({ sitzungDatum: sitzung, letztes, events: {} })).toEqual(
      protokollLeer(),
    );
  });
});

describe('protokollEventIds', () => {
  it('lists the calendar events of the Event blocks once each', () => {
    const doc = dokument({
      vergangenes: [eventBaustein({ eventId: 'e1' })],
      zukuenftiges: [
        eventBaustein({ eventId: 'e1' }),
        eventBaustein({ eventId: 'e2' }),
        eventBaustein({}),
      ],
    });
    expect(protokollEventIds(doc)).toEqual(['e1', 'e2']);
  });
});

describe('Wahl', () => {
  const daten = (
    stimmen: number[],
    anzahl = 1,
    stichwahlen: BausteinWahlDaten['stichwahlen'] = [],
  ): BausteinWahlDaten => ({
    posten: 'Finanzen',
    anzahl,
    kandidaten: stimmen.map((n, i) => ({ id: `k${i}`, sub: null, name: `K${i}`, stimmen: n })),
    enthaltung: 0,
    stichwahlen,
  });
  const runde = (stimmen: Record<string, number>): BausteinWahlDaten['stichwahlen'][number] => ({
    stimmen,
    enthaltung: 0,
  });

  it('is checked strictly and starts empty', () => {
    const pruefen = (d: unknown) =>
      protokollDokumentPruefen(
        dokument({ gegenwaertiges: [bausteinErzeugen('bausteinWahl', d as never)] }),
      );
    expect(bausteinLeer('bausteinWahl')).toEqual({
      posten: '',
      anzahl: 1,
      kandidaten: [],
      enthaltung: 0,
      stichwahlen: [],
    });
    expect(pruefen(daten([3, 2]))).toBeNull();
    expect(pruefen({ ...daten([3, 2]), extra: 1 })).not.toBeNull();
    expect(pruefen({ ...daten([3, 2]), anzahl: 0 })).not.toBeNull();
    expect(pruefen({ ...daten([3, 2]), anzahl: 21 })).not.toBeNull();
    expect(pruefen({ ...daten([3, 2]), posten: 'x'.repeat(201) })).not.toBeNull();
    expect(pruefen(daten(Array.from({ length: 31 }, () => 1)))).not.toBeNull();
    expect(pruefen(daten([-1]))).not.toBeNull();
    expect(
      pruefen(
        daten(
          [1, 1],
          1,
          Array.from({ length: 11 }, () => runde({})),
        ),
      ),
    ).not.toBeNull();
    expect(
      pruefen({ ...daten([3, 2]), stichwahlen: [{ stimmen: { k0: 1.5 }, enthaltung: 0 }] }),
    ).not.toBeNull();
  });

  it('has no result without candidates or votes', () => {
    expect(wahlErgebnis(daten([]))).toEqual({ gewaehlt: [], offen: null, runden: [] });
    expect(wahlErgebnis(daten([0, 0, 0]))).toEqual({ gewaehlt: [], offen: null, runden: [] });
  });

  it('elects the top candidates when the boundary is clear', () => {
    expect(wahlErgebnis(daten([5, 3, 1])).gewaehlt).toEqual(['k0']);
    expect(wahlErgebnis(daten([1, 5, 3, 0], 2)).gewaehlt).toEqual(['k1', 'k2']);
    expect(wahlErgebnis(daten([4, 4, 1], 2))).toMatchObject({
      gewaehlt: ['k0', 'k1'],
      offen: null,
    });
  });

  it('elects all candidates with a vote when there are at most as many as seats', () => {
    expect(wahlErgebnis(daten([2, 0, 3], 3)).gewaehlt).toEqual(['k2', 'k0']);
    expect(wahlErgebnis(daten([1], 1)).gewaehlt).toEqual(['k0']);
  });

  it('needs a Stichwahl among the candidates tied at the boundary', () => {
    // The best is elected already, the two tied for the second seat go to a runoff.
    expect(wahlErgebnis(daten([5, 3, 3], 2))).toEqual({
      gewaehlt: ['k0'],
      offen: { kandidaten: ['k1', 'k2'], plaetze: 1, rundeVorhanden: false },
      runden: [],
    });
    // Tie for the only seat.
    expect(wahlErgebnis(daten([4, 4, 1])).offen).toEqual({
      kandidaten: ['k0', 'k1'],
      plaetze: 1,
      rundeVorhanden: false,
    });
    // Three-way tie for two seats: all three are in the runoff.
    expect(wahlErgebnis(daten([2, 2, 2], 2)).offen).toEqual({
      kandidaten: ['k0', 'k1', 'k2'],
      plaetze: 2,
      rundeVorhanden: false,
    });
  });

  it('applies the Stichwahl and asks for another one on a new tie', () => {
    const ergebnis = wahlErgebnis(daten([5, 3, 3], 2, [runde({ k1: 1, k2: 4 })]));
    expect(ergebnis).toEqual({
      gewaehlt: ['k0', 'k2'],
      offen: null,
      runden: [{ kandidaten: ['k1', 'k2'], plaetze: 1 }],
    });
    const nochmal = wahlErgebnis(daten([5, 3, 3], 2, [runde({ k1: 2, k2: 2 })]));
    expect(nochmal.gewaehlt).toEqual(['k0']);
    expect(nochmal.offen).toEqual({ kandidaten: ['k1', 'k2'], plaetze: 1, rundeVorhanden: false });
    const zweite = wahlErgebnis(daten([5, 3, 3], 2, [runde({ k1: 2, k2: 2 }), runde({ k1: 3 })]));
    expect(zweite).toMatchObject({ gewaehlt: ['k0', 'k1'], offen: null });
    expect(zweite.runden).toHaveLength(2);
  });

  it('narrows a three-way tie round by round', () => {
    // 2 seats, 3 tied: round 1 leaves k2 clearly behind, so k0 and k1 are elected.
    expect(wahlErgebnis(daten([2, 2, 2], 2, [runde({ k0: 3, k1: 3, k2: 1 })]))).toMatchObject({
      gewaehlt: ['k0', 'k1'],
      offen: null,
    });
    // Round 1: k0 is clearly first, k1 and k2 tie for the last seat.
    const r = wahlErgebnis(daten([2, 2, 2], 2, [runde({ k0: 4, k1: 1, k2: 1 })]));
    expect(r.gewaehlt).toEqual(['k0']);
    expect(r.offen).toEqual({ kandidaten: ['k1', 'k2'], plaetze: 1, rundeVorhanden: false });
  });

  it('treats a Stichwahl without any vote as not held yet', () => {
    const r = wahlErgebnis(daten([5, 3, 3], 2, [runde({})]));
    expect(r.offen).toEqual({ kandidaten: ['k1', 'k2'], plaetze: 1, rundeVorhanden: true });
    expect(r.runden).toHaveLength(1);
  });

  it('ignores stored Stichwahlen that are no longer needed', () => {
    const r = wahlErgebnis(daten([5, 3, 1], 2, [runde({ k1: 1, k2: 4 })]));
    expect(r).toMatchObject({ gewaehlt: ['k0', 'k1'], offen: null, runden: [] });
  });

  it('does not count Enthaltungen', () => {
    expect(wahlErgebnis({ ...daten([1, 0]), enthaltung: 10 }).gewaehlt).toEqual(['k0']);
  });
});
