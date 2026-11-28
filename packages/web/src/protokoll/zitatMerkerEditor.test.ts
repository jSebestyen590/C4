// @vitest-environment jsdom
import { Editor } from '@tiptap/react';
import Blockquote from '@tiptap/extension-blockquote';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { bausteinErzeugen, type ProtokollDokument, type ProtokollKnoten } from '@c4/shared';
import { BAUSTEIN_KNOTEN } from './BausteinKnoten';
import { dienstEintragenAmCursor, zitatImTextEinfuegen } from './einfuegen';
import {
  AbschnittKnoten,
  ListenPunkt,
  ProtokollAbsicherung,
  ProtokollDokumentKnoten,
} from './schema';
import { ZitatInline } from './ZitatInline';

const absatz = (t: string): ProtokollKnoten => ({
  type: 'paragraph',
  content: t ? [{ type: 'text', text: t }] : [],
});

function baue(gegenwart: ProtokollKnoten[]) {
  const element = document.createElement('div');
  document.body.append(element);
  return new Editor({
    element,
    extensions: [
      ProtokollDokumentKnoten,
      AbschnittKnoten,
      StarterKit.configure({ document: false, blockquote: false, link: false, listItem: false }),
      Blockquote.extend({ content: 'paragraph+' }),
      ListenPunkt,
      ZitatInline,
      ...BAUSTEIN_KNOTEN,
      ProtokollAbsicherung,
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

const gegenwart = (e: Editor) => (e.getJSON() as ProtokollDokument).content[1]!.content!;

/** Types a character the way the browser does (this runs the input rules). */
function tippe(e: Editor, zeichen: string) {
  const { from, to } = e.state.selection;
  const behandelt = e.view.someProp('handleTextInput', (f) =>
    f(e.view, from, to, zeichen, () => e.state.tr.insertText(zeichen, from, to)),
  );
  if (!behandelt) e.view.dispatch(e.state.tr.insertText(zeichen, from, to));
}

let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
  document.body.innerHTML = '';
});

describe('inline quote', () => {
  it('turns ""Text"" into a quote and removes the quote marks', () => {
    editor = baue([absatz('Er sagte ')]);
    const pos = (() => {
      let p = 0;
      editor.state.doc.descendants((n, q) => {
        if (n.isText && n.text === 'Er sagte ') p = q + n.nodeSize;
      });
      return p;
    })();
    editor.commands.setTextSelection(pos);
    for (const z of '""Hallo""') tippe(editor, z);
    expect(gegenwart(editor)[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Er sagte ' },
        { type: 'text', text: 'Hallo', marks: [{ type: 'zitatInline' }] },
      ],
    });
    expect(editor.getHTML()).toContain('<q class="pk-zitat-inline">Hallo</q>');
  });

  it('toggles the mark on a selection', () => {
    editor = baue([absatz('ein Wort')]);
    let von = 0;
    editor.state.doc.descendants((n, q) => {
      if (n.isText && n.text === 'ein Wort') von = q;
    });
    editor.commands.setTextSelection({ from: von + 4, to: von + 8 });
    zitatImTextEinfuegen(editor);
    expect(editor.isActive('zitatInline')).toBe(true);
    zitatImTextEinfuegen(editor);
    expect(editor.isActive('zitatInline')).toBe(false);
  });
});

describe('inline quote typing', () => {
  const zitate = (e: Editor) =>
    (gegenwart(e)[0]!.content ?? [])
      .filter((k) => k.marks?.some((m) => m.type === 'zitatInline'))
      .map((k) => k.text)
      .join('');

  it('keeps typed text inside the quote after /zitat, until ArrowRight leaves it', () => {
    editor = baue([absatz('Er sagte ')]);
    let pos = 0;
    editor.state.doc.descendants((n, q) => {
      if (n.isText) pos = q + n.nodeSize;
    });
    editor.commands.setTextSelection(pos);
    zitatImTextEinfuegen(editor);
    for (const z of 'Hallo') tippe(editor, z);
    expect(zitate(editor)).toBe('Hallo');
    const pfeil = editor.view.someProp('handleKeyDown', (f) =>
      f(editor!.view, new KeyboardEvent('keydown', { key: 'ArrowRight' })),
    );
    expect(pfeil).toBe(true);
    for (const z of ' Welt') tippe(editor, z);
    expect(zitate(editor)).toBe('Hallo');
  });
});

describe('Merker', () => {
  it('stands at the top level and in Notizen, holds plain text, and is a valid document', () => {
    const thema = bausteinErzeugen('bausteinThema', undefined, [
      absatz('Notiz'),
      bausteinErzeugen('bausteinMerker', undefined, [absatz('Zahlen prüfen')]),
    ]);
    editor = baue([
      thema,
      bausteinErzeugen('bausteinMerker', undefined, [absatz('später')]),
      absatz(''),
    ]);
    const inhalt = editor.getJSON() as ProtokollDokument;
    const typen = gegenwart(editor).map((k) => k.type);
    expect(typen.slice(0, 2)).toEqual(['bausteinThema', 'bausteinMerker']);
    expect(JSON.stringify(inhalt)).toContain('Zahlen prüfen');
  });
});

describe('/dienst in the editor', () => {
  it('enters the Dienst into the Event block around the cursor and removes the typed text', () => {
    const ev = bausteinErzeugen('bausteinEvent', undefined, [absatz('/dienst gesamt')]);
    editor = baue([ev, absatz('')]);
    let ende = 0;
    editor.state.doc.descendants((n, q) => {
      if (n.isText && n.text === '/dienst gesamt') ende = q + n.nodeSize;
    });
    editor.commands.setTextSelection(ende);
    const ok = dienstEintragenAmCursor(
      editor,
      { zeiten: null, dienst: 'bar', sub: 'anna' },
      { from: ende - '/dienst gesamt'.length, to: ende },
    );
    expect(ok).toBe(true);
    const knoten = gegenwart(editor)[0]!;
    const daten = knoten.attrs!.daten as { schichten: { bedarfe: { personen: string[] }[] }[] };
    expect(daten.schichten[0]!.bedarfe[0]!.personen).toEqual(['anna']);
    expect(JSON.stringify(knoten.content)).not.toContain('/dienst');
  });

  it('does nothing outside of an Event block', () => {
    editor = baue([absatz('/dienst')]);
    let ende = 0;
    editor.state.doc.descendants((n, q) => {
      if (n.isText && n.text === '/dienst') ende = q + n.nodeSize;
    });
    editor.commands.setTextSelection(ende);
    expect(
      dienstEintragenAmCursor(
        editor,
        { zeiten: null, dienst: 'bar', sub: null },
        { from: ende - 7, to: ende },
      ),
    ).toBe(false);
  });
});
