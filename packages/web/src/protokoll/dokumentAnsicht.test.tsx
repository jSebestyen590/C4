import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { protokollKopfLeer, type ProtokollKnoten } from '@c4/shared';
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
});
