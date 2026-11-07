import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { protokollKopfLeer, type ProtokollKnoten } from '@c4/shared';
import { DokumentGliederung } from './DokumentGliederung';
import { ProtokollDokumentAnsicht } from './ProtokollDokumentAnsicht';
import type { DokumentEingabe } from './dokumentDaten';
import { meineErwaehnungen } from './erwaehnungLogik';

const t = (s: string): ProtokollKnoten => ({ type: 'text', text: s });
const erw = (attrs: Record<string, unknown>): ProtokollKnoten => ({ type: 'erwaehnung', attrs });
const absatz = (...kinder: ProtokollKnoten[]): ProtokollKnoten => ({
  type: 'paragraph',
  content: kinder,
});

const mitglied = (sub: string, username: string | null, status: 'mitglied' | 'extern' | 'em') => ({
  sub,
  username,
  vorname: 'Vor',
  nachname: sub,
  status,
});

const eingabe = (ich: DokumentEingabe['ich']): DokumentEingabe => ({
  inhalt: {
    type: 'doc',
    content: [
      {
        type: 'abschnitt',
        attrs: { art: 'vergangenes' },
        content: [
          {
            type: 'bausteinThema',
            attrs: { id: 'a', daten: { titel: 'Finanzen' } },
            content: [
              absatz(t('Kasse: '), erw({ art: 'person', sub: 'me' }), t(' kümmert sich')),
              absatz(erw({ art: 'person', sub: 'andere' }), t(' hilft')),
              absatz(erw({ art: 'person', sub: 'gast' }), t(' schaut zu')),
              absatz(t('Alle '), erw({ art: 'gruppe', gruppe: 'mitglieder' })),
              absatz(erw({ art: 'gruppe', gruppe: 'ems' })),
            ],
          },
        ],
      },
      { type: 'abschnitt', attrs: { art: 'gegenwaertiges' }, content: [{ type: 'paragraph' }] },
      { type: 'abschnitt', attrs: { art: 'zukuenftiges' }, content: [{ type: 'paragraph' }] },
    ],
  },
  kopf: protokollKopfLeer(),
  teilnahme: [],
  ems: [],
  mitglieder: [
    mitglied('me', 'ich', 'mitglied'),
    mitglied('andere', 'anderer', 'mitglied'),
    mitglied('gast', 'gast', 'extern'),
  ],
  ich,
  sitzung: { titel: 'Clubsitzung', beginn: '2024-01-30T19:00:00Z', art: 'sitzung' },
});

const render = (e: DokumentEingabe) =>
  renderToStaticMarkup(
    <MantineProvider>
      <MemoryRouter>
        <ProtokollDokumentAnsicht eingabe={e} />
      </MemoryRouter>
    </MantineProvider>,
  );

const markiert = (html: string) =>
  [...html.matchAll(/<mark class="pk-dok-erw-ich"[^>]*>(.*?)<\/mark>/g)].map((m) =>
    m[1]!.replace(/<[^>]+>/g, ''),
  );

describe('Erwähnungen in the document view', () => {
  it('highlights what concerns me (person and my group), not the others', () => {
    const html = render(eingabe({ sub: 'me', status: 'mitglied' }));
    expect(markiert(html)).toEqual(['@ich', '@Mitglieder']);
    // anchors for the overview
    expect(html).toContain('id="dok-erw-0"');
    expect(html).toContain('id="dok-erw-1"');
    // others are shown, linked to the member page, but not marked
    expect(html).toContain('href="/mitglieder/anderer"');
    expect(html).toContain('@anderer');
    expect(html).toContain('href="/mitglieder/gast"');
    expect(html).toContain('@EMs');
    expect(markiert(html)).not.toContain('@anderer');
    expect(markiert(html)).not.toContain('@EMs');
  });

  it('highlights a group by the current status', () => {
    const html = render(eingabe({ sub: 'other', status: 'em' }));
    expect(markiert(html)).toEqual(['@EMs']);
  });

  it('marks nothing without a viewer', () => {
    const html = render(eingabe(null));
    expect(html).not.toContain('pk-dok-erw-ich');
    expect(html).toContain('@ich');
    expect(html).not.toContain('Meine Erwähnungen');
  });
});

describe('DokumentGliederung overview', () => {
  it('lists the entries as buttons', () => {
    const e = eingabe({ sub: 'me', status: 'mitglied' });
    const meine = meineErwaehnungen(e.inhalt, e.ich, (s) => (s === 'me' ? 'ich' : null));
    const html = renderToStaticMarkup(
      <MantineProvider>
        <DokumentGliederung eintraege={[]} erwaehnungen={meine.eintraege} />
      </MantineProvider>,
    );
    expect(html).toContain('Meine Erwähnungen');
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('Finanzen');
    expect(html).toContain('Kasse: @ich kümmert sich');
    expect(html).toContain('Alle @Mitglieder');
  });

  it('says so when nobody mentions me', () => {
    const e = eingabe({ sub: 'fremd', status: 'extern' });
    const meine = meineErwaehnungen(e.inhalt, e.ich, () => null);
    expect(meine.eintraege).toEqual([]);
    const html = renderToStaticMarkup(
      <MantineProvider>
        <DokumentGliederung eintraege={[]} erwaehnungen={meine.eintraege} />
      </MantineProvider>,
    );
    expect(html).toContain('Du wirst in diesem Protokoll nicht erwähnt.');
    expect(html).not.toContain('<button');
    expect(render(e)).not.toContain('pk-dok-erw-ich');
  });

  it('leaves the overview out without a viewer', () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <DokumentGliederung eintraege={[]} />
      </MantineProvider>,
    );
    expect(html).not.toContain('Meine Erwähnungen');
  });
});

describe('Event lead in the document view', () => {
  const mitLeitung = (ich: DokumentEingabe['ich']): DokumentEingabe => {
    const e = eingabe(ich);
    const abschnitte = e.inhalt.content!;
    abschnitte[2] = {
      type: 'abschnitt',
      attrs: { art: 'zukuenftiges' },
      content: [
        {
          type: 'bausteinEvent',
          attrs: {
            id: 'ev',
            daten: {
              vorlageId: null,
              name: 'Superbowl',
              datum: '2024-02-11',
              bisDatum: null,
              beginnZeit: null,
              endeZeit: null,
              schichten: [],
              verantwortlichSub: 'me',
              eventId: null,
            },
          },
          content: [{ type: 'paragraph' }],
        },
      ],
    };
    return e;
  };

  it('highlights the lead name without "@" when it is the viewer', () => {
    const html = render(mitLeitung({ sub: 'me', status: 'mitglied' }));
    expect(html).toContain('data-testid="erwaehnung-ich"');
    expect(markiert(html)).toContain('ich');
    expect(html).not.toContain('@ich</mark>');
    expect(html).toContain('Verantwortlich:');
    expect(html).not.toMatch(/Verantwortlich:\s*(<!-- -->)?\s*@/);
  });

  it('does not highlight the lead for someone else', () => {
    const html = render(mitLeitung({ sub: 'andere', status: 'mitglied' }));
    expect(markiert(html)).not.toContain('ich');
    expect(html).not.toContain('Verantwortlich: @');
  });
});
