import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup as rendern } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { bausteinLeer, protokollKopfLeer, type ProtokollKnoten } from '@c4/shared';
import { WiederholungHinweis } from './WiederholungHinweis';
import { ProtokollDokumentAnsicht } from './ProtokollDokumentAnsicht';
import type { DokumentEingabe } from './dokumentDaten';

/** The scroll anchors (`data-id`) for the preview jump are not part of what is compared. */
const renderToStaticMarkup = (el: ReactElement): string =>
  rendern(el)
    .replace(/<span data-id="[^"]*"[^>]*><\/span>/g, '')
    .replace(/ data-id="[^"]*"/g, '');

const text = (t: string): ProtokollKnoten => ({
  type: 'paragraph',
  content: [{ type: 'text', text: t }],
});
const liste = (...t: string[]): ProtokollKnoten => ({
  type: 'bulletList',
  content: t.map((x) => ({ type: 'listItem', content: [text(x)] })),
});

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
            ],
          },
          { type: 'paragraph' },
        ],
      },
      { type: 'abschnitt', attrs: { art: 'gegenwaertiges' }, content: [{ type: 'paragraph' }] },
      {
        type: 'abschnitt',
        attrs: { art: 'zukuenftiges' },
        content: [
          {
            type: 'bausteinEvent',
            attrs: {
              id: 'b',
              daten: {
                vorlageId: null,
                name: 'Superbowl',
                datum: '2024-02-11',
                bisDatum: null,
                beginnZeit: null,
                endeZeit: null,
                schichten: [],
                verantwortlichSub: '1',
                eventId: null,
              },
            },
            content: [liste('notes'), { type: 'paragraph' }],
          },
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

describe('ProtokollDokumentAnsicht', () => {
  it('renders title, opening, sections and merged Verantwortlich item', () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ProtokollDokumentAnsicht eingabe={eingabe} />
      </MantineProvider>,
    );
    expect(html).toContain('Clubsitzung 30.01.2024');
    expect(html).toContain('eröffnet die Sitzung um 20:04 Uhr.');
    expect(html).toContain('Beschlussfähigkeit: 1 von 1 Mitgliedern anwesend');
    expect(html).toContain('>Vergangenes<');
    expect(html).toContain('27.12. Weihnachtsöffnung');
    expect(html).toContain('<p class="pk-dok-quelle">– Strobi</p>');
    // Verantwortlich is the first item of the existing bullet list
    expect(html).toMatch(/<ul><li>Verantwortlich: <span[^>]*>Niklas<\/span><\/li><li><p>notes/);
  });

  it('renders Abstimmung, Meinungsbild and Aufnahme, also inside the notes of an Event', () => {
    const abstimmung: ProtokollKnoten = {
      type: 'bausteinBeschluss',
      attrs: {
        id: 'x1',
        daten: { antrag: 'Neuer Tresen', ja: 1, nein: 0, enthaltung: 0, ergebnis: 'angenommen' },
      },
      content: [text('Notiz zur Abstimmung')],
    };
    const meinung: ProtokollKnoten = {
      type: 'bausteinMeinungsbild',
      attrs: {
        id: 'x2',
        daten: {
          frage: 'Ernst oder Spaß?',
          optionen: [
            { text: 'Ernst', stimmen: 4 },
            { text: '', stimmen: 1 },
            { text: 'Spaß', stimmen: 3 },
          ],
        },
      },
      content: [{ type: 'paragraph' }],
    };
    const aufnahme: ProtokollKnoten = {
      type: 'bausteinAufnahme',
      attrs: {
        id: 'x3',
        daten: {
          sub: null,
          name: 'Max Neu',
          abstimmung: { ja: 1, nein: 0, enthaltung: 0, ergebnis: 'angenommen' },
        },
      },
      content: [text('Herzlich willkommen')],
    };
    const [vergangenes, gegenwaertiges, zukuenftiges] = eingabe.inhalt.content;
    const event = zukuenftiges!.content![0]!;
    const mit: DokumentEingabe = {
      ...eingabe,
      inhalt: {
        type: 'doc',
        content: [
          vergangenes!,
          { ...gegenwaertiges!, content: [aufnahme, abstimmung, { type: 'paragraph' }] },
          {
            ...zukuenftiges!,
            content: [{ ...event, content: [liste('notes'), meinung, { type: 'paragraph' }] }],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ProtokollDokumentAnsicht eingabe={mit} />
      </MantineProvider>,
    );
    // Top level: own heading, no "Abstimmung:" line in the box.
    expect(html).toContain('<div class="pk-dok-h2">Abstimmung: Neuer Tresen</div>');
    expect(html).not.toContain('<strong>Abstimmung:</strong> Neuer Tresen');
    expect(html).not.toContain('Beschluss:');
    expect(html).toContain('Ja 1 · Nein 0 · Enthaltung 0 – angenommen');
    expect(html).toContain('(1 von 1 Mitgliedern anwesend)');
    expect(html).toContain('Aufnahme: Max Neu');
    expect(html).toContain('Herzlich willkommen');
    // Nested Meinungsbild: inside the Event's notes, indented, options without a text skipped.
    expect(html).toContain('<div class="pk-dok-innen"><div class="pk-dok-beschluss">');
    expect(html).toContain('<strong>Meinungsbild:</strong> Ernst oder Spaß?');
    expect(html).toContain('Ernst 4 · Spaß 3');
    expect(html).toContain('(nicht bindend)');
    expect(html.indexOf('notes')).toBeLessThan(html.indexOf('Meinungsbild:'));
  });

  it('renders a Baustein, a quote and erscheint / geht inside a list item through the normal renderers', () => {
    const abstimmung: ProtokollKnoten = {
      type: 'bausteinBeschluss',
      attrs: {
        id: 'li1',
        daten: { antrag: 'Neuer Tresen', ja: 1, nein: 0, enthaltung: 0, ergebnis: 'angenommen' },
      },
      content: [text('Notiz zur Abstimmung')],
    };
    const erscheint: ProtokollKnoten = {
      type: 'bausteinAnwesenheit',
      attrs: { id: 'li2', daten: { art: 'erscheint', sub: '1', uhrzeit: '20:15' } },
    };
    const punkt = (...kinder: ProtokollKnoten[]): ProtokollKnoten => ({
      type: 'listItem',
      content: kinder,
    });
    const [vergangenes, gegenwaertiges, zukuenftiges] = eingabe.inhalt.content;
    const event = zukuenftiges!.content![0]!;
    const mit: DokumentEingabe = {
      ...eingabe,
      inhalt: {
        type: 'doc',
        content: [
          vergangenes!,
          gegenwaertiges!,
          {
            ...zukuenftiges!,
            content: [
              {
                ...event,
                content: [
                  {
                    type: 'bulletList',
                    content: [
                      punkt(
                        text('Notiz 1'),
                        {
                          type: 'bulletList',
                          content: [
                            punkt(text('Unter 1'), abstimmung, erscheint),
                            punkt(text('Unter 2')),
                          ],
                        },
                        { type: 'blockquote', content: [text('Zitat im Punkt')] },
                      ),
                      punkt(text('Notiz 2')),
                    ],
                  },
                  { type: 'paragraph' },
                ],
              },
            ],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ProtokollDokumentAnsicht eingabe={mit} />
      </MantineProvider>,
    );
    // The Abstimmung and the arrival sit in the item "Unter 1", the following items stay.
    expect(html).toMatch(
      /<li><p>Unter 1<\/p>.*Neuer Tresen.*pk-dok-anwesenheit.*<\/li><li><p>Unter 2/,
    );
    expect(html).toMatch(/<blockquote><p>Zitat im Punkt<\/p><\/blockquote><\/li><li><p>Notiz 2/);
  });

  it('never shows empty list items and shows a block-only item without bullet', () => {
    const leer = (): ProtokollKnoten => ({ type: 'listItem', content: [{ type: 'paragraph' }] });
    const [vergangenes, gegenwaertiges, zukuenftiges] = eingabe.inhalt.content;
    const event = zukuenftiges!.content![0]!;
    const mit: DokumentEingabe = {
      ...eingabe,
      inhalt: {
        type: 'doc',
        content: [
          vergangenes!,
          gegenwaertiges!,
          {
            ...zukuenftiges!,
            content: [
              {
                ...event,
                content: [
                  {
                    type: 'bulletList',
                    content: [
                      { type: 'listItem', content: [text('Eins')] },
                      leer(),
                      {
                        type: 'listItem',
                        content: [
                          text('Zwei'),
                          {
                            type: 'bulletList',
                            content: [
                              {
                                type: 'listItem',
                                content: [
                                  { type: 'paragraph' },
                                  { type: 'blockquote', content: [text('Zitat unten')] },
                                ],
                              },
                              leer(),
                            ],
                          },
                        ],
                      },
                      leer(),
                    ],
                  },
                  { type: 'paragraph' },
                ],
              },
            ],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ProtokollDokumentAnsicht eingabe={mit} />
      </MantineProvider>,
    );
    // The block-only item has no bullet, the empty items are not shown at all.
    expect(html).toContain('<li class="pk-dok-ohne-punkt"><blockquote>');
    expect(html).not.toContain('<li></li>');
    expect(html).not.toMatch(/<li><p><\/p>/);
  });

  it('renders a Todo as a bullet of the notes it stands in, its notes one level deeper, marked for me', () => {
    const todo = (id: string, daten: Record<string, unknown>, content: ProtokollKnoten[]) =>
      ({
        type: 'bausteinTodo',
        attrs: {
          id,
          daten: { ...bausteinLeer('bausteinTodo'), faelligAm: '2026-11-14', ...daten },
        },
        content,
      }) as ProtokollKnoten;
    const nachListe = todo(
      't1',
      {
        titel: 'Kasse prüfen',
        zustaendig: [
          { art: 'person', sub: '1' },
          { art: 'gruppe', gruppe: 'alle' },
        ],
      },
      [liste('TODONOTIZ'), text('ABSATZNOTIZ'), { type: 'paragraph' }],
    );
    const nachAbsatz = todo('t2', { titel: 'Putzen', faelligAm: null }, [{ type: 'paragraph' }]);
    const zweites = todo('t3', { titel: 'Nur Titel', faelligAm: null }, [{ type: 'paragraph' }]);
    const [vergangenes, gegenwaertiges, zukuenftiges] = eingabe.inhalt.content;
    const event = zukuenftiges!.content![0]!;
    const mit: DokumentEingabe = {
      ...eingabe,
      ich: { sub: '1', status: 'mitglied' },
      inhalt: {
        type: 'doc',
        content: [
          vergangenes!,
          { ...gegenwaertiges!, content: [{ type: 'paragraph' }] },
          {
            ...zukuenftiges!,
            content: [
              {
                ...event,
                content: [
                  liste('notes'),
                  nachListe,
                  zweites,
                  text('danach'),
                  nachAbsatz,
                  { type: 'paragraph' },
                ],
              },
            ],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ProtokollDokumentAnsicht eingabe={mit} />
      </MantineProvider>,
    );
    // Behind a bullet list (here with the Verantwortlich line) the Todos are further items of that very list, no box.
    expect(html).toMatch(
      /<li><p>notes<\/p><\/li><li><strong>Todo:<\/strong> Kasse prüfen – .*? \(bis 14\.11\.2026\)<ul>/,
    );
    expect(html).toContain('<li><strong>Todo:</strong> Nur Titel</li></ul>');
    expect(html).toContain('@Alle');
    // The notes of the Todo are bullets one level deeper.
    expect(html).toMatch(/<ul><li><p>TODONOTIZ<\/p><\/li><li>ABSATZNOTIZ<\/li><\/ul><\/li>/);
    // Behind a paragraph the Todo opens a list of its own.
    expect(html).toMatch(/<p>danach<\/p><ul><li><strong>Todo:<\/strong> Putzen<\/li><\/ul>/);
    // The highlighter on my name or group is the only emphasis; the first one carries the anchor.
    expect(html).toContain('<mark class="pk-dok-erw-ich"');
    expect(html).toContain('data-testid="erwaehnung-ich"');
    expect(html).not.toContain('pk-dok-beschluss"><p><strong>Todo');
    expect(html).not.toMatch(/<h\d[^>]*>[^<]*Todo/);
  });

  it('renders a Wahl with runoff, result and quorum, also an open tie', () => {
    const wahl = (id: string, stichwahlen: unknown[], extra = {}): ProtokollKnoten => ({
      type: 'bausteinWahl',
      attrs: {
        id,
        daten: {
          posten: 'Finanzen',
          anzahl: 2,
          kandidaten: [
            { id: 'a', sub: null, name: 'Anna', stimmen: 5 },
            { id: 'b', sub: null, name: 'Bea', stimmen: 3 },
            { id: 'c', sub: null, name: 'Cem', stimmen: 3 },
          ],
          enthaltung: 1,
          stichwahlen,
          ...extra,
        },
      },
      content: [text('Wahlnotiz')],
    });
    const [vergangenes, gegenwaertiges, zukuenftiges] = eingabe.inhalt.content;
    const render = (...bloecke: ProtokollKnoten[]) =>
      renderToStaticMarkup(
        <MantineProvider>
          <ProtokollDokumentAnsicht
            eingabe={{
              ...eingabe,
              inhalt: {
                type: 'doc',
                content: [
                  vergangenes!,
                  { ...gegenwaertiges!, content: [...bloecke, { type: 'paragraph' }] },
                  zukuenftiges!,
                ],
              },
            }}
          />
        </MantineProvider>,
      );
    const offen = render(wahl('w1', []));
    expect(offen).toContain('<div class="pk-dok-h2">Wahl: Finanzen (2 Plätze)</div>');
    expect(offen).not.toContain('<strong>Wahl:</strong>');
    expect(offen).toContain('Kandidat:innen: Anna 5 · Bea 3 · Cem 3 · Enthaltung 1');
    expect(offen).toContain('Noch offen: Stichwahl nötig');
    expect(offen).not.toContain('Gewählt:');
    expect(offen).not.toContain('Gilt ab');
    expect(offen).toContain('Wahlnotiz');
    // The notes are the discussion before: heading, notes, then the result box.
    expect(offen.indexOf('Wahl: Finanzen (2 Plätze)')).toBeLessThan(offen.indexOf('Wahlnotiz'));
    expect(offen.indexOf('Wahlnotiz')).toBeLessThan(offen.indexOf('Kandidat:innen:'));
    expect(render(wahl('w3', [], { postenId: 'p1', gueltigAb: '2027-01-01' }))).toContain(
      'Gilt ab 01.01.2027',
    );
    const fertig = render(wahl('w2', [{ stimmen: { b: 1, c: 4 }, enthaltung: 2 }]));
    expect(fertig).toContain('Stichwahl: Bea 1 · Cem 4 · Enthaltung 2');
    expect(fertig).toContain('Gewählt: Anna, Cem');
    expect(fertig).toContain('(1 von 1 Mitgliedern anwesend)');
    expect(fertig).not.toContain('Noch offen');
    const abgesagt = render(
      wahl('w4', [{ stimmen: { b: 1, c: 4 }, enthaltung: 2 }], {
        nichtAngetreten: ['1'],
        annahme: { c: false },
      }),
    );
    expect(abgesagt).toContain('Nicht angetreten: ');
    expect(abgesagt).toContain('Niklas');
    // Vote order: Anna (5), Cem (runoff, declined), Bea.
    expect(abgesagt).toMatch(
      /Gewählt: Anna, Anna nimmt die Wahl an\.<\/p><p>Cem nimmt die Wahl nicht an\.<\/p><p>Gewählt: Bea, Bea nimmt die Wahl an\./,
    );
    expect(fertig).not.toContain('Nicht angetreten');
    expect(fertig).not.toContain('nimmt die Wahl nicht an');
  });

  it('renders an Auswahl titled like an Abstimmung: notes, then options, runoff and result', () => {
    const auswahl = (id: string, stichwahlen: unknown[], extra = {}): ProtokollKnoten => ({
      type: 'bausteinAuswahl',
      attrs: {
        id,
        daten: {
          ...bausteinLeer('bausteinAuswahl'),
          frage: 'Wohin geht der Ausflug?',
          anzahl: 2,
          optionen: [
            { id: 'a', text: 'Berlin', stimmen: 5 },
            { id: 'b', text: 'Dresden', stimmen: 3 },
            { id: 'c', text: '', stimmen: 3 },
          ],
          enthaltung: 1,
          stichwahlen,
          ...extra,
        },
      },
      content: [text('Auswahlnotiz')],
    });
    const [vergangenes, gegenwaertiges, zukuenftiges] = eingabe.inhalt.content;
    const render = (...bloecke: ProtokollKnoten[]) =>
      renderToStaticMarkup(
        <MantineProvider>
          <ProtokollDokumentAnsicht
            eingabe={{
              ...eingabe,
              inhalt: {
                type: 'doc',
                content: [
                  vergangenes!,
                  { ...gegenwaertiges!, content: [...bloecke, { type: 'paragraph' }] },
                  zukuenftiges!,
                ],
              },
            }}
          />
        </MantineProvider>,
      );
    const offen = render(auswahl('x1', []));
    expect(offen).toContain('<div class="pk-dok-h2">Abstimmung: Wohin geht der Ausflug?</div>');
    expect(offen).toContain('Möglichkeiten: Berlin 5 · Dresden 3 · – 3 · Enthaltung 1');
    expect(offen).toContain('Noch offen: Stichwahl nötig');
    expect(offen).not.toContain('Ergebnis:');
    expect(offen.indexOf('Abstimmung: Wohin')).toBeLessThan(offen.indexOf('Auswahlnotiz'));
    expect(offen.indexOf('Auswahlnotiz')).toBeLessThan(offen.indexOf('Möglichkeiten:'));
    const fertig = render(auswahl('x2', [{ stimmen: { b: 1, c: 4 }, enthaltung: 2 }]));
    expect(fertig).toContain('Stichwahl: Dresden 1 · – 4 · Enthaltung 2');
    expect(fertig).toContain('Ergebnis: Berlin, –');
    expect(fertig).toContain('(1 von 1 Mitgliedern anwesend)');
    expect(fertig).not.toContain('Noch offen');
    // Nested in a Thema: no heading of its own, the question stands in the box.
    const innen = render({
      type: 'bausteinThema',
      attrs: { id: 't1', daten: { titel: 'Ausflug' } },
      content: [text('Themennotiz'), auswahl('x3', [])],
    });
    expect(innen).toContain('<strong>Abstimmung:</strong> Wohin geht der Ausflug?');
    expect(innen).not.toContain('<div class="pk-dok-h3">Abstimmung');
  });

  it('puts the notes of a nested Wahl before its box inside a Thema', () => {
    const [vergangenes, gegenwaertiges, zukuenftiges] = eingabe.inhalt.content;
    const wahl: ProtokollKnoten = {
      type: 'bausteinWahl',
      attrs: {
        id: 'w1',
        daten: {
          posten: 'Kasse',
          anzahl: 1,
          kandidaten: [{ id: 'a', sub: null, name: 'Anna', stimmen: 2 }],
          enthaltung: 0,
          stichwahlen: [],
        },
      },
      content: [text('Wahldiskussion')],
    };
    const thema: ProtokollKnoten = {
      type: 'bausteinThema',
      attrs: { id: 't1', daten: { titel: 'Vorstand' } },
      content: [text('Themennotiz'), wahl],
    };
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ProtokollDokumentAnsicht
          eingabe={{
            ...eingabe,
            inhalt: {
              type: 'doc',
              content: [
                vergangenes!,
                { ...gegenwaertiges!, content: [thema, { type: 'paragraph' }] },
                zukuenftiges!,
              ],
            },
          }}
        />
      </MantineProvider>,
    );
    expect(html).toContain('>Vorstand</h3>');
    const i = (s: string) => html.indexOf(s);
    expect(i('Themennotiz')).toBeLessThan(i('Wahldiskussion'));
    expect(i('Wahldiskussion')).toBeLessThan(i('<strong>Wahl:</strong>'));
    expect(i('<strong>Wahl:</strong>')).toBeLessThan(i('Kandidat:innen: Anna 2'));
  });

  it('shows Sonstiges only with content and ends with the next Sitzung', () => {
    const render = (e: DokumentEingabe) =>
      renderToStaticMarkup(
        <MantineProvider>
          <ProtokollDokumentAnsicht eingabe={e} />
        </MantineProvider>,
      );
    const sonstiges = (content: ProtokollKnoten[]): ProtokollKnoten => ({
      type: 'abschnitt',
      attrs: { art: 'sonstiges' },
      content,
    });
    const mit = (a: ProtokollKnoten, extra: Partial<DokumentEingabe> = {}): DokumentEingabe => ({
      ...eingabe,
      ...extra,
      inhalt: { type: 'doc', content: [...eingabe.inhalt.content, a] },
    });

    const leer = render(mit(sonstiges([{ type: 'paragraph' }])));
    expect(leer).not.toContain('Sonstiges');
    expect(leer).not.toContain('Die nächste Sitzung');
    // An old document with three sections renders, too.
    expect(render(eingabe)).not.toContain('Sonstiges');

    const voll = render(
      mit(sonstiges([text('Grillen im Sommer'), { type: 'paragraph' }]), {
        naechsteSitzungVorschlag: {
          eventId: 'e9',
          titel: 'Sitzung',
          beginn: '2024-02-13T19:00:00.000Z',
        },
      }),
    );
    expect(voll).toContain('>Sonstiges<');
    expect(voll).toContain('Grillen im Sommer');
    const satz =
      'Die nächste Sitzung findet statt am <strong>Dienstag, 13.02.2024 um 20:00 Uhr im C4</strong>.';
    expect(voll).toContain(satz);
    expect(voll.indexOf(satz)).toBeGreaterThan(voll.indexOf('Grillen im Sommer'));
  });
});

describe('Wiederholung einer Abstimmung', () => {
  const wiederholung = { datum: '2026-11-05', sitzung: 'Test Sitzung' };
  const knoten = (type: string, daten: object): ProtokollKnoten => ({
    type,
    attrs: { id: type, daten },
    content: [{ type: 'paragraph' }],
  });
  const stimmen = { ja: 0, nein: 0, enthaltung: 0, ergebnis: null };

  describe('usability round', () => {
    const roh = (e: DokumentEingabe): string =>
      rendern(
        <MantineProvider>
          <ProtokollDokumentAnsicht eingabe={e} />
        </MantineProvider>,
      );
    const mitInhalt = (
      inhalt: ProtokollKnoten[],
      kopf: Partial<DokumentEingabe['kopf']> = {},
    ): DokumentEingabe => ({
      ...eingabe,
      kopf: { ...eingabe.kopf, ...kopf },
      inhalt: {
        type: 'doc',
        content: [
          {
            type: 'abschnitt',
            attrs: { art: 'vergangenes' },
            content: [...inhalt, { type: 'paragraph' }],
          },
          { type: 'abschnitt', attrs: { art: 'gegenwaertiges' }, content: [{ type: 'paragraph' }] },
          { type: 'abschnitt', attrs: { art: 'zukuenftiges' }, content: [{ type: 'paragraph' }] },
        ],
      },
    });
    const anwesenheit = (id: string, art: string, uhrzeit: string, daten: object) => ({
      type: 'bausteinAnwesenheit',
      attrs: { id, daten: { art, uhrzeit, sub: null, name: '', ...daten } },
    });

    it('lists EM chips and guests with their times; externals are plain text', () => {
      const html = roh(
        mitInhalt([anwesenheit('x1', 'erscheint', '19:30', { name: 'Ralle' })], {
          emsFreitext: ['Anna'],
          gaeste: ['Ralle', 'Bob'],
        }),
      );
      expect(html).toContain('Gäste:');
      expect(html).toContain('Ralle (ab 19:30 Uhr), Bob');
      expect(html).toContain('Anna');
      expect(html).toContain('Ralle erscheint um 19:30 Uhr.');
    });

    it('renders the inline quote in quotation marks, also across several text nodes', () => {
      const html = roh(
        mitInhalt([
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Er sagte ' },
              { type: 'text', text: 'ganz ', marks: [{ type: 'zitatInline' }] },
              { type: 'text', text: 'leise', marks: [{ type: 'zitatInline' }, { type: 'bold' }] },
            ],
          },
        ]),
      );
      expect(html).toContain('„');
      expect(html.match(/„/g)).toHaveLength(1);
      expect(html.match(/“/g)).toHaveLength(1);
    });

    it('leaves a Merker out of the document', () => {
      const html = roh(
        mitInhalt([
          {
            type: 'bausteinMerker',
            attrs: { id: 'm1', daten: {} },
            content: [text('Datum prüfen')],
          },
        ]),
      );
      expect(html).not.toContain('Datum prüfen');
    });

    it('ends with the end of the Sitzung, only when it is set', () => {
      expect(roh(mitInhalt([]))).not.toContain('beendet die Sitzung');
      const html = roh(mitInhalt([], { ende: '22:10' }));
      expect(html).toContain('beendet die Sitzung um 22:10 Uhr.');
      expect(html).toContain('data-testid="sitzung-ende"');
      const ohneLeitung = roh(mitInhalt([], { ende: '22:10', sitzungsleitung: null }));
      expect(ohneLeitung).toContain('Die Sitzung endet um 22:10 Uhr.');
    });

    it('gives every Baustein a data-id for the preview jump', () => {
      const html = roh(eingabe);
      expect(html).toContain('data-id="a"');
      expect(html).toContain('data-id="b"');
      expect(html).toContain('data-id="abschnitt:vergangenes"');
    });
  });

  it('shows the hint in the document for every kind of vote', () => {
    const [vergangenes, gegenwaertiges, zukuenftiges] = eingabe.inhalt.content;
    const mit: DokumentEingabe = {
      ...eingabe,
      inhalt: {
        type: 'doc',
        content: [
          vergangenes!,
          {
            ...gegenwaertiges!,
            content: [
              knoten('bausteinBeschluss', { antrag: 'Bier', ...stimmen, wiederholung }),
              knoten('bausteinAufnahme', {
                sub: null,
                name: 'Max',
                abstimmung: stimmen,
                wiederholung,
              }),
              knoten('bausteinWahl', {
                ...bausteinLeer('bausteinWahl'),
                posten: 'Kasse',
                wiederholung,
              }),
              knoten('bausteinEm', { sub: null, name: 'Ede', abstimmung: stimmen, wiederholung }),
              { type: 'paragraph' },
            ],
          },
          zukuenftiges!,
        ],
      },
    };
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ProtokollDokumentAnsicht eingabe={mit} />
      </MantineProvider>,
    );
    const hinweis = (art: string) =>
      `Wiederholung der ${art} vom 05.11.2026 (Test Sitzung), damals nicht beschlussfähig.`;
    expect(html).toContain(hinweis('Abstimmung'));
    expect(html).toContain(hinweis('Aufnahme-Abstimmung'));
    expect(html).toContain(hinweis('Wahl'));
    expect(html.split(hinweis('Abstimmung'))).toHaveLength(3); // Abstimmung and Neues EM
  });

  it('shows no hint for an ordinary vote', () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ProtokollDokumentAnsicht eingabe={eingabe} />
      </MantineProvider>,
    );
    expect(html).not.toContain('Wiederholung der');
  });

  it('shows the hint in the editor forms', () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <WiederholungHinweis art="Wahl" wiederholung={wiederholung} />
        <WiederholungHinweis art="Wahl" wiederholung={null} />
      </MantineProvider>,
    );
    expect(html).toContain(
      'Wiederholung der Wahl vom 05.11.2026 (Test Sitzung), damals nicht beschlussfähig.',
    );
    expect(html.split('data-testid="wiederholung-hinweis"')).toHaveLength(2);
  });
});
