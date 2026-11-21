import { describe, expect, it } from 'vitest';
import {
  bausteinErzeugen,
  bausteinTodoDatenSchema,
  darfInNotizen,
  istNurInNotizen,
  kannBausteineEnthalten,
  protokollDokumentPruefen,
  protokollLeer,
  protokollNotizenText,
  protokollVorschlag,
  type ProtokollKnoten,
  todoZustaendigeAufloesen,
} from './protokolle';
import {
  todoEingabeSchema,
  todoFaelligKurz,
  todoFuerMichErledigt,
  todosSortieren,
  type Todo,
} from './todos';

describe('todoEingabeSchema', () => {
  it('trims the title and accepts missing notes', () => {
    expect(todoEingabeSchema.parse({ titel: ' Kasse ', faelligAm: '2026-11-14' })).toEqual({
      titel: 'Kasse',
      faelligAm: '2026-11-14',
    });
    expect(
      todoEingabeSchema.parse({ titel: 'a', notizen: null, faelligAm: '2026-11-14' }).notizen,
    ).toBe(null);
  });
  it('rejects empty and too long values and bad dates', () => {
    expect(todoEingabeSchema.safeParse({ titel: '  ', faelligAm: '2026-11-14' }).success).toBe(
      false,
    );
    expect(
      todoEingabeSchema.safeParse({ titel: 'a'.repeat(201), faelligAm: '2026-11-14' }).success,
    ).toBe(false);
    expect(
      todoEingabeSchema.safeParse({
        titel: 'a',
        notizen: 'n'.repeat(2001),
        faelligAm: '2026-11-14',
      }).success,
    ).toBe(false);
    expect(todoEingabeSchema.safeParse({ titel: 'a', faelligAm: '14.11.2026' }).success).toBe(
      false,
    );
  });
});

describe('Baustein Todo', () => {
  it('has defaults and validates the zuständig list', () => {
    expect(
      bausteinTodoDatenSchema.parse({
        titel: 'x',
        zustaendig: [{ art: 'person', sub: 's' }],
        faelligAm: null,
      }),
    ).toEqual({
      titel: 'x',
      zustaendig: [{ art: 'person', sub: 's' }],
      faelligAm: null,
      modus: 'einzeln',
      todoId: null,
    });
    expect(
      bausteinTodoDatenSchema.safeParse({
        titel: 'x',
        zustaendig: [{ art: 'gruppe', gruppe: 'x' }],
        faelligAm: null,
      }).success,
    ).toBe(false);
    expect(
      bausteinTodoDatenSchema.safeParse({
        titel: 'x',
        zustaendig: Array.from({ length: 51 }, (_, i) => ({ art: 'person', sub: `s${i}` })),
        faelligAm: null,
      }).success,
    ).toBe(false);
  });

  it('may stand in notes of an Event or Thema but not in votes or another Todo', () => {
    expect(darfInNotizen('bausteinEvent', 'bausteinTodo')).toBe(true);
    expect(darfInNotizen('bausteinThema', 'bausteinTodo')).toBe(true);
    expect(darfInNotizen('bausteinTodo', 'bausteinTodo')).toBe(false);
    expect(darfInNotizen('bausteinWahl', 'bausteinTodo')).toBe(false);
    expect(darfInNotizen('bausteinBeschluss', 'bausteinTodo')).toBe(false);
    expect(kannBausteineEnthalten('bausteinTodo')).toBe(false);
  });

  it('is a valid document node in the notes of another Baustein', () => {
    const d = protokollLeer();
    d.content[2]!.content = [
      bausteinErzeugen('bausteinThema', undefined, [bausteinErzeugen('bausteinTodo')]),
    ];
    expect(protokollDokumentPruefen(d)).toBeNull();
  });

  it('is rejected at the top level of a section', () => {
    expect(istNurInNotizen('bausteinTodo')).toBe(true);
    expect(istNurInNotizen('bausteinBeschluss')).toBe(false);
    for (const i of [0, 1, 2, 3]) {
      const d = protokollLeer();
      d.content[i]!.content = [bausteinErzeugen('bausteinTodo')];
      expect(protokollDokumentPruefen(d)).toBe(
        'Ein Todo gehört in die Notizen eines anderen Bausteins, nicht auf die oberste Ebene.',
      );
    }
  });

  it('may stand in a list item of the notes of a Baustein, but not in a list of a section', () => {
    const imPunkt = (): ProtokollKnoten => ({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph' }, bausteinErzeugen('bausteinTodo')],
        },
      ],
    });
    const gut = protokollLeer();
    gut.content[2]!.content = [bausteinErzeugen('bausteinThema', undefined, [imPunkt()])];
    expect(protokollDokumentPruefen(gut)).toBeNull();
    const schlecht = protokollLeer();
    schlecht.content[2]!.content = [imPunkt()];
    expect(protokollDokumentPruefen(schlecht)).toBe(
      'Ein Todo gehört in die Notizen eines anderen Bausteins, nicht auf die oberste Ebene.',
    );
  });

  it('accepts list items that hold an empty paragraph and a block, and empty items', () => {
    const d = protokollLeer();
    d.content[2]!.content = [
      bausteinErzeugen('bausteinThema', undefined, [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph' },
                bausteinErzeugen('bausteinBeschluss'),
                { type: 'blockquote', content: [{ type: 'paragraph' }] },
              ],
            },
            { type: 'listItem', content: [{ type: 'paragraph' }] },
          ],
        },
      ]),
    ];
    expect(protokollDokumentPruefen(d)).toBeNull();
  });

  it('is not carried into the next protocol', () => {
    const letztes = protokollLeer();
    const event = bausteinErzeugen(
      'bausteinEvent',
      {
        vorlageId: null,
        name: 'E',
        datum: '2026-12-01',
        bisDatum: null,
        beginnZeit: null,
        endeZeit: null,
        schichten: [],
        verantwortlichSub: null,
        eventId: 'e1',
        kategorieId: null,
      },
      [bausteinErzeugen('bausteinTodo')],
    );
    letztes.content[2]!.content = [
      event,
      bausteinErzeugen('bausteinThema', undefined, [bausteinErzeugen('bausteinTodo')]),
    ];
    const neu = protokollVorschlag({ sitzungDatum: '2026-11-20', letztes });
    expect(JSON.stringify(neu)).not.toContain('bausteinTodo');
  });
});

describe('todoZustaendigeAufloesen', () => {
  const mitglieder = [
    { sub: 'a', status: 'mitglied' as const },
    { sub: 'b', status: 'anwaerter' as const },
    { sub: 'c', status: 'em' as const },
    { sub: 'd', status: 'extern' as const },
    { sub: 'e', status: 'mitglied' as const, deaktiviert: true },
  ];
  it('resolves groups by current status, dedupes and drops deactivated and unknown members', () => {
    expect(
      todoZustaendigeAufloesen(
        [
          { art: 'gruppe', gruppe: 'alle' },
          { art: 'person', sub: 'a' },
          { art: 'person', sub: 'e' },
          { art: 'person', sub: 'x' },
          { art: 'person', sub: 'd' },
        ],
        mitglieder,
      ),
    ).toEqual(['a', 'b', 'c', 'd']);
    expect(todoZustaendigeAufloesen([{ art: 'gruppe', gruppe: 'ems' }], mitglieder)).toEqual(['c']);
    expect(todoZustaendigeAufloesen([], mitglieder)).toEqual([]);
  });
});

describe('protokollNotizenText', () => {
  it('writes one line per paragraph or list item', () => {
    const t = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    expect(
      protokollNotizenText([
        t('Eins'),
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                t('Zwei'),
                { type: 'bulletList', content: [{ type: 'listItem', content: [t(' Drei ')] }] },
              ],
            },
          ],
        },
        { type: 'paragraph' },
      ]),
    ).toBe('Eins\nZwei\nDrei');
    expect(protokollNotizenText(undefined)).toBe('');
  });
});

describe('Todo helpers', () => {
  const todo = (extra: Partial<Todo>): Pick<Todo, 'modus' | 'erledigtAm' | 'zustaendige'> => ({
    modus: 'einzeln',
    erledigtAm: null,
    zustaendige: [
      {
        sub: 'a',
        username: 'a',
        vorname: '',
        nachname: '',
        status: 'mitglied',
        anrede: 'neutral',
        erledigtAm: '2026-11-01T10:00:00Z',
      },
      {
        sub: 'b',
        username: 'b',
        vorname: '',
        nachname: '',
        status: 'mitglied',
        anrede: 'neutral',
        erledigtAm: null,
      },
    ],
    ...extra,
  });
  it('tells whether a Todo is done for a person', () => {
    expect(todoFuerMichErledigt(todo({}), 'a')).toBe(true);
    expect(todoFuerMichErledigt(todo({}), 'b')).toBe(false);
    expect(todoFuerMichErledigt(todo({}), 'x')).toBe(false);
    expect(
      todoFuerMichErledigt(todo({ modus: 'gemeinsam', erledigtAm: '2026-11-02T10:00:00Z' }), 'b'),
    ).toBe(true);
    expect(todoFuerMichErledigt(todo({ modus: 'gemeinsam' }), 'a')).toBe(false);
  });
  it('formats the deadline', () => {
    expect(todoFaelligKurz('2026-11-14')).toBe('Sa, 14.11.');
  });
  it('sorts open by deadline, then done with the latest first', () => {
    const l = (titel: string, faelligAm: string, ichErledigt: boolean) => ({
      titel,
      faelligAm,
      ichErledigt,
    });
    expect(
      todosSortieren([
        l('d1', '2026-11-01', true),
        l('o2', '2026-11-20', false),
        l('d2', '2026-11-10', true),
        l('o1', '2026-11-05', false),
      ]).map((x) => x.titel),
    ).toEqual(['o1', 'o2', 'd2', 'd1']);
  });
});
