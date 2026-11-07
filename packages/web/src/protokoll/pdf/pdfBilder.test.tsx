// @vitest-environment node
import { createRequire } from 'node:module';
import { pdf } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { bausteinErzeugen, protokollKopfLeer, type ProtokollKnoten } from '@c4/shared';
import type { DokumentEingabe } from '../dokumentDaten';
import { BILD_NICHT_VERFUEGBAR, blockBaum, lesezeichen, pdfBloecke } from './pdfBloecke';
import { ProtokollPdf } from './ProtokollPdf';
import { schriftenRegistrieren } from './schriften';

const JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAADAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDGooorgPrj/9k=';

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
    beschreibung: `BESCHREIBUNG${n}`,
    ...attrs,
  },
});

const thema = bausteinErzeugen('bausteinThema', { titel: 'Haupt' }, [
  text('VORTEXT'),
  bild(1),
  bausteinErzeugen('bausteinBeschluss', undefined, [text('ABSTIMMUNGSTEXT')]),
  text('NACHTEXT'),
]);

const eingabe = (bilder: Record<string, string>): DokumentEingabe => ({
  inhalt: {
    type: 'doc',
    content: [
      { type: 'abschnitt', attrs: { art: 'vergangenes' }, content: [{ type: 'paragraph' }] },
      {
        type: 'abschnitt',
        attrs: { art: 'gegenwaertiges' },
        content: [bild(2, { breite: 'halb', ausrichtung: 'rechts' }), thema],
      },
      { type: 'abschnitt', attrs: { art: 'zukuenftiges' }, content: [{ type: 'paragraph' }] },
    ],
  },
  kopf: protokollKopfLeer(),
  teilnahme: [],
  ems: [],
  sitzung: { titel: 'Clubsitzung', beginn: '2024-01-30T19:00:00Z', art: 'sitzung' },
  bilder,
});

const baumText = (e: DokumentEingabe) =>
  JSON.stringify(
    pdfBloecke(e).map((b) => b.element),
    (k, v: unknown) => (k === 'ctx' ? undefined : v),
  );

describe('PDF: Bilder', () => {
  it('lays out a top-level image in its own row with width and position', () => {
    const t = baumText(eingabe({ k1: JPEG, k2: JPEG }));
    expect(t).toContain('"alignItems":"flex-end"');
    expect(t).toContain('"width":"50%"');
    expect(t).toContain('BESCHREIBUNG2');
  });

  it('sets the images of a note piece in a row beside the text, in front of the Abstimmung', () => {
    const t = baumText(eingabe({ k1: JPEG, k2: JPEG }));
    expect(t).toContain('"flexDirection":"row"');
    expect(t.indexOf('VORTEXT')).toBeLessThan(t.indexOf('BESCHREIBUNG1'));
    expect(t.indexOf('BESCHREIBUNG1')).toBeLessThan(t.indexOf('ABSTIMMUNGSTEXT'));
    expect(t.indexOf('ABSTIMMUNGSTEXT')).toBeLessThan(t.indexOf('NACHTEXT'));
    // the text after the vote has no image: no second row
    expect(t.match(/"flexDirection":"row"/g)?.length).toBe(
      baumText(eingabe({})).match(/"flexDirection":"row"/g)?.length,
    );
  });

  it('writes a placeholder instead of an image that could not be loaded', () => {
    const t = baumText(eingabe({ k1: JPEG }));
    expect(t).toContain(BILD_NICHT_VERFUEGBAR);
    expect(baumText(eingabe({ k1: JPEG, k2: JPEG }))).not.toContain(BILD_NICHT_VERFUEGBAR);
  });

  it('keeps the outline of the headings', () => {
    const outline = lesezeichen(blockBaum(pdfBloecke(eingabe({ k1: JPEG, k2: JPEG }))));
    expect(outline.find((o) => o.titel === 'Gegenwärtiges')!.kinder).toEqual([
      { titel: 'Haupt', kinder: [] },
    ]);
  });

  async function rendern(e: DokumentEingabe) {
    const require = createRequire(import.meta.url);
    const datei = (n: string) =>
      require.resolve(`@fontsource/noto-sans/files/noto-sans-latin-${n}.woff`);
    schriftenRegistrieren({
      normal: datei('400-normal'),
      fett: datei('700-normal'),
      kursiv: datei('400-italic'),
      fettKursiv: datei('700-italic'),
    });
    const strom = await pdf(<ProtokollPdf eingabe={e} />).toBuffer();
    const teile: Buffer[] = [];
    for await (const t of strom) teile.push(Buffer.from(t as Uint8Array));
    return Buffer.concat(teile);
  }

  it('renders a PDF with embedded images, and a PDF with missing images', async () => {
    const mit = await rendern(eingabe({ k1: JPEG, k2: JPEG }));
    expect(mit.subarray(0, 5).toString()).toBe('%PDF-');
    expect(mit.toString('latin1')).toContain('/Subtype /Image');
    const ohne = await rendern(eingabe({}));
    expect(ohne.subarray(0, 5).toString()).toBe('%PDF-');
    expect(ohne.toString('latin1')).not.toContain('/Subtype /Image');
  });
});
