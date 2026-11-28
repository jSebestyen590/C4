import { describe, expect, it } from 'vitest';
import {
  BAUSTEIN_TYPEN,
  ERWAEHNUNG_GRUPPEN,
  erwaehnungAttrs,
  erwaehnungBetrifft,
  PROTOKOLL_ABSCHNITTE,
  PROTOKOLL_MAX_BYTES,
  PROTOKOLL_MAX_TIEFE,
  bausteinErzeugen,
  BILD_TYP,
  istProtokollBildSchluessel,
  protokollBildAnfrageSchema,
  protokollBildPrefix,
  protokollBildSchluessel,
  bausteinLeer,
  beschlussErgebnisVorschlag,
  wahlErgebnis,
  auswahlErgebnis,
  auswahlRunden,
  bausteinAuswahlDatenSchema,
  darfInNotizen,
  type BausteinAuswahlDaten,
  wahlRunden,
  wahlGueltigAbVorschlag,
  protokollAnlegenSchema,
  protokollDokumentNormalisieren,
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
  bausteinWahlDatenSchema,
  bausteinBeschlussDatenSchema,
  bausteinAufnahmeDatenSchema,
  bausteinEmDatenSchema,
  type ProtokollDokument,
  type ProtokollKalenderEvent,
  type ProtokollKnoten,
  istNurInNotizen,
  istVerschachtelbar,
  kannBausteineEnthalten,
  protokollNotizenText,
  bausteinVergangenesEventDatenSchema,
  bausteinEventDatenSchema,
  schichtenOhnePersonen,
  eventDatenAusKalender,
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

const kal = (
  id: string,
  beginn: string,
  ende: string,
  extra: Partial<ProtokollKalenderEvent> = {},
): ProtokollKalenderEvent => ({
  id,
  titel: 'Barabend',
  beginn,
  ende,
  abgesagt: false,
  kategorieId: 'k1',
  dauer: 'eintaegig',
  serie: null,
  sitzung: false,
  verantwortlichSub: null,
  schichten: [],
  ...extra,
});

describe('protokollLeer', () => {
  it('has the four sections in order, each with an empty paragraph', () => {
    const doc = protokollLeer();
    expect(doc.content.map((a) => a.attrs?.art)).toEqual([
      'vergangenes',
      'gegenwaertiges',
      'zukuenftiges',
      'sonstiges',
    ]);
    expect(doc.content.every((a) => a.content?.length === 1)).toBe(true);
    expect(protokollDokumentPruefen(doc)).toBeNull();
  });
});

describe('protokollDokumentNormalisieren', () => {
  it('appends an empty Sonstiges to an old document with three sections and leaves others alone', () => {
    const alt = protokollLeer();
    alt.content.pop();
    const neu = protokollDokumentNormalisieren(alt);
    expect(neu.content.map((a) => a.attrs?.art)).toEqual([...PROTOKOLL_ABSCHNITTE]);
    expect(protokollDokumentPruefen(neu)).toBeNull();
    expect(alt.content).toHaveLength(3);
    const voll = protokollLeer();
    expect(protokollDokumentNormalisieren(voll)).toBe(voll);
  });
});

describe('protokollKopfSchema', () => {
  it('reads old JSON with an automatic next Sitzung and validates an override', () => {
    const alt = protokollKopfSchema.parse({});
    expect(alt.naechsteSitzung).toBeNull();
    expect(alt.naechsteSitzungSchnappschuss).toBeNull();
    expect(
      protokollKopfSchema.safeParse({
        naechsteSitzung: { eventId: null, datum: '2026-11-11', uhrzeit: '20:00' },
      }).success,
    ).toBe(true);
    expect(
      protokollKopfSchema.safeParse({ naechsteSitzung: { eventId: null, datum: '11.11.' } })
        .success,
    ).toBe(false);
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
          wiederholung: null,
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
      wiederholung: null,
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

  it('checks a Thema: title up to 200 characters, optional in old data, strict, Abstimmung inside', () => {
    const thema = (daten: unknown) =>
      protokollDokumentPruefen(
        dokument({
          gegenwaertiges: [
            { type: 'bausteinThema', attrs: { id: crypto.randomUUID(), daten }, content: [] },
          ],
        }),
      );
    expect(bausteinLeer('bausteinThema')).toEqual({ titel: '' });
    expect(thema({ titel: 'Hausordnung' })).toBeNull();
    expect(thema({})).toBeNull();
    expect(thema({ titel: 'x'.repeat(201) })).not.toBeNull();
    expect(thema({ titel: 'a', extra: 1 })).not.toBeNull();
    expect(thema({ titel: 5 })).not.toBeNull();
    const mitWahl = bausteinErzeugen('bausteinThema', { titel: 'T' }, [
      absatz('Text'),
      bausteinErzeugen('bausteinBeschluss'),
      bausteinErzeugen('bausteinWahl'),
    ]);
    expect(protokollDokumentPruefen(dokument({ gegenwaertiges: [mitWahl] }))).toBeNull();
  });

  it('knows empty defaults for every Baustein type', () => {
    for (const typ of BAUSTEIN_TYPEN) {
      // A Todo only stands in the notes of another Baustein.
      const baustein = bausteinErzeugen(typ);
      const doc = dokument({
        gegenwaertiges: [
          istNurInNotizen(typ)
            ? bausteinErzeugen('bausteinThema', undefined, [baustein])
            : baustein,
        ],
      });
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
    expect(protokollDokumentPruefen({ ...doc, content: doc.content.slice(0, 3) })).toBeNull();
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
      gaeste: ['Gast'],
    });
    expect(kopf).toMatchObject({ teilnahme: { a: 'verspaetet' }, ems: ['e1'], gaeste: ['Gast'] });
  });
  it('has the new defaults', () => {
    const kopf = protokollKopfSchema.parse({});
    expect(kopf).toMatchObject({
      emsFreitext: [],
      gaeste: [],
      ende: '',
      naechsteSitzungOrt: 'C4',
    });
  });
  it('splits an old free text of guests / EMs into names (same content)', () => {
    const kopf = protokollKopfSchema.parse({
      gaeste: 'Ralle, Anna Beispiel\n\n  Tom  ,',
      emsFreitext: 'Ede\r\nUdo',
    });
    expect(kopf.gaeste).toEqual(['Ralle', 'Anna Beispiel', 'Tom']);
    expect(kopf.emsFreitext).toEqual(['Ede', 'Udo']);
    expect(protokollKopfSchema.parse({ gaeste: '' }).gaeste).toEqual([]);
  });
  it('limits the names and the Ende / Ort', () => {
    expect(protokollKopfSchema.safeParse({ gaeste: ['x'.repeat(101)] }).success).toBe(false);
    expect(
      protokollKopfSchema.safeParse({ gaeste: Array.from({ length: 51 }, (_, i) => `g${i}`) })
        .success,
    ).toBe(false);
    expect(protokollKopfSchema.safeParse({ ende: '25:00' }).success).toBe(false);
    expect(protokollKopfSchema.safeParse({ ende: '22:10' }).success).toBe(true);
    expect(protokollKopfSchema.safeParse({ naechsteSitzungOrt: 'x'.repeat(101) }).success).toBe(
      false,
    );
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
    expect(protokollVorschlag({ sitzungDatum: sitzung, letztes: null })).toEqual(protokollLeer());
  });

  it('turns past events into Vergangenes Event blocks, sorted by date, with empty text', () => {
    const letztes = dokument({
      gegenwaertiges: [
        eventBaustein({ name: 'Spät', datum: '2026-11-05', eventId: 'e2' }, 'Rückblick'),
        eventBaustein({ name: 'Früh', datum: '2026-11-02', eventId: 'e1' }),
        eventBaustein({ name: 'Ohne Datum' }),
      ],
    });
    const doc = protokollVorschlag({ sitzungDatum: sitzung, letztes });
    const vergangen = bausteine(doc, 0);
    expect(vergangen.map((v) => v.type)).toEqual([
      'bausteinVergangenesEvent',
      'bausteinVergangenesEvent',
    ]);
    expect(vergangen.map((v) => v.attrs?.daten)).toEqual([
      { eventId: 'e1', name: 'Früh', datum: '2026-11-02', bisDatum: null },
      { eventId: 'e2', name: 'Spät', datum: '2026-11-05', bisDatum: null },
    ]);
    expect(vergangen[0]!.content).toEqual([{ type: 'paragraph' }]);
    // The block without a date has no end yet: it stays upcoming.
    expect(bausteine(doc, 2).map((b) => (b.attrs?.daten as { name: string }).name)).toEqual([
      'Ohne Datum',
    ]);
    expect(bausteine(doc, 1)).toEqual([]);
    // Sonstiges starts empty and is not copied.
    expect(doc.content[3]).toEqual({
      type: 'abschnitt',
      attrs: { art: 'sonstiges' },
      content: [{ type: 'paragraph' }],
    });
    expect(protokollDokumentPruefen(doc)).toBeNull();
  });

  it('fills kategorieId of copied Event blocks without eventId from their Vorlage', () => {
    const letztes = dokument({
      zukuenftiges: [
        eventBaustein({ name: 'Alt', datum: '2026-12-01', vorlageId: 'v1' }),
        eventBaustein({ name: 'Eigen', datum: '2026-12-02', vorlageId: 'v1', kategorieId: 'k9' }),
      ],
    });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes,
      vorlageKategorien: { v1: 'k2' },
    });
    expect(
      bausteine(doc, 2).map((b) => (b.attrs?.daten as { kategorieId: string }).kategorieId),
    ).toEqual(['k2', 'k9']);
  });

  it('uses the end date of multi-day events and treats the Sitzung day as not yet past', () => {
    const letztes = dokument({
      zukuenftiges: [
        eventBaustein({ name: 'Lager', datum: '2026-11-07', bisDatum: '2026-11-12' }),
        eventBaustein({ name: 'Heute', datum: sitzung }),
        eventBaustein({ name: 'Gestern', datum: '2026-11-09' }),
      ],
    });
    const doc = protokollVorschlag({ sitzungDatum: sitzung, letztes });
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
    });
    const [a, b] = bausteine(doc, 2);
    expect(a!.content).toEqual([absatz('Text')]);
    expect(b!.content).toEqual([{ type: 'paragraph' }]);
  });

  it('does not carry a Thema over, but keeps no trace of its Wahl either', () => {
    const thema = bausteinErzeugen('bausteinThema', { titel: 'Sonstiges' }, [
      absatz('Text'),
      bausteinErzeugen('bausteinWahl'),
    ]);
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes: dokument({ gegenwaertiges: [thema], zukuenftiges: [thema] }),
    });
    expect(JSON.stringify(doc)).not.toContain('bausteinThema');
    expect(JSON.stringify(doc)).not.toContain('bausteinWahl');
  });

  it('does not carry Wahl blocks inside an event over', () => {
    const original = bausteinErzeugen('bausteinEvent', bausteinLeer('bausteinEvent'), [
      absatz('Text'),
      bausteinErzeugen('bausteinWahl'),
    ]);
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes: dokument({ zukuenftiges: [original] }),
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
      kalender: [
        kal('e1', '2026-12-05T20:00:00.000Z', '2026-12-06T00:30:00.000Z', { titel: 'Neu' }),
      ],
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
      kalender: [
        kal('e1', '2026-11-20T18:00:00.000Z', '2026-11-20T21:00:00.000Z'),
        kal('e2', '2026-11-03T18:00:00.000Z', '2026-11-03T21:00:00.000Z'),
      ],
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
      kalender: [
        kal('e1', '2026-12-01T18:00:00.000Z', '2026-12-01T21:00:00.000Z', { abgesagt: true }),
        kal('e3', '2026-11-01T18:00:00.000Z', '2026-11-01T21:00:00.000Z', { abgesagt: true }),
      ],
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
    const doc = protokollVorschlag({ sitzungDatum: sitzung, letztes });
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
    expect(protokollVorschlag({ sitzungDatum: sitzung, letztes })).toEqual(protokollLeer());
  });
});

describe('protokollVorschlag from the calendar', () => {
  // Sitzung on 2026-11-10; the previous one began on 2026-10-13 at 19:00 (Berlin, CEST).
  const sitzung = '2026-11-10';
  const letzte = '2026-10-13T17:00:00.000Z';
  const bausteine = (doc: ProtokollDokument, abschnitt: number) =>
    (doc.content[abschnitt]!.content ?? []).filter((k) => k.type.startsWith('baustein'));
  const namen = (doc: ProtokollDokument, abschnitt: number) =>
    bausteine(doc, abschnitt).map((b) => (b.attrs?.daten as { name: string }).name);
  const ids = (doc: ProtokollDokument, abschnitt: number) =>
    bausteine(doc, abschnitt).map((b) => (b.attrs?.daten as { eventId: string }).eventId);

  it('takes past events since the last Sitzung and all upcoming ones, sorted, without a protocol', () => {
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letzteSitzungBeginn: letzte,
      letztes: null,
      kalender: [
        kal('alt', '2026-10-12T17:00:00.000Z', '2026-10-12T20:00:00.000Z', {
          titel: 'Vor der Sitzung',
        }),
        kal('v2', '2026-11-05T17:00:00.000Z', '2026-11-05T20:00:00.000Z', { titel: 'Spät' }),
        kal('v1', '2026-10-20T17:00:00.000Z', '2026-10-20T20:00:00.000Z', { titel: 'Früh' }),
        kal('z2', '2027-03-01T17:00:00.000Z', '2027-03-01T20:00:00.000Z', { titel: 'Fern' }),
        kal('z1', '2026-11-20T17:00:00.000Z', '2026-11-20T20:00:00.000Z', { titel: 'Nah' }),
      ],
    });
    expect(ids(doc, 0)).toEqual(['v1', 'v2']);
    expect(ids(doc, 2)).toEqual(['z1', 'z2']);
    expect(bausteine(doc, 0).every((b) => b.type === 'bausteinVergangenesEvent')).toBe(true);
    expect(bausteine(doc, 2)[0]!.attrs?.daten).toMatchObject({
      name: 'Nah',
      datum: '2026-11-20',
      beginnZeit: '18:00',
      endeZeit: '21:00',
      kategorieId: 'k1',
      eventId: 'z1',
    });
    // New events start with an empty list.
    expect(bausteine(doc, 2)[0]!.content).toEqual([
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
    ]);
    expect(protokollDokumentPruefen(doc)).toBeNull();
  });

  it('uses a window of 92 days without a previous Sitzung', () => {
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes: null,
      kalender: [
        kal('weit', '2026-07-01T17:00:00.000Z', '2026-07-01T20:00:00.000Z'),
        kal('knapp', '2026-08-10T17:00:00.000Z', '2026-08-10T20:00:00.000Z'),
      ],
    });
    expect(ids(doc, 0)).toEqual(['knapp']);
  });

  it('puts an event that spans the Sitzung day into Zukünftiges', () => {
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letzteSitzungBeginn: letzte,
      letztes: null,
      kalender: [kal('lager', '2026-11-08T08:00:00.000Z', '2026-11-12T10:00:00.000Z')],
    });
    expect(ids(doc, 0)).toEqual([]);
    expect(ids(doc, 2)).toEqual(['lager']);
    expect(bausteine(doc, 2)[0]!.attrs?.daten).toMatchObject({
      datum: '2026-11-08',
      bisDatum: '2026-11-12',
    });
  });

  it('leaves out cancelled events, series events and Sitzungen', () => {
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letzteSitzungBeginn: letzte,
      letztes: null,
      kalender: [
        kal('abgesagt', '2026-11-20T17:00:00.000Z', '2026-11-20T20:00:00.000Z', { abgesagt: true }),
        kal('serie', '2026-11-21T17:00:00.000Z', '2026-11-21T20:00:00.000Z', { serie: 'barabend' }),
        kal('sitzung', '2026-11-22T17:00:00.000Z', '2026-11-22T20:00:00.000Z', { sitzung: true }),
        kal('normal', '2026-11-23T17:00:00.000Z', '2026-11-23T20:00:00.000Z'),
      ],
    });
    expect(ids(doc, 2)).toEqual(['normal']);
  });

  it('keeps a series event the previous protocol mentions, once, with its notes', () => {
    const letztes = dokument({
      zukuenftiges: [
        eventBaustein({ name: 'Barabend', datum: '2026-11-21', eventId: 'serie' }, 'Notiz'),
      ],
    });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letzteSitzungBeginn: letzte,
      letztes,
      kalender: [
        kal('serie', '2026-11-21T17:00:00.000Z', '2026-11-21T20:00:00.000Z', { serie: 'barabend' }),
      ],
    });
    expect(ids(doc, 2)).toEqual(['serie']);
    expect(bausteine(doc, 2)[0]!.content).toEqual([absatz('Notiz')]);
  });

  it('lets the calendar win but keeps the notes and does not repeat events', () => {
    const letztes = dokument({
      zukuenftiges: [
        eventBaustein(
          {
            name: 'Alt',
            datum: '2026-12-01',
            eventId: 'e1',
            kategorieId: 'alt',
            verantwortlichSub: 'x',
          },
          'Meine Notiz',
        ),
      ],
    });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letzteSitzungBeginn: letzte,
      letztes,
      kalender: [
        kal('e1', '2026-12-05T17:00:00.000Z', '2026-12-05T20:00:00.000Z', {
          titel: 'Neu',
          kategorieId: 'k2',
          verantwortlichSub: 'y',
          schichten: [
            {
              art: 'betrieb',
              beginn: '2026-12-05T17:00:00.000Z',
              ende: '2026-12-05T20:00:00.000Z',
              bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
            },
          ],
        }),
      ],
    });
    expect(bausteine(doc, 2)).toHaveLength(1);
    const b = bausteine(doc, 2)[0]!;
    expect(b.attrs?.daten).toMatchObject({
      name: 'Neu',
      datum: '2026-12-05',
      kategorieId: 'k2',
      verantwortlichSub: 'y',
      schichten: [
        {
          art: 'betrieb',
          beginnZeit: '18:00',
          endeZeit: '21:00',
          bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
        },
      ],
    });
    expect(b.content).toEqual([absatz('Meine Notiz')]);
    expect(protokollDokumentPruefen(doc)).toBeNull();
  });

  it('keeps past blocks of the previous protocol and blocks without eventId at the end', () => {
    const letztes = dokument({
      zukuenftiges: [
        eventBaustein({ name: 'Frei', datum: '2026-11-11' }),
        eventBaustein({ name: 'Vorbei', datum: '2026-11-02', eventId: 'v' }),
      ],
    });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letzteSitzungBeginn: letzte,
      letztes,
      kalender: [
        kal('spaet', '2026-12-24T17:00:00.000Z', '2026-12-24T20:00:00.000Z', { titel: 'Spät' }),
        kal('v', '2026-11-02T17:00:00.000Z', '2026-11-02T20:00:00.000Z', { titel: 'Vorbei' }),
        kal('frueh', '2026-11-12T17:00:00.000Z', '2026-11-12T20:00:00.000Z', { titel: 'Früh' }),
      ],
    });
    expect(ids(doc, 0)).toEqual(['v']);
    expect(namen(doc, 2)).toEqual(['Früh', 'Spät', 'Frei']);
  });

  it('keeps an event gone from the calendar as written', () => {
    const letztes = dokument({
      zukuenftiges: [eventBaustein({ name: 'Gelöscht', datum: '2026-12-02', eventId: 'weg' }, 'T')],
    });
    const doc = protokollVorschlag({ sitzungDatum: sitzung, letztes, kalender: [] });
    expect(namen(doc, 2)).toEqual(['Gelöscht']);
  });

  it('leaves out whole-day times and treats the last day as the end', () => {
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes: null,
      kalender: [
        kal('g', '2026-11-19T23:00:00.000Z', '2026-11-21T23:00:00.000Z', { dauer: 'ganztaegig' }),
      ],
    });
    expect(bausteine(doc, 2)[0]!.attrs?.daten).toMatchObject({
      datum: '2026-11-20',
      bisDatum: '2026-11-21',
      beginnZeit: null,
      endeZeit: null,
    });
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
    postenId: null,
    gueltigAb: '',
    stimmenProPerson: null,
    nichtAngetreten: [],
    annahme: {},
    anzahl,
    kandidaten: stimmen.map((n, i) => ({ id: `k${i}`, sub: null, name: `K${i}`, stimmen: n })),
    enthaltung: 0,
    stichwahlen,
    wiederholung: null,
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
    });
    expect(pruefen(daten([3, 2]))).toBeNull();
    expect(pruefen({ ...daten([3, 2]), postenId: 'p1', gueltigAb: '2027-01-01' })).toBeNull();
    expect(pruefen({ ...daten([3, 2]), gueltigAb: '01.01.2027' })).not.toBeNull();
    expect(pruefen({ ...daten([3, 2]), gueltigAb: '2027-13-45x' })).not.toBeNull();
    expect(pruefen({ ...daten([3, 2]), postenId: 'x'.repeat(101) })).not.toBeNull();
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

  it('accepts old data without postenId and gueltigAb and fills the defaults', () => {
    const alt: Record<string, unknown> = { ...daten([3, 2]) };
    delete alt.postenId;
    delete alt.gueltigAb;
    expect(
      protokollDokumentPruefen(
        dokument({ gegenwaertiges: [bausteinErzeugen('bausteinWahl', alt as never)] }),
      ),
    ).toBeNull();
    delete alt.nichtAngetreten;
    delete alt.annahme;
    expect(bausteinWahlDatenSchema.parse(alt)).toMatchObject({
      postenId: null,
      gueltigAb: '',
      nichtAngetreten: [],
      annahme: {},
    });
    // Old free-text candidates (sub null with a name) stay valid.
    expect(bausteinWahlDatenSchema.safeParse(daten([1])).success).toBe(true);
  });

  it('skips candidates that declined: the next one by votes moves up', () => {
    const d = { ...daten([5, 4, 3], 1), annahme: { k0: false } };
    expect(wahlErgebnis(d)).toMatchObject({ gewaehlt: ['k1'], abgelehnt: ['k0'], offen: null });
    // Accepting is the default and a decline of someone not elected is ignored.
    expect(wahlErgebnis({ ...daten([5, 4, 3]), annahme: { k2: false } })).toMatchObject({
      gewaehlt: ['k0'],
      abgelehnt: [],
    });
    // The replacement can decline, too.
    const zwei = { ...daten([5, 4, 3], 1), annahme: { k0: false, k1: false } };
    expect(wahlErgebnis(zwei)).toMatchObject({ gewaehlt: ['k2'], abgelehnt: ['k0', 'k1'] });
    // Everybody declined: nobody is elected.
    const alle = { ...daten([5, 4], 1), annahme: { k0: false, k1: false } };
    expect(wahlErgebnis(alle)).toMatchObject({ gewaehlt: [], abgelehnt: ['k0', 'k1'] });
  });

  it('needs a Stichwahl for a tie at the new boundary after a decline', () => {
    const d = { ...daten([5, 3, 3], 2), annahme: { k0: false } };
    // Without k0 two seats are left for k1 and k2: all elected, no tie.
    expect(wahlErgebnis(d)).toMatchObject({
      gewaehlt: ['k1', 'k2'],
      abgelehnt: ['k0'],
      offen: null,
    });
    const e = { ...daten([5, 3, 3, 3], 2), annahme: { k0: false } };
    expect(wahlErgebnis(e).offen).toEqual({
      kandidaten: ['k1', 'k2', 'k3'],
      plaetze: 2,
      rundeVorhanden: false,
    });
    const f = { ...daten([5, 4, 3, 3], 2), annahme: { k1: false } };
    expect(wahlErgebnis(f)).toMatchObject({
      gewaehlt: ['k0'],
      abgelehnt: ['k1'],
      offen: { kandidaten: ['k2', 'k3'], plaetze: 1, rundeVorhanden: false },
    });
    const g = { ...f, stichwahlen: [runde({ k2: 2, k3: 1 })] };
    expect(wahlErgebnis(g)).toMatchObject({ gewaehlt: ['k0', 'k2'], offen: null });
  });

  it('lists the held runoff rounds before the ones only a decline needs', () => {
    const d = daten([5, 3, 3], 2, [runde({ k1: 1, k2: 4 })]);
    expect(wahlRunden(d)).toEqual([{ kandidaten: ['k1', 'k2'], plaetze: 1 }]);
    // k2 wins the runoff and declines: k1 has the seat, the held round stays listed.
    const abgelehnt = { ...d, annahme: { k2: false } };
    expect(wahlErgebnis(abgelehnt)).toMatchObject({ gewaehlt: ['k0', 'k1'], abgelehnt: ['k2'] });
    expect(wahlRunden(abgelehnt)).toEqual([{ kandidaten: ['k1', 'k2'], plaetze: 1 }]);
  });

  it('has no result without candidates or votes', () => {
    expect(wahlErgebnis(daten([]))).toEqual({
      gewaehlt: [],
      abgelehnt: [],
      offen: null,
      runden: [],
    });
    expect(wahlErgebnis(daten([0, 0, 0]))).toEqual({
      gewaehlt: [],
      abgelehnt: [],
      offen: null,
      runden: [],
    });
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
      abgelehnt: [],
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
      abgelehnt: [],
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

describe('Auswahl', () => {
  const daten = (
    stimmen: number[],
    anzahl = 1,
    stichwahlen: BausteinAuswahlDaten['stichwahlen'] = [],
  ): BausteinAuswahlDaten => ({
    frage: 'Wohin?',
    anzahl,
    stimmenProPerson: null,
    optionen: stimmen.map((n, i) => ({ id: `o${i}`, text: `O${i}`, stimmen: n })),
    enthaltung: 0,
    stichwahlen,
    wiederholung: null,
  });

  it('is a Baustein type that may sit in notes but holds none', () => {
    expect(BAUSTEIN_TYPEN).toContain('bausteinAuswahl');
    expect(bausteinAuswahlDatenSchema.parse(bausteinLeer('bausteinAuswahl'))).toEqual(
      bausteinLeer('bausteinAuswahl'),
    );
    expect(darfInNotizen('bausteinEvent', 'bausteinAuswahl')).toBe(true);
    expect(darfInNotizen('bausteinThema', 'bausteinAuswahl')).toBe(true);
    expect(darfInNotizen('bausteinAuswahl', 'bausteinThema')).toBe(false);
    expect(darfInNotizen('bausteinAuswahl', 'bausteinBeschluss')).toBe(false);
    expect(darfInNotizen('bausteinWahl', 'bausteinAuswahl')).toBe(false);
  });

  it('validates the fields strictly, stimmenProPerson defaults to null', () => {
    const ohne: Record<string, unknown> = { ...daten([1]) };
    delete ohne.stimmenProPerson;
    expect(bausteinAuswahlDatenSchema.parse(ohne).stimmenProPerson).toBeNull();
    const s = (teil: object) => bausteinAuswahlDatenSchema.safeParse({ ...daten([1]), ...teil });
    expect(s({ anzahl: 0 }).success).toBe(false);
    expect(s({ stimmenProPerson: 21 }).success).toBe(false);
    expect(s({ frage: 'x'.repeat(2001) }).success).toBe(false);
    expect(s({ extra: 1 }).success).toBe(false);
    expect(s({ optionen: [{ id: '', text: 'a', stimmen: 0 }] }).success).toBe(false);
    expect(s({ optionen: [{ id: 'a', text: 'a'.repeat(201), stimmen: 0 }] }).success).toBe(false);
    expect(
      s({ optionen: Array.from({ length: 31 }, (_, i) => ({ id: `${i}`, text: '', stimmen: 0 })) })
        .success,
    ).toBe(false);
    const doc = dokument({ gegenwaertiges: [bausteinErzeugen('bausteinAuswahl', daten([2, 1]))] });
    expect(protokollDokumentPruefen(doc)).toBeNull();
  });

  it('a clear winner is chosen', () => {
    expect(auswahlErgebnis(daten([5, 3, 1]))).toEqual({
      gewaehlt: ['o0'],
      abgelehnt: [],
      offen: null,
      runden: [],
    });
  });

  it('no votes: no result', () => {
    expect(auswahlErgebnis(daten([0, 0])).gewaehlt).toEqual([]);
    expect(auswahlErgebnis(daten([])).offen).toBeNull();
  });

  it('anzahl 2 takes the two best', () => {
    expect(auswahlErgebnis(daten([5, 1, 3], 2)).gewaehlt).toEqual(['o0', 'o2']);
  });

  it('a tie at the boundary is open and needs a Stichwahl', () => {
    const e = auswahlErgebnis(daten([5, 3, 3], 2));
    expect(e.gewaehlt).toEqual(['o0']);
    expect(e.offen).toEqual({ kandidaten: ['o1', 'o2'], plaetze: 1, rundeVorhanden: false });
  });

  it('a Stichwahl resolves the tie', () => {
    const d = daten([4, 4], 1, [{ stimmen: { o0: 1, o1: 3 }, enthaltung: 0 }]);
    const e = auswahlErgebnis(d);
    expect(e.gewaehlt).toEqual(['o1']);
    expect(e.offen).toBeNull();
    expect(auswahlRunden(d)).toEqual([{ kandidaten: ['o0', 'o1'], plaetze: 1 }]);
  });

  it('gives the same result as a Wahl with the same votes', () => {
    const stimmen = [4, 4, 2, 4];
    const stich = [{ stimmen: { o0: 2, o1: 2, o3: 1 }, enthaltung: 0 }];
    const a = auswahlErgebnis(daten(stimmen, 2, stich));
    const w = wahlErgebnis({
      ...bausteinLeer('bausteinWahl'),
      anzahl: 2,
      kandidaten: stimmen.map((n, i) => ({ id: `o${i}`, sub: null, name: '', stimmen: n })),
      stichwahlen: stich,
    });
    expect(a).toEqual(w);
  });
});

describe('Wiederholung nicht beschlussfähiger Abstimmungen', () => {
  const sitzung = '2026-11-10';
  const wiederholen = (ids: string[]) => ({
    bausteinIds: ids,
    datum: '2026-11-05',
    sitzung: 'Sitzung',
  });
  const gegenwaertiges = (doc: ProtokollDokument) => doc.content[1]!.content ?? [];
  const w = { datum: '2026-11-05', sitzung: 'Sitzung' };

  it('defaults wiederholung to null in old data', () => {
    const alt = { antrag: 'x', ja: 1, nein: 0, enthaltung: 0, ergebnis: null };
    expect(bausteinBeschlussDatenSchema.parse(alt).wiederholung).toBeNull();
    expect(
      bausteinAufnahmeDatenSchema.parse({
        sub: null,
        name: '',
        abstimmung: { ja: 1, nein: 0, enthaltung: 0, ergebnis: null },
      }).wiederholung,
    ).toBeNull();
    expect(
      bausteinEmDatenSchema.parse({ sub: null, name: '', abstimmung: null }).wiederholung,
    ).toBeNull();
    const em = { sub: null, name: '', abstimmung: null };
    expect(bausteinEmDatenSchema.parse(em).antragSub).toBeUndefined();
    expect(bausteinEmDatenSchema.parse({ ...em, antragSub: 's1' }).antragSub).toBe('s1');
    const wahl: Record<string, unknown> = { ...bausteinLeer('bausteinWahl') };
    delete wahl.wiederholung;
    expect(bausteinWahlDatenSchema.parse(wahl).wiederholung).toBeNull();
    expect(bausteinLeer('bausteinBeschluss').wiederholung).toBeNull();
  });

  it('copies the votes into Gegenwärtiges, reset, with new ids and a pointer to the Sitzung', () => {
    const beschluss = bausteinErzeugen(
      'bausteinBeschluss',
      { antrag: 'Bier', ja: 3, nein: 1, enthaltung: 0, ergebnis: 'angenommen', wiederholung: null },
      [absatz('Notiz')],
    );
    const aufnahme = bausteinErzeugen('bausteinAufnahme', {
      sub: 'a',
      name: '',
      abstimmung: { ja: 2, nein: 1, enthaltung: 1, ergebnis: 'angenommen' },
      wiederholung: null,
    });
    const em = bausteinErzeugen('bausteinEm', {
      sub: 'e',
      name: '',
      abstimmung: { ja: 1, nein: 0, enthaltung: 0, ergebnis: 'angenommen' },
      wiederholung: null,
    });
    const wahl = bausteinErzeugen('bausteinWahl', {
      ...bausteinLeer('bausteinWahl'),
      posten: 'Kasse',
      postenId: 'p1',
      gueltigAb: '2027-01-01',
      anzahl: 2,
      stimmenProPerson: 1,
      kandidaten: [{ id: 'k1', sub: 'x', name: '', stimmen: 4 }],
      enthaltung: 2,
      stichwahlen: [{ stimmen: { k1: 1 }, enthaltung: 0 }],
      nichtAngetreten: ['n'],
      annahme: { k1: false },
    });
    const letztes = dokument({ gegenwaertiges: [beschluss, aufnahme, em, wahl] });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes,
      wiederholen: wiederholen([beschluss, aufnahme, em, wahl].map((k) => k.attrs.id)),
    });
    const neu = gegenwaertiges(doc).filter((k) => k.type.startsWith('baustein'));
    expect(neu.map((k) => k.type)).toEqual([
      'bausteinBeschluss',
      'bausteinAufnahme',
      'bausteinEm',
      'bausteinWahl',
    ]);
    const alteIds = new Set([beschluss, aufnahme, em, wahl].map((k) => k.attrs.id));
    expect(neu.every((k) => !alteIds.has(k.attrs!.id as string))).toBe(true);
    expect(neu[0]!.attrs!.daten).toEqual({
      antrag: 'Bier',
      ja: 0,
      nein: 0,
      enthaltung: 0,
      ergebnis: null,
      wiederholung: w,
    });
    expect(neu[0]!.content).toEqual([{ type: 'paragraph' }]);
    expect(neu[1]!.attrs!.daten).toEqual({
      sub: 'a',
      name: '',
      abstimmung: { ja: 0, nein: 0, enthaltung: 0, ergebnis: null },
      wiederholung: w,
    });
    expect(neu[2]!.attrs!.daten).toMatchObject({
      sub: 'e',
      abstimmung: { ja: 0, nein: 0, enthaltung: 0, ergebnis: null },
      wiederholung: w,
    });
    expect(neu[3]!.attrs!.daten).toEqual({
      posten: 'Kasse',
      postenId: 'p1',
      gueltigAb: '2027-01-01',
      anzahl: 2,
      stimmenProPerson: 1,
      kandidaten: [{ id: 'k1', sub: 'x', name: '', stimmen: 0 }],
      enthaltung: 0,
      stichwahlen: [],
      nichtAngetreten: ['n'],
      annahme: {},
      wiederholung: w,
    });
    expect(protokollDokumentPruefen(doc)).toBeNull();
  });

  it('lifts votes from the notes of other blocks and only takes the listed ones', () => {
    const innen = bausteinErzeugen('bausteinBeschluss', {
      ...bausteinLeer('bausteinBeschluss'),
      antrag: 'innen',
    });
    const nein = bausteinErzeugen('bausteinBeschluss', {
      ...bausteinLeer('bausteinBeschluss'),
      antrag: 'nein',
    });
    const event = eventBaustein({ name: 'Fest', datum: '2026-12-01', eventId: 'e1' });
    event.content = [absatz('Text'), innen];
    const letztes = dokument({ gegenwaertiges: [event, nein] });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes,
      wiederholen: wiederholen([innen.attrs.id]),
    });
    const neu = gegenwaertiges(doc).filter((k) => k.type.startsWith('baustein'));
    expect(neu.map((k) => (k.attrs!.daten as { antrag: string }).antrag)).toEqual(['innen']);
    // The Event block itself is not copied into Gegenwärtiges (no longer in the past) and loses the vote.
    expect(JSON.stringify(doc.content[2])).not.toContain('"innen"');
  });

  it('repeats an Auswahl with texts kept, votes reset and a pointer to the Sitzung', () => {
    const auswahl = bausteinErzeugen('bausteinAuswahl', {
      ...bausteinLeer('bausteinAuswahl'),
      frage: 'Wohin?',
      anzahl: 2,
      stimmenProPerson: 1,
      optionen: [
        { id: 'a', text: 'Nord', stimmen: 4 },
        { id: 'b', text: 'Süd', stimmen: 4 },
      ],
      enthaltung: 1,
      stichwahlen: [{ stimmen: { a: 1 }, enthaltung: 0 }],
    });
    const nicht = bausteinErzeugen('bausteinAuswahl');
    const letztes = dokument({ gegenwaertiges: [auswahl, nicht] });
    const doc = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes,
      wiederholen: wiederholen([auswahl.attrs.id]),
    });
    const neu = gegenwaertiges(doc).filter((k) => k.type.startsWith('baustein'));
    expect(neu).toHaveLength(1);
    expect(neu[0]!.type).toBe('bausteinAuswahl');
    expect(neu[0]!.attrs!.id).not.toBe(auswahl.attrs.id);
    expect(neu[0]!.attrs!.daten).toEqual({
      frage: 'Wohin?',
      anzahl: 2,
      stimmenProPerson: 1,
      optionen: [
        { id: 'a', text: 'Nord', stimmen: 0 },
        { id: 'b', text: 'Süd', stimmen: 0 },
      ],
      enthaltung: 0,
      stichwahlen: [],
      wiederholung: w,
    });
    // Without the list an Auswahl is dropped like an Abstimmung.
    const ohne = protokollVorschlag({ sitzungDatum: sitzung, letztes });
    expect(gegenwaertiges(ohne).filter((k) => k.type.startsWith('baustein'))).toEqual([]);
  });

  it('skips a Neues EM without a vote and does nothing without a list', () => {
    const em = bausteinErzeugen('bausteinEm');
    const letztes = dokument({ gegenwaertiges: [em] });
    const mit = protokollVorschlag({
      sitzungDatum: sitzung,
      letztes,
      wiederholen: wiederholen([em.attrs.id]),
    });
    expect(gegenwaertiges(mit).filter((k) => k.type.startsWith('baustein'))).toEqual([]);
    const ohne = protokollVorschlag({ sitzungDatum: sitzung, letztes });
    expect(gegenwaertiges(ohne).filter((k) => k.type.startsWith('baustein'))).toEqual([]);
  });
});

describe('wahlGueltigAbVorschlag', () => {
  it('uses the day itself until 1 November', () => {
    expect(wahlGueltigAbVorschlag('2026-03-14')).toBe('2026-03-14');
    expect(wahlGueltigAbVorschlag('2026-11-01')).toBe('2026-11-01');
  });
  it('uses 1 January of the next year after 1 November', () => {
    expect(wahlGueltigAbVorschlag('2026-11-02')).toBe('2027-01-01');
    expect(wahlGueltigAbVorschlag('2026-12-31')).toBe('2027-01-01');
  });
});

describe('@Erwähnungen', () => {
  const mit = (erw: unknown) =>
    protokollDokumentPruefen(
      dokument({
        gegenwaertiges: [
          { type: 'paragraph', content: [{ type: 'erwaehnung', attrs: erw as never }] },
        ],
      }),
    );

  it('accepts valid mentions and rejects broken ones', () => {
    expect(mit({ art: 'person', sub: 'abc' })).toBeNull();
    for (const gruppe of ERWAEHNUNG_GRUPPEN) expect(mit({ art: 'gruppe', gruppe })).toBeNull();
    expect(mit({ art: 'person' })).toMatch(/Erwähnung/);
    expect(mit({ art: 'person', sub: '' })).toMatch(/Erwähnung/);
    expect(mit({ art: 'gruppe', gruppe: 'alle-und-mehr' })).toMatch(/Erwähnung/);
    expect(mit({ art: 'ding' })).toMatch(/Erwähnung/);
    expect(mit(undefined)).toMatch(/Erwähnung/);
  });

  it('keeps documents without mentions valid', () => {
    expect(protokollDokumentPruefen(protokollLeer())).toBeNull();
  });

  it('reads the attributes', () => {
    expect(erwaehnungAttrs({ art: 'person', sub: 's', gruppe: null })).toEqual({
      art: 'person',
      sub: 's',
    });
    expect(erwaehnungAttrs({ art: 'gruppe', gruppe: 'ems', sub: null })).toEqual({
      art: 'gruppe',
      gruppe: 'ems',
    });
    expect(erwaehnungAttrs(null)).toBeNull();
  });

  it('decides who a mention concerns by the current status', () => {
    const ich = (status: 'anwaerter' | 'mitglied' | 'em' | 'extern') => ({ sub: 'me', status });
    expect(erwaehnungBetrifft({ art: 'person', sub: 'me' }, ich('extern'))).toBe(true);
    expect(erwaehnungBetrifft({ art: 'person', sub: 'x' }, ich('mitglied'))).toBe(false);
    const gruppe = (g: (typeof ERWAEHNUNG_GRUPPEN)[number]) => ({
      art: 'gruppe' as const,
      gruppe: g,
    });
    expect(erwaehnungBetrifft(gruppe('anwaerter'), ich('anwaerter'))).toBe(true);
    expect(erwaehnungBetrifft(gruppe('anwaerter'), ich('mitglied'))).toBe(false);
    expect(erwaehnungBetrifft(gruppe('mitglieder'), ich('mitglied'))).toBe(true);
    expect(erwaehnungBetrifft(gruppe('ems'), ich('em'))).toBe(true);
    expect(erwaehnungBetrifft(gruppe('aktive'), ich('anwaerter'))).toBe(true);
    expect(erwaehnungBetrifft(gruppe('aktive'), ich('mitglied'))).toBe(true);
    expect(erwaehnungBetrifft(gruppe('aktive'), ich('em'))).toBe(false);
    expect(erwaehnungBetrifft(gruppe('alle'), ich('em'))).toBe(true);
    expect(erwaehnungBetrifft(gruppe('alle'), ich('extern'))).toBe(false);
  });
});

describe('Bilder', () => {
  const uuid = '00000000-0000-4000-8000-000000000001';
  const schluessel = `protokollbilder/p1/${uuid}.jpg`;
  const bild = (attrs: Record<string, unknown> = {}): ProtokollKnoten => ({
    type: BILD_TYP,
    attrs: { schluessel, breite: 'voll', ausrichtung: 'links', beschreibung: '', ...attrs },
  });
  const mit = (knoten: ProtokollKnoten) => dokument({ gegenwaertiges: [knoten] });

  it('accepts a valid image at section level and in notes', () => {
    expect(protokollDokumentPruefen(mit(bild()))).toBeNull();
    const thema = bausteinErzeugen('bausteinThema', undefined, [absatz('x'), bild()]);
    expect(protokollDokumentPruefen(mit(thema))).toBeNull();
  });

  it.each([
    ['a foreign key', { schluessel: 'profilbilder/p1/x.jpg' }],
    ['a path trick', { schluessel: `protokollbilder/p1/../${uuid}.jpg` }],
    ['a wrong extension', { schluessel: `protokollbilder/p1/${uuid}.png` }],
    ['an unknown width', { breite: 'dritte' }],
    ['an unknown alignment', { ausrichtung: 'oben' }],
    ['a missing description', { beschreibung: undefined }],
    ['a long description', { beschreibung: 'x'.repeat(301) }],
    ['an unknown field', { extra: 1 }],
  ])('rejects %s', (_name, attrs) => {
    expect(protokollDokumentPruefen(mit(bild(attrs)))).not.toBeNull();
  });

  it('knows the key shape, prefix and the keys of a document', () => {
    expect(istProtokollBildSchluessel(schluessel)).toBe(true);
    expect(istProtokollBildSchluessel('protokollbilder/p1/x.jpg')).toBe(false);
    expect(protokollBildPrefix('p1')).toBe('protokollbilder/p1/');
    const thema = bausteinErzeugen('bausteinThema', undefined, [bild()]);
    expect(protokollBildSchluessel(dokument({ gegenwaertiges: [bild(), thema] }))).toEqual([
      schluessel,
    ]);
  });

  it('limits the upload size to 5 MB', () => {
    expect(protokollBildAnfrageSchema.safeParse({ groesse: 5 * 1024 * 1024 }).success).toBe(true);
    expect(protokollBildAnfrageSchema.safeParse({ groesse: 5 * 1024 * 1024 + 1 }).success).toBe(
      false,
    );
    expect(protokollBildAnfrageSchema.safeParse({ groesse: 0 }).success).toBe(false);
  });

  it('does not carry images into the next protocol', () => {
    const event = eventBaustein({ name: 'Barabend', datum: '2026-12-01' }, 'Text');
    event.content = [absatz('Text'), bild()];
    const doc = protokollVorschlag({
      sitzungDatum: '2026-11-10',
      letztes: dokument({ zukuenftiges: [event] }),
    });
    expect(protokollBildSchluessel(doc)).toEqual([]);
    expect(JSON.stringify(doc)).toContain('Text');
  });
});

describe('Usability round: Merker, Schicht-Personen, Vergangenes bisDatum, zitatInline', () => {
  it('knows the Merker: empty data, nestable, holds no Bausteine', () => {
    expect(bausteinLeer('bausteinMerker')).toEqual({});
    expect(istVerschachtelbar('bausteinMerker')).toBe(true);
    expect(kannBausteineEnthalten('bausteinMerker')).toBe(false);
    const merker = bausteinErzeugen('bausteinMerker', {}, [
      { type: 'paragraph', content: [{ type: 'text', text: 'Noch klären' }] },
    ]);
    const d = protokollLeer();
    d.content[0]!.content = [merker];
    expect(protokollDokumentPruefen(d)).toBeNull();
    // strict: no fields
    const kaputt = JSON.parse(JSON.stringify(merker)) as typeof merker;
    (kaputt.attrs.daten as Record<string, unknown>).x = 1;
    d.content[0]!.content = [kaputt];
    expect(protokollDokumentPruefen(d)).not.toBeNull();
  });
  it('leaves a Merker out of the plain text of notes and of the suggestion for the next protocol', () => {
    const merker = bausteinErzeugen('bausteinMerker', {}, [
      { type: 'paragraph', content: [{ type: 'text', text: 'geheim' }] },
    ]);
    expect(protokollNotizenText([merker])).toBe('');
    const event = bausteinErzeugen(
      'bausteinEvent',
      { ...bausteinLeer('bausteinEvent'), eventId: 'e9', name: 'Fest', datum: '2099-01-01' },
      [{ type: 'paragraph', content: [{ type: 'text', text: 'Notiz' }] }, merker],
    );
    const letztes = protokollLeer();
    letztes.content[2]!.content = [event];
    const neu = protokollVorschlag({ sitzungDatum: '2026-01-01', letztes });
    expect(JSON.stringify(neu)).not.toContain('geheim');
    expect(JSON.stringify(neu)).toContain('Notiz');
  });
  it('accepts the mark zitatInline in the text', () => {
    const d = protokollLeer();
    d.content[0]!.content = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Wortlaut', marks: [{ type: 'zitatInline' }] }],
      },
    ];
    expect(protokollDokumentPruefen(d)).toBeNull();
  });
  it('gives a Vergangenes Event a bisDatum (default null)', () => {
    expect(
      bausteinVergangenesEventDatenSchema.parse({ eventId: null, name: 'X', datum: null }),
    ).toEqual({ eventId: null, name: 'X', datum: null, bisDatum: null });
    expect(
      bausteinVergangenesEventDatenSchema.safeParse({
        eventId: null,
        name: 'X',
        datum: '2026-02-11',
        bisDatum: '2026-02-13',
      }).success,
    ).toBe(true);
    expect(
      bausteinVergangenesEventDatenSchema.safeParse({
        eventId: null,
        name: 'X',
        datum: '2026-02-11',
        bisDatum: 'morgen',
      }).success,
    ).toBe(false);
  });
  it('defaults personen of Schichten to [] and keeps entered ones', () => {
    const roh = [
      {
        art: 'betrieb',
        beginnZeit: '19:00',
        endeZeit: '22:00',
        bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
      },
      {
        art: 'aufbau',
        tagVersatz: 0,
        beginnZeit: '15:00',
        endeZeit: '18:00',
        minimum: 1,
        wunsch: 2,
        personen: ['a'],
      },
    ];
    const d = bausteinEventDatenSchema.parse({ ...bausteinLeer('bausteinEvent'), schichten: roh });
    expect(d.schichten[0]).toMatchObject({ bedarfe: [{ personen: [] }] });
    expect(d.schichten[1]).toMatchObject({ personen: ['a'] });
    expect(schichtenOhnePersonen(d.schichten)).toEqual([
      {
        art: 'betrieb',
        beginnZeit: '19:00',
        endeZeit: '22:00',
        bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
      },
      {
        art: 'aufbau',
        tagVersatz: 0,
        beginnZeit: '15:00',
        endeZeit: '18:00',
        minimum: 1,
        wunsch: 2,
      },
    ]);
    const zuViele = { ...roh[1], personen: Array.from({ length: 51 }, (_, i) => `p${i}`) };
    expect(
      bausteinEventDatenSchema.safeParse({ ...bausteinLeer('bausteinEvent'), schichten: [zuViele] })
        .success,
    ).toBe(false);
  });
  it('fills personen from the Dienste of the calendar (members only)', () => {
    const mitglied = (sub: string) => ({
      art: 'mitglied' as const,
      sub,
      username: sub,
      vorname: 'V',
      nachname: 'N',
      status: 'mitglied' as const,
      anrede: 'neutral' as const,
    });
    const daten = eventDatenAusKalender({
      id: 'e1',
      titel: 'Fest',
      beginn: '2026-12-05T18:00:00.000Z',
      ende: '2026-12-05T21:00:00.000Z',
      abgesagt: false,
      kategorieId: 'k',
      dauer: 'eintaegig',
      serie: null,
      sitzung: false,
      verantwortlichSub: null,
      schichten: [
        {
          art: 'betrieb',
          beginn: '2026-12-05T18:00:00.000Z',
          ende: '2026-12-05T21:00:00.000Z',
          bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
          dienste: [
            { dienstformId: 'bar', person: mitglied('a') },
            { dienstformId: 'bar', person: { art: 'extern', id: 'x', name: 'Ext' } as never },
          ],
        },
        {
          art: 'putzen',
          beginn: '2026-12-05T21:00:00.000Z',
          ende: '2026-12-05T22:00:00.000Z',
          minimum: 1,
          wunsch: 1,
          dienste: [{ dienstformId: null, person: mitglied('b') }],
        },
      ],
    });
    expect(daten.schichten[0]).toMatchObject({
      art: 'betrieb',
      bedarfe: [{ dienstformId: 'bar', personen: ['a'] }],
    });
    expect(daten.schichten[1]).toMatchObject({ art: 'putzen', personen: ['b'] });
  });
});
