import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { protokollKopfLeer, type ProtokollDokument, type ProtokollKnoten } from '@c4/shared';
import { DokumentGliederung } from './DokumentGliederung';
import { dokumentGliederungBauen, dokumentUeberschriften } from './dokumentUeberschriften';
import { ProtokollDokumentAnsicht } from './ProtokollDokumentAnsicht';
import type { DokumentEingabe } from './dokumentDaten';

const text = (t: string): ProtokollKnoten => ({
  type: 'paragraph',
  content: [{ type: 'text', text: t }],
});
const ueberschrift = (level: number, t: string): ProtokollKnoten => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text: t }],
});
const abschnitt = (art: string, ...content: ProtokollKnoten[]): ProtokollKnoten => ({
  type: 'abschnitt',
  attrs: { art },
  content: [...content, { type: 'paragraph' }],
});
const vergangenes: ProtokollKnoten = {
  type: 'bausteinVergangenesEvent',
  attrs: { id: 'a', daten: { eventId: null, name: 'Weihnachtsöffnung', datum: '2023-12-27' } },
  content: [ueberschrift(3, 'Fazit'), { type: 'paragraph' }],
};
const abstimmung: ProtokollKnoten = {
  type: 'bausteinBeschluss',
  attrs: {
    id: 'v',
    daten: { antrag: 'Neuer Tresen', ja: 1, nein: 0, enthaltung: 0, ergebnis: null },
  },
  content: [{ type: 'paragraph' }],
};
const erscheint: ProtokollKnoten = {
  type: 'bausteinAnwesenheit',
  attrs: { id: 'e', daten: { art: 'erscheint', sub: '1', uhrzeit: '21:00' } },
};
const aufnahme: ProtokollKnoten = {
  type: 'bausteinAufnahme',
  attrs: {
    id: 'au',
    daten: {
      sub: null,
      name: 'Max Neu',
      abstimmung: { ja: 1, nein: 0, enthaltung: 0, ergebnis: 'angenommen' },
    },
  },
  content: [{ type: 'paragraph' }],
};

const inhalt: ProtokollDokument = {
  type: 'doc',
  content: [
    abschnitt('vergangenes', vergangenes),
    abschnitt('gegenwaertiges', ueberschrift(2, 'Finanzen'), abstimmung, erscheint, aufnahme),
    abschnitt('zukuenftiges', text('nur Text')),
    { type: 'abschnitt', attrs: { art: 'sonstiges' }, content: [{ type: 'paragraph' }] },
  ],
} as ProtokollDokument;

const eingabe: DokumentEingabe = {
  inhalt,
  kopf: protokollKopfLeer(),
  teilnahme: [],
  ems: [],
  sitzung: { titel: 'Clubsitzung', beginn: '2024-01-30T19:00:00Z', art: 'sitzung' },
};

describe('dokumentUeberschriften', () => {
  const { eintraege, ids } = dokumentUeberschriften(inhalt, () => null);

  it('lists sections, Baustein headings and typed headings, but no votes or attendance', () => {
    expect(eintraege.map((e) => [e.ebene, e.text])).toEqual([
      [1, 'Vergangenes'],
      [2, '27.12. Weihnachtsöffnung'],
      [4, 'Fazit'],
      [1, 'Gegenwärtiges'],
      [2, 'Finanzen'],
      [2, 'Aufnahme: Max Neu'],
      [1, 'Zukünftiges'],
    ]);
    expect(ids.has(abstimmung)).toBe(false);
  });

  it('gives unique ids and omits an empty Sonstiges', () => {
    expect(new Set(eintraege.map((e) => e.id)).size).toBe(eintraege.length);
    expect(eintraege.some((e) => e.text === 'Sonstiges')).toBe(false);
  });

  it('nests by level', () => {
    const baum = dokumentGliederungBauen(eintraege);
    expect(baum.map((b) => b.text)).toEqual(['Vergangenes', 'Gegenwärtiges', 'Zukünftiges']);
    expect(baum[0]!.kinder[0]!.kinder.map((k) => k.text)).toEqual(['Fazit']);
    expect(baum[1]!.kinder.map((k) => k.text)).toEqual(['Finanzen', 'Aufnahme: Max Neu']);
  });
});

const rendern = (e: DokumentEingabe) =>
  renderToStaticMarkup(
    <MantineProvider>
      <ProtokollDokumentAnsicht eingabe={e} />
    </MantineProvider>,
  );

describe('Thema in the outline', () => {
  const thema = (id: string, titel: string): ProtokollKnoten => ({
    type: 'bausteinThema',
    attrs: { id, daten: { titel } },
    content: [ueberschrift(3, 'Unterpunkt'), { type: 'paragraph' }],
  });
  const mit: ProtokollDokument = {
    type: 'doc',
    content: [
      abschnitt('vergangenes'),
      abschnitt('gegenwaertiges', thema('t1', ' Hausordnung '), thema('t2', ''), abstimmung),
      abschnitt('zukuenftiges'),
      { type: 'abschnitt', attrs: { art: 'sonstiges' }, content: [{ type: 'paragraph' }] },
    ],
  } as ProtokollDokument;

  it('is a heading of the Baustein level with its title, "Thema" when empty', () => {
    const { eintraege } = dokumentUeberschriften(mit, () => null);
    expect(eintraege.map((e) => [e.ebene, e.text])).toEqual([
      [1, 'Vergangenes'],
      [1, 'Gegenwärtiges'],
      [2, 'Hausordnung'],
      [4, 'Unterpunkt'],
      [2, 'Thema'],
      [4, 'Unterpunkt'],
      [1, 'Zukünftiges'],
    ]);
  });

  it('renders as h3 with the outline id, followed by its notes', () => {
    const { eintraege } = dokumentUeberschriften(mit, () => null);
    const html = rendern({ ...eingabe, inhalt: mit });
    expect(html).toContain(`<h3 class="pk-dok-h2" id="${eintraege[2]!.id}">Hausordnung</h3>`);
    expect(html).toContain(`id="${eintraege[4]!.id}">Thema</h3>`);
    expect(html.indexOf('Hausordnung')).toBeLessThan(html.indexOf('Unterpunkt'));
  });
});

describe('Gliederung der Dokumentansicht', () => {
  it('puts the outline ids on the headings and offers the Gliederung button (not printed)', () => {
    const html = rendern(eingabe);
    const { eintraege } = dokumentUeberschriften(inhalt, () => null);
    for (const e of eintraege) expect(html).toContain(`id="${e.id}"`);
    expect(html).toContain('data-druck="aus"');
    expect(html).toContain('Gliederung');
  });

  it('renders the tree as links to the headings', () => {
    const { eintraege } = dokumentUeberschriften(inhalt, () => null);
    const html = renderToStaticMarkup(
      <MantineProvider>
        <DokumentGliederung eintraege={eintraege} />
      </MantineProvider>,
    );
    expect(html).toContain('aria-label="Gliederung"');
    expect(html).toContain('Finanzen');
    expect(html).not.toContain('Neuer Tresen');
  });

  it('shows no outline without headings', () => {
    const leer = {
      ...eingabe,
      inhalt: {
        type: 'doc',
        content: [
          { type: 'abschnitt', attrs: { art: 'sonstiges' }, content: [{ type: 'paragraph' }] },
        ],
      } as ProtokollDokument,
    };
    expect(rendern(leer)).not.toContain('Gliederung');
  });
});
