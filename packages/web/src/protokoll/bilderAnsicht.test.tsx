import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { bausteinErzeugen, protokollKopfLeer, type ProtokollKnoten } from '@c4/shared';
import { ProtokollDokumentAnsicht } from './ProtokollDokumentAnsicht';
import type { DokumentEingabe } from './dokumentDaten';

const text = (t: string): ProtokollKnoten => ({
  type: 'paragraph',
  content: [{ type: 'text', text: t }],
});
const bild = (n: number, attrs: Record<string, unknown> = {}): ProtokollKnoten => ({
  type: 'protokollBild',
  attrs: {
    schluessel: `k${n}`,
    breite: 'voll',
    ausrichtung: 'mitte',
    beschreibung: `Beschreibung ${n}`,
    ...attrs,
  },
});

function eingabeMit(gegenwart: ProtokollKnoten[], bilder: Record<string, string>): DokumentEingabe {
  return {
    inhalt: {
      type: 'doc',
      content: [
        { type: 'abschnitt', attrs: { art: 'vergangenes' }, content: [{ type: 'paragraph' }] },
        { type: 'abschnitt', attrs: { art: 'gegenwaertiges' }, content: gegenwart },
        { type: 'abschnitt', attrs: { art: 'zukuenftiges' }, content: [{ type: 'paragraph' }] },
      ],
    },
    kopf: protokollKopfLeer(),
    teilnahme: [],
    ems: [],
    sitzung: { titel: 'Clubsitzung', beginn: '2024-01-30T19:00:00Z', art: 'sitzung' },
    bilder,
  };
}

const html = (e: DokumentEingabe) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <MantineProvider>
        <ProtokollDokumentAnsicht eingabe={e} />
      </MantineProvider>
    </MemoryRouter>,
  );

describe('Bilder in der Dokumentansicht', () => {
  it('shows a top-level image in its own figure with width, position and caption', () => {
    const out = html(
      eingabeMit(
        [
          bild(1, { breite: 'halb', ausrichtung: 'rechts' }),
          bild(2, { breite: 'voll', ausrichtung: 'links' }),
          text('Danach'),
        ],
        { k1: 'https://s3/k1.jpg', k2: 'https://s3/k2.jpg' },
      ),
    );
    expect(out).toContain(
      '<figure class="pk-dok-bild" data-breite="halb" data-ausrichtung="rechts"',
    );
    expect(out).toContain('data-breite="voll" data-ausrichtung="links"');
    expect(out).toContain('src="https://s3/k1.jpg"');
    expect(out).toContain('alt="Beschreibung 1"');
    expect(out).toContain('<figcaption class="pk-dok-klein">Beschreibung 1</figcaption>');
    // no grid at section level
    expect(out).not.toContain('pk-dok-notiz-bilder');
  });

  it('says so when the URL of an image is missing', () => {
    const out = html(eingabeMit([bild(1)], {}));
    expect(out).toContain('Bild nicht verfügbar');
    expect(out).not.toContain('<img');
  });

  it('sets images in notes in a column beside the text, nested Bausteine in full width between', () => {
    const abstimmung = bausteinErzeugen('bausteinBeschluss', undefined, [text('ABSTIMMUNGSTEXT')]);
    const thema = bausteinErzeugen('bausteinThema', { titel: 'Haupt' }, [
      text('VORTEXT'),
      bild(1),
      bild(2),
      abstimmung,
      text('NACHTEXT'),
      { type: 'paragraph' },
    ]);
    const out = html(eingabeMit([thema], { k1: 'https://s3/k1.jpg', k2: 'https://s3/k2.jpg' }));
    // exactly one grid: the segment before the Abstimmung; the one after has no image
    expect(out.match(/pk-dok-notiz-bilder/g)).toHaveLength(1);
    const grid = out.slice(out.indexOf('pk-dok-notiz-bilder'));
    const text1 = grid.indexOf('VORTEXT');
    const spalte = grid.indexOf('pk-dok-notiz-spalte');
    expect(text1).toBeGreaterThan(-1);
    expect(spalte).toBeGreaterThan(text1);
    // both images stacked in the column, before the vote
    const abst = grid.indexOf('ABSTIMMUNGSTEXT');
    expect(grid.indexOf('k1.jpg')).toBeGreaterThan(spalte);
    expect(grid.indexOf('k2.jpg')).toBeGreaterThan(grid.indexOf('k1.jpg'));
    expect(abst).toBeGreaterThan(grid.indexOf('k2.jpg'));
    // images in notes have no width / position of their own
    expect(grid).toContain('class="pk-dok-bild pk-dok-bild-spalte"');
    expect(out).not.toContain('data-breite');
    // the text after the vote stays outside a grid
    expect(out.indexOf('NACHTEXT')).toBeGreaterThan(out.indexOf('ABSTIMMUNGSTEXT'));
  });

  it('leaves notes without images unchanged', () => {
    const thema = bausteinErzeugen('bausteinThema', { titel: 'Haupt' }, [text('NUR TEXT')]);
    const out = html(eingabeMit([thema], {}));
    expect(out).toContain('NUR TEXT');
    expect(out).not.toContain('pk-dok-notiz');
  });

  it('also sets images in the notes of a vote beside the text', () => {
    const wahl = bausteinErzeugen('bausteinWahl', undefined, [text('WAHLTEXT'), bild(1)]);
    const out = html(eingabeMit([wahl], { k1: 'https://s3/k1.jpg' }));
    expect(out).toContain('pk-dok-notiz-bilder');
    expect(out).toContain('k1.jpg');
  });
});
