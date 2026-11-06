import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bausteinLeer, protokollKopfLeer, type ProtokollKnoten } from '@c4/shared';
import { WiederholungHinweis } from './WiederholungHinweis';
import { ProtokollDokumentAnsicht } from './ProtokollDokumentAnsicht';
import type { DokumentEingabe } from './dokumentDaten';

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
    expect(html).toMatch(/<ul><li>Verantwortlich: @<span[^>]*>Niklas<\/span><\/li><li><p>notes/);
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
    expect(html).toContain('<strong>Abstimmung:</strong> Neuer Tresen');
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
    expect(offen).toContain('<strong>Wahl:</strong> Finanzen (2 Plätze)');
    expect(offen).toContain('Kandidat:innen: Anna 5 · Bea 3 · Cem 3 · Enthaltung 1');
    expect(offen).toContain('Noch offen: Stichwahl nötig');
    expect(offen).not.toContain('Gewählt:');
    expect(offen).not.toContain('Gilt ab');
    expect(offen).toContain('Wahlnotiz');
    expect(render(wahl('w3', [], { postenId: 'p1', gueltigAb: '2027-01-01' }))).toContain(
      'Gilt ab 01.01.2027',
    );
    const fertig = render(wahl('w2', [{ stimmen: { b: 1, c: 4 }, enthaltung: 2 }]));
    expect(fertig).toContain('Stichwahl: Bea 1 · Cem 4 · Enthaltung 2');
    expect(fertig).toContain('Gewählt: Anna, Cem');
    expect(fertig).toContain('(1 von 1 Mitgliedern anwesend)');
    expect(fertig).not.toContain('Noch offen');
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
    const satz = 'Die nächste Sitzung findet am Dienstag, 13.02.2024 um 20:00 Uhr statt.';
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
