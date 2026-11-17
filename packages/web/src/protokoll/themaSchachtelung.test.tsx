import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  bausteinLeer,
  protokollKopfLeer,
  type ProtokollDokument,
  type ProtokollKnoten,
} from '@c4/shared';
import { ProtokollDokumentAnsicht } from './ProtokollDokumentAnsicht';
import { dokumentGliederungBauen, dokumentUeberschriften } from './dokumentUeberschriften';
import type { DokumentEingabe } from './dokumentDaten';
import { blockBaum, lesezeichen, pdfBloecke } from './pdf/pdfBloecke';

const text = (t: string): ProtokollKnoten => ({
  type: 'paragraph',
  content: [{ type: 'text', text: t }],
});
const ueberschrift = (level: number, t: string): ProtokollKnoten => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text: t }],
});
const thema = (id: string, titel: string, ...inhalt: ProtokollKnoten[]): ProtokollKnoten => ({
  type: 'bausteinThema',
  attrs: { id, daten: { titel } },
  content: [text('n'), ...inhalt],
});
const abstimmung: ProtokollKnoten = {
  type: 'bausteinBeschluss',
  attrs: { id: 'v', daten: { antrag: 'Bier', ja: 1, nein: 0, enthaltung: 0, ergebnis: null } },
  content: [{ type: 'paragraph' }],
};

// Event (h3) > T1 (h4) > T2 (h5) > T3 (h6) > T4 (h6, capped); typed headings in T3 and the Event.
const event: ProtokollKnoten = {
  type: 'bausteinEvent',
  attrs: {
    id: 'e',
    daten: { ...bausteinLeer('bausteinEvent'), name: 'Fest', datum: '2024-02-11' },
  },
  content: [
    ueberschrift(2, 'EventUeb'),
    thema(
      't1',
      'Eins',
      thema(
        't2',
        'Zwei',
        thema('t3', 'Drei', abstimmung, ueberschrift(2, 'DreiUeb'), thema('t4', 'Vier')),
      ),
    ),
    { type: 'paragraph' },
  ],
};

const inhalt: ProtokollDokument = {
  type: 'doc',
  content: [
    { type: 'abschnitt', attrs: { art: 'vergangenes' }, content: [{ type: 'paragraph' }] },
    {
      type: 'abschnitt',
      attrs: { art: 'gegenwaertiges' },
      content: [ueberschrift(2, 'Frei'), event, { type: 'paragraph' }],
    },
    { type: 'abschnitt', attrs: { art: 'zukuenftiges' }, content: [{ type: 'paragraph' }] },
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

describe('nested Themen: outline', () => {
  it('numbers the levels by nesting, relative for typed headings, capped, without votes', () => {
    const { eintraege } = dokumentUeberschriften(inhalt, () => null);
    expect(eintraege.map((e) => [e.ebene, e.text])).toEqual([
      [1, 'Vergangenes'],
      [1, 'Gegenwärtiges'],
      [2, 'Frei'],
      [2, '11.02. Fest'],
      [3, 'EventUeb'],
      [3, 'Eins'],
      [4, 'Zwei'],
      [5, 'Drei'],
      [5, 'DreiUeb'],
      [5, 'Vier'],
      [1, 'Zukünftiges'],
    ]);
    expect(eintraege.some((e) => e.text.includes('Bier'))).toBe(false);
  });

  it('nests the entries under their parent Thema', () => {
    const { eintraege } = dokumentUeberschriften(inhalt, () => null);
    const baum = dokumentGliederungBauen(eintraege);
    const fest = baum[1]!.kinder.find((k) => k.text === '11.02. Fest')!;
    expect(fest.kinder.map((k) => k.text)).toEqual(['EventUeb', 'Eins']);
    const eins = fest.kinder[1]!;
    expect(eins.kinder.map((k) => k.text)).toEqual(['Zwei']);
    expect(eins.kinder[0]!.kinder.map((k) => k.text)).toEqual(['Drei', 'DreiUeb', 'Vier']); // capped: same level, siblings
  });
});

describe('nested Themen: document view', () => {
  const html = renderToStaticMarkup(
    <MantineProvider>
      <ProtokollDokumentAnsicht eingabe={eingabe} />
    </MantineProvider>,
  );
  const { eintraege } = dokumentUeberschriften(inhalt, () => null);
  const id = (t: string) => eintraege.find((e) => e.text === t)!.id;

  it('renders h2 section, h3 Event, h4 / h5 / h6 Themen and capped at h6', () => {
    expect(html).toContain(`<h2 class="pk-dok-h1" id="${id('Gegenwärtiges')}">`);
    expect(html).toContain(`<h3 class="pk-dok-h2" id="${id('11.02. Fest')}">`);
    expect(html).toContain(`<h4 class="pk-dok-h3" id="${id('Eins')}">Eins</h4>`);
    expect(html).toContain(`<h5 class="pk-dok-h4" id="${id('Zwei')}">Zwei</h5>`);
    expect(html).toContain(`<h6 class="pk-dok-h5" id="${id('Drei')}">Drei</h6>`);
    expect(html).toContain(`<h6 class="pk-dok-h5" id="${id('Vier')}">Vier</h6>`);
  });

  it('puts typed headings one level below the enclosing heading', () => {
    expect(html).toContain(`<h3 class="pk-dok-h2" id="${id('Frei')}">`); // directly in the section
    expect(html).toContain(`<h4 class="pk-dok-h3" id="${id('EventUeb')}">`); // in the Event (h3)
    expect(html).toContain(`<h6 class="pk-dok-h5" id="${id('DreiUeb')}">`); // below h6: capped
  });
});

describe('nested Themen: PDF bookmarks', () => {
  it('nests the Themen under their parent', () => {
    const outline = lesezeichen(blockBaum(pdfBloecke(eingabe)));
    const gegenwart = outline.find((o) => o.titel === 'Gegenwärtiges')!;
    expect(gegenwart.kinder.map((k) => k.titel)).toEqual(['Frei', '11.02. Fest']);
    const fest = gegenwart.kinder[1]!;
    expect(fest.kinder.map((k) => k.titel)).toEqual(['EventUeb', 'Eins']);
    const zwei = fest.kinder[1]!.kinder[0]!;
    expect(zwei.titel).toBe('Zwei');
    expect(zwei.kinder[0]!.titel).toBe('Drei');
    expect(zwei.kinder[0]!.kinder.map((k) => k.titel)).toEqual([]);
    expect(JSON.stringify(outline)).not.toContain('Bier');
  });
});
