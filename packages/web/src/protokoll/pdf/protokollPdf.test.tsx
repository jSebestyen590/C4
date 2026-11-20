// @vitest-environment node
import { createRequire } from 'node:module';
import { pdf } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { bausteinLeer, protokollKopfLeer, type ProtokollKnoten } from '@c4/shared';
import { dokumentGliederungBauen, dokumentUeberschriften } from '../dokumentUeberschriften';
import { personName, type DokumentEingabe } from '../dokumentDaten';
import { blockBaum, lesezeichen, pdfBloecke } from './pdfBloecke';
import { ProtokollPdf } from './ProtokollPdf';
import { schriftenRegistrieren } from './schriften';

const text = (t: string): ProtokollKnoten => ({
  type: 'paragraph',
  content: [{ type: 'text', text: t }],
});
const ueberschrift = (level: 2 | 3, t: string): ProtokollKnoten => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text: t }],
});
const liste = (...t: string[]): ProtokollKnoten => ({
  type: 'bulletList',
  content: t.map((x) => ({ type: 'listItem', content: [text(x)] })),
});

const event = (id: string, name: string, content: ProtokollKnoten[]): ProtokollKnoten => ({
  type: 'bausteinEvent',
  attrs: {
    id,
    daten: { ...bausteinLeer('bausteinEvent'), name, datum: '2024-02-11', verantwortlichSub: '1' },
  },
  content,
});

const abstimmung: ProtokollKnoten = {
  type: 'bausteinBeschluss',
  attrs: {
    id: 'v1',
    daten: {
      antrag: 'Neuer Tresen „Prima“',
      ja: 1,
      nein: 0,
      enthaltung: 0,
      ergebnis: 'angenommen',
    },
  },
  content: [text('Notiz zur Abstimmung')],
};

const eingabe: DokumentEingabe = {
  inhalt: {
    type: 'doc',
    content: [
      {
        type: 'abschnitt',
        attrs: { art: 'vergangenes' },
        content: [
          {
            type: 'bausteinVergangenesEvent',
            attrs: {
              id: 'a',
              daten: { eventId: null, name: 'Weihnachtsöffnung', datum: '2023-12-27' },
            },
            content: [
              liste('Waren einige Gäste da'),
              { type: 'blockquote', content: [text('Aufgewacht'), text('– Strobi')] },
              {
                type: 'orderedList',
                content: [
                  {
                    type: 'listItem',
                    content: [text('Erstens'), liste('verschachtelt')],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'abschnitt',
        attrs: { art: 'gegenwaertiges' },
        content: [
          ueberschrift(2, 'Finanzen'),
          text('Alles gut – „sehr“ gut.'),
          ueberschrift(3, 'Kasse'),
          abstimmung,
          {
            type: 'bausteinAnwesenheit',
            attrs: { id: 'w', daten: { art: 'geht', sub: '1', uhrzeit: '22:10' } },
          },
        ],
      },
      {
        type: 'abschnitt',
        attrs: { art: 'zukuenftiges' },
        content: [
          event('b', 'Superbowl', [liste('notes'), ueberschrift(3, 'Aufgaben'), abstimmung]),
        ],
      },
    ],
  },
  kopf: { ...protokollKopfLeer(), sitzungsleitung: '1', eroeffnung: '20:04' },
  teilnahme: [
    {
      sub: '1',
      username: 'Niklas',
      vorname: 'N',
      nachname: 'N',
      status: 'mitglied',
      anrede: 'neutral',
      abgeleitet: 'anwesend',
      wert: 'anwesend',
      ueberschrieben: false,
    },
  ],
  ems: [],
  sitzung: { titel: 'Clubsitzung', beginn: '2024-01-30T19:00:00Z', art: 'sitzung' },
};

describe('PDF outline', () => {
  it('mirrors the Gliederung of the document view and leaves votes out', () => {
    const outline = lesezeichen(blockBaum(pdfBloecke(eingabe)));
    const gliederung = dokumentGliederungBauen(
      dokumentUeberschriften(eingabe.inhalt, (sub) => {
        const m = eingabe.teilnahme.find((x) => x.sub === sub);
        return m ? personName(m) : null;
      }).eintraege,
    );
    const alsTitel = (g: typeof gliederung): unknown[] =>
      g.map((k) => ({ titel: k.text, kinder: alsTitel(k.kinder) }));
    expect(outline).toEqual(alsTitel(gliederung));
    expect(outline).toEqual([
      { titel: 'Vergangenes', kinder: [{ titel: '27.12. Weihnachtsöffnung', kinder: [] }] },
      {
        titel: 'Gegenwärtiges',
        kinder: [{ titel: 'Finanzen', kinder: [{ titel: 'Kasse', kinder: [] }] }],
      },
      {
        titel: 'Zukünftiges',
        kinder: [{ titel: '11.02. Superbowl', kinder: [{ titel: 'Aufgaben', kinder: [] }] }],
      },
    ]);
  });
});

describe('PDF: Thema and Wahl', () => {
  const wahl: ProtokollKnoten = {
    type: 'bausteinWahl',
    attrs: {
      id: 'w1',
      daten: {
        ...bausteinLeer('bausteinWahl'),
        posten: 'Kasse',
        kandidaten: [{ id: 'a', sub: null, name: 'Anna', stimmen: 2 }],
      },
    },
    content: [text('WAHLDISKUSSION')],
  };
  const thema: ProtokollKnoten = {
    type: 'bausteinThema',
    attrs: { id: 't1', daten: { titel: 'Vorstand' } },
    content: [text('THEMENNOTIZ'), ueberschrift(3, 'Detail'), wahl],
  };
  const mit: DokumentEingabe = {
    ...eingabe,
    inhalt: {
      ...eingabe.inhalt,
      content: [
        eingabe.inhalt.content[0]!,
        { ...eingabe.inhalt.content[1]!, content: [thema, wahl, { type: 'paragraph' }] },
        eingabe.inhalt.content[2]!,
      ],
    },
  };

  it('puts a Thema into the bookmarks at the level of an Event', () => {
    const outline = lesezeichen(blockBaum(pdfBloecke(mit)));
    const gegenwart = outline.find((o) => o.titel === 'Gegenwärtiges')!;
    expect(gegenwart.kinder).toEqual([
      { titel: 'Vorstand', kinder: [{ titel: 'Detail', kinder: [] }] },
    ]);
  });

  it('renders the notes of a Wahl before its box, top-level and nested', () => {
    const text = JSON.stringify(
      pdfBloecke(mit).map((b) => b.element),
      // `ctx` props carry the whole input; only the rendered tree counts for the order.
      (k, v: unknown) => (k === 'ctx' ? undefined : v),
    );
    const alle = [...text.matchAll(/WAHLDISKUSSION/g)].map((m) => m.index!);
    const boxen = [...text.matchAll(/Kandidat:innen: /g)].map((m) => m.index!);
    expect(alle).toHaveLength(2);
    expect(boxen).toHaveLength(2);
    // nested (in the Thema) first, top-level second; each box follows its notes
    expect(alle[0]!).toBeLessThan(boxen[0]!);
    expect(boxen[0]!).toBeLessThan(alle[1]!);
    expect(alle[1]!).toBeLessThan(boxen[1]!);
  });
});

describe('PDF: Auswahl', () => {
  const auswahl: ProtokollKnoten = {
    type: 'bausteinAuswahl',
    attrs: {
      id: 'x1',
      daten: {
        ...bausteinLeer('bausteinAuswahl'),
        frage: 'Wohin?',
        optionen: [
          { id: 'a', text: 'Berlin', stimmen: 2 },
          { id: 'b', text: 'Dresden', stimmen: 1 },
        ],
        enthaltung: 1,
      },
    },
    content: [text('AUSWAHLDISKUSSION')],
  };
  const mit: DokumentEingabe = {
    ...eingabe,
    inhalt: {
      ...eingabe.inhalt,
      content: [
        eingabe.inhalt.content[0]!,
        { ...eingabe.inhalt.content[1]!, content: [auswahl, { type: 'paragraph' }] },
        eingabe.inhalt.content[2]!,
      ],
    },
  };

  it('renders heading, notes, then the result box, and stays out of the bookmarks', () => {
    const json = JSON.stringify(
      pdfBloecke(mit).map((b) => b.element),
      (k, v: unknown) => (k === 'ctx' ? undefined : v),
    );
    const i = (s: string) => json.indexOf(s);
    expect(i('Abstimmung: Wohin?')).toBeGreaterThan(-1);
    expect(i('Abstimmung: Wohin?')).toBeLessThan(i('AUSWAHLDISKUSSION'));
    expect(i('AUSWAHLDISKUSSION')).toBeLessThan(i('Möglichkeiten: '));
    expect(json).toContain('Berlin 2 · Dresden 1 · Enthaltung 1');
    expect(json).toContain('Ergebnis: ');
    const outline = JSON.stringify(lesezeichen(blockBaum(pdfBloecke(mit))));
    expect(outline).not.toContain('Wohin');
  });
});

describe('PDF rendering', () => {
  it('renders the minutes to a valid PDF with embedded font', async () => {
    const require = createRequire(import.meta.url);
    const datei = (n: string) =>
      require.resolve(`@fontsource/noto-sans/files/noto-sans-latin-${n}.woff`);
    schriftenRegistrieren({
      normal: datei('400-normal'),
      fett: datei('700-normal'),
      kursiv: datei('400-italic'),
      fettKursiv: datei('700-italic'),
    });
    const strom = await pdf(<ProtokollPdf eingabe={eingabe} />).toBuffer();
    const teile: Buffer[] = [];
    for await (const t of strom) teile.push(Buffer.from(t as Uint8Array));
    const bytes = Buffer.concat(teile);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
    const roh = bytes.toString('latin1');
    expect(roh).toContain('/Outlines');
    // One outline entry per heading of the Gliederung (8) plus the document title in the info.
    expect(roh.match(/\/Title /g)?.length).toBe(9);
    expect(roh).toContain('/Count');
  });
});

describe('PDF: Erwähnungen', () => {
  const erw = (attrs: Record<string, unknown>): ProtokollKnoten => ({ type: 'erwaehnung', attrs });
  const mit: DokumentEingabe = {
    ...eingabe,
    ich: { sub: '1', status: 'mitglied' },
    mitglieder: [
      {
        sub: '2',
        username: 'gast',
        vorname: 'G',
        nachname: 'G',
        status: 'extern',
      },
    ],
    inhalt: {
      ...eingabe.inhalt,
      content: [
        {
          ...eingabe.inhalt.content[0]!,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Hallo ' },
                erw({ art: 'person', sub: '1' }),
                { type: 'text', text: ' und ' },
                erw({ art: 'person', sub: '2' }),
                { type: 'text', text: ' und ' },
                erw({ art: 'gruppe', gruppe: 'mitglieder' }),
              ],
            },
          ],
        },
        ...eingabe.inhalt.content.slice(1),
      ],
    },
  };

  it('writes @username in the status color and @Gruppe as plain text, without highlighter', () => {
    const text = JSON.stringify(
      pdfBloecke(mit).map((b) => b.element),
      (k, v: unknown) => (k === 'ctx' ? undefined : v),
    );
    expect(text).toContain('@Niklas');
    expect(text).toContain('@gast');
    expect(text).toContain('@Mitglieder');
    // persons go through the same bold status-colored name as other mentions of members
    expect(text).toContain('"name":"@Niklas","status":"mitglied"');
    expect(text).toContain('"name":"@gast","status":"extern"');
    expect(text).not.toContain('backgroundColor":"#ffe');
  });
});

describe('PDF: Todo', () => {
  const todo: ProtokollKnoten = {
    type: 'bausteinTodo',
    attrs: {
      id: 'td',
      daten: {
        ...bausteinLeer('bausteinTodo'),
        titel: 'Kasse prüfen',
        zustaendig: [
          { art: 'person', sub: '1' },
          { art: 'gruppe', gruppe: 'alle' },
        ],
        faelligAm: '2026-11-14',
      },
    },
    content: [liste('TODONOTIZ')],
  };
  const thema = (inhalt: ProtokollKnoten[]): ProtokollKnoten => ({
    type: 'bausteinThema',
    attrs: { id: 'th', daten: { ...bausteinLeer('bausteinThema'), titel: 'Kasse' } },
    content: inhalt,
  });
  const mitInhalt = (inhalt: ProtokollKnoten[]): DokumentEingabe => ({
    ...eingabe,
    inhalt: {
      ...eingabe.inhalt,
      content: [
        eingabe.inhalt.content[0]!,
        {
          ...eingabe.inhalt.content[1]!,
          content: [thema([...inhalt, { type: 'paragraph' }]), { type: 'paragraph' }],
        },
        eingabe.inhalt.content[2]!,
      ],
    },
  });
  const mit = mitInhalt([todo]);
  /** The blocks of the Thema "Kasse" (the section Gegenwärtiges) as JSON. */
  const json = (e: DokumentEingabe) => {
    const text = JSON.stringify(
      pdfBloecke(e).map((b) => b.element),
      (k, v: unknown) => (k === 'ctx' ? undefined : v),
    );
    return text.slice(text.indexOf('"Kasse"'), text.indexOf('"Zukünftiges"'));
  };

  it('writes the Todo as a bullet with its notes one level deeper, in no box, out of the bookmarks', () => {
    const text = json(mit);
    expect(text).toContain('Todo:');
    expect(text).toContain('Kasse prüfen');
    expect(text).toContain('@Alle');
    expect(text).toContain(' (bis 14.11.2026)');
    expect(text.indexOf('TODONOTIZ')).toBeGreaterThan(text.indexOf('Kasse prüfen'));
    // A bullet of a list (marker "•") and no colored block; the notes get the second-level dot.
    expect(text).toContain('"•"');
    expect(text).not.toContain('borderLeftWidth');
    expect(text).not.toContain('marginLeft":15');
    expect(text.indexOf('"•"')).toBeLessThan(text.indexOf('Todo:'));
    expect(text.indexOf('"width":4,"height":4')).toBeGreaterThan(text.indexOf('Todo:'));
  });

  it('joins a bullet list in front: one list, the Todo is its last bullet', () => {
    const liste: ProtokollKnoten = {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Punkt' }] }],
        },
      ],
    };
    const text = json(mitInhalt([liste, todo]));
    // One "•" for the item and one for the Todo (the notes use the second-level dot).
    expect(text.split('"•"')).toHaveLength(3);
  });

  it('keeps the Todo out of the bookmarks', () => {
    const gegenwart = lesezeichen(blockBaum(pdfBloecke(mit))).find(
      (o) => o.titel === 'Gegenwärtiges',
    )!;
    expect(gegenwart.kinder.map((o) => o.titel)).toEqual(['Kasse']);
    expect(gegenwart.kinder[0]!.kinder).toEqual([]);
  });
});

describe('PDF: Bausteine in list items', () => {
  it('sets a Baustein and a quote of a list item inside the list, in order', () => {
    const punkt = (...kinder: ProtokollKnoten[]): ProtokollKnoten => ({
      type: 'listItem',
      content: kinder,
    });
    const mit: DokumentEingabe = {
      ...eingabe,
      inhalt: {
        ...eingabe.inhalt,
        content: [
          eingabe.inhalt.content[0]!,
          eingabe.inhalt.content[1]!,
          {
            ...eingabe.inhalt.content[2]!,
            content: [
              event('b', 'Superbowl', [
                {
                  type: 'bulletList',
                  content: [
                    punkt(text('Punkt A'), abstimmung, {
                      type: 'blockquote',
                      content: [text('Zitat im Punkt')],
                    }),
                    punkt(text('Punkt B')),
                  ],
                },
                { type: 'paragraph' },
              ]),
            ],
          },
        ],
      },
    };
    const json = JSON.stringify(
      pdfBloecke(mit).map((b) => b.element),
      (k, v: unknown) => (k === 'ctx' ? undefined : v),
    );
    const a = json.indexOf('Punkt A');
    expect(a).toBeGreaterThan(-1);
    expect(json.indexOf('Neuer Tresen', a)).toBeGreaterThan(a);
    expect(json.indexOf('Zitat im Punkt', a)).toBeGreaterThan(json.indexOf('Neuer Tresen', a));
    expect(json.indexOf('Punkt B')).toBeGreaterThan(json.indexOf('Zitat im Punkt'));
  });

  it('puts a Thema in a list item into the bookmarks, like the Gliederung of the document view', () => {
    const thema: ProtokollKnoten = {
      type: 'bausteinThema',
      attrs: { id: 'th', daten: { ...bausteinLeer('bausteinThema'), titel: 'ThemaImPunkt' } },
      content: [text('Inhalt'), { type: 'paragraph' }],
    };
    const mit: DokumentEingabe = {
      ...eingabe,
      inhalt: {
        ...eingabe.inhalt,
        content: [
          eingabe.inhalt.content[0]!,
          eingabe.inhalt.content[1]!,
          {
            ...eingabe.inhalt.content[2]!,
            content: [
              event('b', 'Superbowl', [
                {
                  type: 'bulletList',
                  content: [{ type: 'listItem', content: [text('Punkt A'), thema] }],
                },
                { type: 'paragraph' },
              ]),
            ],
          },
        ],
      },
    };
    const bloecke = pdfBloecke(mit);
    const outline = lesezeichen(blockBaum(bloecke));
    const gliederung = dokumentGliederungBauen(
      dokumentUeberschriften(mit.inhalt, (sub) => {
        const m = mit.teilnahme.find((x) => x.sub === sub);
        return m ? personName(m) : null;
      }).eintraege,
    );
    const alsTitel = (g: typeof gliederung): unknown[] =>
      g.map((k) => ({ titel: k.text, kinder: alsTitel(k.kinder) }));
    expect(outline).toEqual(alsTitel(gliederung));
    expect(JSON.stringify(outline)).toContain('ThemaImPunkt');
  });
});
