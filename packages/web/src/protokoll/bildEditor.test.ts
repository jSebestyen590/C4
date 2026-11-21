// @vitest-environment jsdom
import { Editor } from '@tiptap/react';
import Blockquote from '@tiptap/extension-blockquote';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bausteinErzeugen,
  protokollDokumentPruefen,
  type ProtokollDokument,
  type ProtokollKnoten,
} from '@c4/shared';
import { BAUSTEIN_KNOTEN } from './BausteinKnoten';
import { bildErweiterung, bildStarten, bilderImUpload, type BildSteuerung } from './BildHochladen';
import type { BilderZugriff } from './bilderDaten';
import { AbschnittKnoten, ProtokollAbsicherung, ProtokollDokumentKnoten } from './schema';
import { bausteinEintraege, slashEintraege } from './slashLogik';

vi.mock('./bildLogik', async (orig) => ({
  ...(await orig<typeof import('./bildLogik')>()),
  bildSkalieren: vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' })),
  bildPut: vi.fn(),
}));
const logik = await import('./bildLogik');

const SCHLUESSEL = 'protokollbilder/p1/00000000-0000-4000-8000-000000000001.jpg';
const bild = (): ProtokollKnoten => ({
  type: 'protokollBild',
  attrs: { schluessel: SCHLUESSEL, breite: 'voll', ausrichtung: 'mitte', beschreibung: '' },
});
const absatz = (t: string): ProtokollKnoten => ({
  type: 'paragraph',
  content: [{ type: 'text', text: t }],
});

function baue(gegenwart: ProtokollKnoten[] = [{ type: 'paragraph' }]) {
  const element = document.createElement('div');
  document.body.append(element);
  return new Editor({
    element,
    extensions: [
      ProtokollDokumentKnoten,
      AbschnittKnoten,
      StarterKit.configure({ document: false, blockquote: false, link: false }),
      Blockquote.extend({ content: 'paragraph+' }),
      ...BAUSTEIN_KNOTEN,
      ProtokollAbsicherung,
      bildErweiterung(),
    ],
    content: {
      type: 'doc',
      content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges', 'sonstiges'].map((art) => ({
        type: 'abschnitt',
        attrs: { art },
        content: art === 'gegenwaertiges' ? gegenwart : [{ type: 'paragraph' }],
      })),
    },
  });
}

const zugriff = (): BilderZugriff & { hinzugefuegt: [string, string][] } => {
  const hinzugefuegt: [string, string][] = [];
  return {
    protokollId: 'p1',
    urls: {},
    erneuern: vi.fn(),
    hinzufuegen: (k, u) => hinzugefuegt.push([k, u]),
    uploadVorbereiten: vi.fn(async () => ({ uploadUrl: 'https://s3/up', schluessel: SCHLUESSEL })),
    hinzugefuegt,
  };
};

const jpegDatei = () => new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
const gegenwart = (e: Editor) => (e.getJSON() as ProtokollDokument).content[1]!.content!;

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('image node in the schema', () => {
  it('stands at section level and in the notes of every Baustein with free text, also votes', () => {
    const baustein = (typ: 'bausteinThema' | 'bausteinBeschluss' | 'bausteinWahl') =>
      bausteinErzeugen(typ, undefined, [absatz('x'), bild()]);
    const editor = baue([
      bild(),
      baustein('bausteinThema'),
      baustein('bausteinBeschluss'),
      baustein('bausteinWahl'),
      { type: 'paragraph' },
    ]);
    const doc = editor.getJSON() as ProtokollDokument;
    expect(JSON.stringify(doc).match(/protokollBild/g)).toHaveLength(4);
    expect(protokollDokumentPruefen(doc)).toBeNull();
    editor.destroy();
  });

  it('refuses images in lists and quotes', () => {
    const editor = baue();
    const schema = editor.schema;
    const liste = schema.nodes.bulletList!;
    const zitat = schema.nodes.blockquote!;
    const knoten = schema.nodeFromJSON(bild());
    const punkt = schema.nodes.listItem!.create(null, [schema.nodes.paragraph!.create()]);
    expect(punkt.type.contentMatch.matchType(knoten.type)).toBeNull();
    expect(liste.contentMatch.matchType(knoten.type)).toBeNull();
    expect(zitat.contentMatch.matchType(knoten.type)).toBeNull();
    editor.destroy();
  });
});

describe('slash entry', () => {
  it.each(['bild', 'foto', 'image', 'Fo'])('offers "Bild" for /%s', (q) => {
    const e = slashEintraege(q, { vorlagen: [], vergangene: [] });
    expect(e.some((x) => x.schluessel === 'bild' && x.aktion.art === 'bild')).toBe(true);
  });

  it('is in the Baustein menu list, also inside votes and lists', () => {
    expect(bausteinEintraege('', true).map((e) => e.schluessel)).toContain('bild');
  });
});

describe('bildStarten', () => {
  it('shows a placeholder while uploading, then inserts the image and remembers its preview', async () => {
    const editor = baue([absatz('Text'), { type: 'paragraph' }]);
    const z = zugriff();
    let fertig!: () => void;
    vi.mocked(logik.bildPut).mockImplementation(
      (_url, _blob, fortschritt) =>
        new Promise<void>((r) => {
          fortschritt(0.4);
          fertig = r;
        }),
    );
    const steuerung: BildSteuerung = { zugriff: () => z, fehler: vi.fn() };
    // end of the first paragraph of "Gegenwärtiges"
    let pos = 0;
    editor.state.doc.descendants((k, p) => {
      if (k.isTextblock && k.textContent === 'Text') pos = p + k.nodeSize;
      return true;
    });
    const lauf = bildStarten(editor, steuerung, jpegDatei(), pos);
    await vi.waitFor(() => expect(bilderImUpload(editor)).toBe(1));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="bild-platzhalter"]')?.textContent).toContain(
        '40 %',
      ),
    );
    // not in the document yet
    expect(JSON.stringify(editor.getJSON())).not.toContain('protokollBild');
    fertig();
    await lauf;
    expect(bilderImUpload(editor)).toBe(0);
    expect(document.querySelector('[data-testid="bild-platzhalter"]')).toBeNull();
    const inhalt = gegenwart(editor);
    expect(inhalt.map((k) => k.type)).toEqual(['paragraph', 'protokollBild', 'paragraph']);
    expect(inhalt[1]!.attrs).toEqual({
      schluessel: SCHLUESSEL,
      breite: 'voll',
      ausrichtung: 'mitte',
      beschreibung: '',
    });
    expect(z.uploadVorbereiten).toHaveBeenCalledWith(4);
    expect(z.hinzugefuegt).toHaveLength(1);
    expect(z.hinzugefuegt[0]![0]).toBe(SCHLUESSEL);
    expect(protokollDokumentPruefen(editor.getJSON())).toBeNull();
    expect(steuerung.fehler).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('inserts into the notes when the cursor is in a Thema, with a paragraph behind it', async () => {
    const editor = baue([
      bausteinErzeugen('bausteinThema', undefined, [absatz('Notiz')]),
      { type: 'paragraph' },
    ]);
    vi.mocked(logik.bildPut).mockResolvedValue();
    let pos = 0;
    editor.state.doc.descendants((k, p) => {
      if (k.isTextblock && k.textContent === 'Notiz') pos = p + 2;
      return true;
    });
    await bildStarten(editor, { zugriff: () => zugriff(), fehler: vi.fn() }, jpegDatei(), pos);
    const thema = gegenwart(editor)[0]!;
    expect(thema.type).toBe('bausteinThema');
    expect(thema.content!.map((k) => k.type)).toEqual(['paragraph', 'protokollBild', 'paragraph']);
    editor.destroy();
  });

  it('reports a failure, removes the placeholder and leaves the document alone', async () => {
    const editor = baue();
    vi.mocked(logik.bildPut).mockRejectedValue(new Error('Netzwerk'));
    const fehler = vi.fn();
    const stilleKonsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    await bildStarten(editor, { zugriff: () => zugriff(), fehler }, jpegDatei(), 3);
    expect(fehler).toHaveBeenCalledWith('Das Bild konnte nicht hochgeladen werden.');
    expect(bilderImUpload(editor)).toBe(0);
    expect(JSON.stringify(editor.getJSON())).not.toContain('protokollBild');
    stilleKonsole.mockRestore();
    editor.destroy();
  });

  it('refuses files that are no images and works without upload access', async () => {
    const editor = baue();
    const fehler = vi.fn();
    await bildStarten(
      editor,
      { zugriff: () => zugriff(), fehler },
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
      3,
    );
    expect(fehler).toHaveBeenLastCalledWith('Das ist keine Bilddatei.');
    await bildStarten(editor, { zugriff: () => undefined, fehler }, jpegDatei(), 3);
    expect(fehler).toHaveBeenCalledTimes(2);
    expect(logik.bildSkalieren).not.toHaveBeenCalled();
    editor.destroy();
  });
});
