// @vitest-environment jsdom
import { Editor } from '@tiptap/react';
import Blockquote from '@tiptap/extension-blockquote';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { bausteinErzeugen, bausteinLeer, type ProtokollKnoten } from '@c4/shared';
import { BAUSTEIN_KNOTEN } from './BausteinKnoten';
import { bausteinEinfuegen, fokusSetzen } from './einfuegen';
import {
  AbschnittKnoten,
  blockPunkte,
  ListenPunkt,
  ProtokollAbsicherung,
  ProtokollDokumentKnoten,
} from './schema';

const absatz = (t?: string): ProtokollKnoten =>
  t ? { type: 'paragraph', content: [{ type: 'text', text: t }] } : { type: 'paragraph' };
const punkt = (...k: ProtokollKnoten[]): ProtokollKnoten => ({ type: 'listItem', content: k });
const liste = (...p: ProtokollKnoten[]): ProtokollKnoten => ({ type: 'bulletList', content: p });

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function baue(notizen: ProtokollKnoten[]) {
  const element = document.createElement('div');
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: [
      ProtokollDokumentKnoten,
      AbschnittKnoten,
      StarterKit.configure({ document: false, blockquote: false, link: false, listItem: false }),
      Blockquote.extend({ content: 'paragraph+' }),
      ListenPunkt,
      ...BAUSTEIN_KNOTEN,
      ProtokollAbsicherung,
    ],
    content: {
      type: 'doc',
      content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges', 'sonstiges'].map((art) => ({
        type: 'abschnitt',
        attrs: { art },
        content:
          art === 'gegenwaertiges'
            ? [bausteinErzeugen('bausteinThema', undefined, notizen), absatz()]
            : [absatz()],
      })),
    },
  });
  return editor;
}

/** Compact form: paragraphs by text or "_", Bausteine by four letters, lists and items in brackets. */
function form(k: ProtokollKnoten): string {
  if (k.type === 'paragraph') return k.content ? (k.content[0]!.text ?? 't') : '_';
  const kinder = (k.content ?? []).map(form).join(' ');
  const name = k.type.startsWith('baustein')
    ? k.type.slice(8, 12)
    : k.type === 'listItem'
      ? 'li'
      : k.type === 'bulletList'
        ? 'ul'
        : k.type;
  return `${name}(${kinder})`;
}
const notizen = (e: Editor): string => form(e.getJSON().content![1]!.content![0]!);

function cursorIn(e: Editor, text: string) {
  let pos = -1;
  e.state.doc.descendants((n, p) => {
    if (pos === -1 && n.isTextblock && n.textContent === text) pos = p + 1 + text.length;
    return pos === -1;
  });
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, pos)));
}

const anwesenheit = {
  typ: 'bausteinAnwesenheit',
  daten: { art: 'erscheint', sub: 'x', name: '', uhrzeit: '' },
} as const;
const abstimmung = { typ: 'bausteinBeschluss', daten: bausteinLeer('bausteinBeschluss') } as const;
const start = () =>
  baue([absatz(), liste(punkt(absatz('Notiz 2'), liste(punkt(absatz('/erscheint x')))))]);

describe('Bausteine from list items in the real editor', () => {
  it('erscheint in the new first item of a nested list: item keeps its level, an empty item follows', () => {
    const e = start();
    cursorIn(e, '/erscheint x');
    const bis = e.state.selection.from;
    bausteinEinfuegen(e, anwesenheit, { from: bis - '/erscheint x'.length, to: bis });
    expect(notizen(e)).toBe('Them(_ ul(li(Notiz 2 ul(li(_ Anwe()) li(_)))))');
    // The block-only item is marked for the CSS (no bullet, no empty line); the continuation item is not.
    expect(blockPunkte(e.state.doc).find()).toHaveLength(1);
  });

  it('an Abstimmung from the continuation item gets its own empty item behind it', async () => {
    const e = start();
    cursorIn(e, '/erscheint x');
    const bis = e.state.selection.from;
    bausteinEinfuegen(e, anwesenheit, { from: bis - '/erscheint x'.length, to: bis });
    // The cursor goes into the continuation item (`fokusSetzen` runs on a timer).
    await new Promise((r) => setTimeout(r, 100));
    const { $from } = e.state.selection;
    expect($from.node($from.depth - 1).type.name).toBe('listItem');
    expect($from.parent.content.size).toBe(0);
    e.commands.insertContent('/abstim');
    const ende = e.state.selection.from;
    bausteinEinfuegen(e, abstimmung, { from: ende - '/abstim'.length, to: ende });
    expect(notizen(e)).toMatch(/li\(_ Anwe\(\)\) li\(_ Besc\(.*\)\) li\(_\)/);
  });
});

const taste = (e: Editor, key: string, shiftKey = false): boolean =>
  e.view.someProp('handleKeyDown', (f) =>
    f(e.view, new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })),
  ) === true;

describe('Tab in the Notizen', () => {
  it('is always consumed and never leaves the text: no list item to indent or outdent changes nothing', () => {
    const e = baue([absatz('Notiz'), liste(punkt(absatz('Eins')), punkt(absatz('Zwei')))]);
    const vorher = notizen(e);
    cursorIn(e, 'Notiz');
    expect(taste(e, 'Tab')).toBe(true);
    expect(taste(e, 'Tab', true)).toBe(true);
    cursorIn(e, 'Eins'); // first item: nothing to sink under
    expect(taste(e, 'Tab')).toBe(true);
    expect(notizen(e)).toBe(vorher);
  });

  it('indents and outdents a list item', () => {
    const e = baue([liste(punkt(absatz('Eins')), punkt(absatz('Zwei')))]);
    cursorIn(e, 'Zwei');
    expect(taste(e, 'Tab')).toBe(true);
    expect(notizen(e)).toBe('Them(ul(li(Eins ul(li(Zwei)))))');
    expect(taste(e, 'Tab', true)).toBe(true);
    expect(notizen(e)).toBe('Them(ul(li(Eins) li(Zwei)))');
  });
});

describe('fokusSetzen', () => {
  const pause = () => new Promise((r) => setTimeout(r, 100));
  const bausteinPos = (e: Editor) => {
    let pos = -1;
    e.state.doc.descendants((n, p) => {
      if (pos === -1 && n.type.name === 'bausteinThema') pos = p;
      return pos === -1;
    });
    return pos;
  };

  it('puts the cursor into the Notizen of the Baustein', async () => {
    const e = baue([absatz('Notiz')]);
    fokusSetzen(e, bausteinPos(e), 'text');
    await pause();
    expect(e.state.selection.$from.parent.textContent).toBe('Notiz');
  });

  it("'nach' goes into the first text block of a following list instead of adding a paragraph", async () => {
    const anwe = bausteinErzeugen('bausteinAnwesenheit', {
      art: 'erscheint',
      sub: 'x',
      name: '',
      uhrzeit: '',
    });
    const e = baue([absatz('A'), anwe, liste(punkt(absatz()))]);
    let pos = -1;
    e.state.doc.descendants((n, p) => {
      if (pos === -1 && n.type.name === 'bausteinAnwesenheit') pos = p;
      return pos === -1;
    });
    fokusSetzen(e, pos, 'nach');
    await pause();
    expect(notizen(e)).toBe('Them(A Anwe() ul(li(_)))');
    const { $from } = e.state.selection;
    expect($from.parent.type.name).toBe('paragraph');
    expect($from.node($from.depth - 1).type.name).toBe('listItem');
  });

  it("'nach' does not descend into a following Baustein", async () => {
    const anwe = bausteinErzeugen('bausteinAnwesenheit', {
      art: 'erscheint',
      sub: 'x',
      name: '',
      uhrzeit: '',
    });
    const thema = bausteinErzeugen('bausteinThema', undefined, [absatz('Innen')]);
    const e = baue([absatz('A'), anwe, thema]);
    let pos = -1;
    e.state.doc.descendants((n, p) => {
      if (pos === -1 && n.type.name === 'bausteinAnwesenheit') pos = p;
      return pos === -1;
    });
    fokusSetzen(e, pos, 'nach');
    await pause();
    expect(notizen(e)).toBe('Them(A Anwe() _ Them(Innen) _)');
  });

  it("'nach' adds a paragraph when no text block follows", async () => {
    const anwe = bausteinErzeugen('bausteinAnwesenheit', {
      art: 'erscheint',
      sub: 'x',
      name: '',
      uhrzeit: '',
    });
    const e = baue([absatz('A'), anwe]);
    let pos = -1;
    e.state.doc.descendants((n, p) => {
      if (pos === -1 && n.type.name === 'bausteinAnwesenheit') pos = p;
      return pos === -1;
    });
    fokusSetzen(e, pos, 'nach');
    await pause();
    expect(notizen(e)).toBe('Them(A Anwe() _)');
  });

  it('gives up when the user does something else first', async () => {
    const e = baue([absatz('Notiz')]);
    cursorIn(e, 'Notiz');
    e.commands.setTextSelection(1);
    const vorher = e.state.selection.from;
    fokusSetzen(e, bausteinPos(e), 'text');
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await pause();
    expect(e.state.selection.from).toBe(vorher);
  });
});
