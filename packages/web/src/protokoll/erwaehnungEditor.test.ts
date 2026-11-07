// @vitest-environment jsdom
import { Editor } from '@tiptap/react';
import Blockquote from '@tiptap/extension-blockquote';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { protokollDokumentPruefen, type ProtokollDokument } from '@c4/shared';
import { BAUSTEIN_KNOTEN } from './BausteinKnoten';
import { ErwaehnungKnoten } from './ErwaehnungKnoten';
import { ERWAEHNUNG_SCHLUESSEL, erwaehnungErweiterung } from './ErwaehnungErweiterung';
import type { ErwaehnungPerson } from './erwaehnungLogik';
import { AbschnittKnoten, ProtokollDokumentKnoten } from './schema';
import { SLASH_SCHLUESSEL, slashErweiterung } from './SlashErweiterung';
import type { SlashZustand } from './SlashPopup';

const LEUTE: ErwaehnungPerson[] = [
  { sub: 'z', username: 'zoe', vorname: 'Zoe', nachname: 'Zander', status: 'mitglied' },
];

function baue() {
  const zustaende: (SlashZustand | null)[] = [];
  const zustand = (z: SlashZustand | null) => {
    zustaende.push(z);
  };
  const taste = () => false;
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [
      ProtokollDokumentKnoten,
      AbschnittKnoten,
      StarterKit.configure({ document: false, blockquote: false, link: false }),
      Blockquote.extend({ content: 'paragraph+' }),
      ...BAUSTEIN_KNOTEN,
      ErwaehnungKnoten,
      slashErweiterung({
        daten: () => ({ vorlagen: [], vergangene: [] }),
        zustand,
        taste,
        bild: () => {},
      }),
      erwaehnungErweiterung({ personen: () => LEUTE, zustand, taste }),
    ],
    content: {
      type: 'doc',
      content: ['vergangenes', 'gegenwaertiges', 'zukuenftiges', 'sonstiges'].map((art) => ({
        type: 'abschnitt',
        attrs: { art },
        content: [{ type: 'paragraph' }],
      })),
    },
  });
  return { editor, zustaende };
}

const aktiv = (editor: Editor, key: typeof ERWAEHNUNG_SCHLUESSEL) =>
  (key.getState(editor.state) as { active: boolean } | undefined)?.active === true;

/** The suggestion resolves its items asynchronously. */
const warte = () => new Promise((r) => setTimeout(r, 0));

/** Types text at the end of the first paragraph like a user would (one character at a time). */
function tippe(editor: Editor, text: string) {
  editor.commands.focus('start');
  for (const zeichen of text) {
    const { from } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (f) =>
      f(editor.view, from, from, zeichen, () => editor.state.tr.insertText(zeichen)),
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(zeichen));
  }
}

describe('@mention in the editor', () => {
  it('opens the @ list with the groups first and keeps the slash menu out of it', async () => {
    const { editor, zustaende } = baue();
    tippe(editor, '@');
    await warte();
    expect(aktiv(editor, ERWAEHNUNG_SCHLUESSEL)).toBe(true);
    expect(aktiv(editor, SLASH_SCHLUESSEL)).toBe(false);
    const z = zustaende.at(-1)!;
    expect(z.bezeichnung).toBe('Erwähnungen');
    expect(z.eintraege.map((e) => e.titel).slice(0, 2)).toEqual(['Anwärter:innen', 'Mitglieder']);
    editor.destroy();
  });

  it('inserts a person node plus a space when an entry is chosen', async () => {
    const { editor, zustaende } = baue();
    tippe(editor, '@zo');
    await warte();
    const z = zustaende.at(-1)!;
    expect(z.eintraege.map((e) => e.titel)).toEqual(['zoe (Zoe Zander)']);
    z.waehlen(0);
    const json = editor.getJSON() as ProtokollDokument;
    expect(json.content[0]!.content![0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'erwaehnung', attrs: { art: 'person', sub: 'z', gruppe: null } },
        { type: 'text', text: ' ' },
      ],
    });
    expect(protokollDokumentPruefen(json)).toBeNull();
    expect(aktiv(editor, ERWAEHNUNG_SCHLUESSEL)).toBe(false);
    editor.destroy();
  });

  it('does not open inside a slash query ("/event @x" stays the slash menu)', () => {
    const { editor } = baue();
    tippe(editor, '/event @z');
    expect(aktiv(editor, SLASH_SCHLUESSEL)).toBe(true);
    expect(aktiv(editor, ERWAEHNUNG_SCHLUESSEL)).toBe(false);
    editor.destroy();
  });

  it('does not open in a heading', () => {
    const { editor } = baue();
    editor.commands.setNode('heading', { level: 2 });
    tippe(editor, '@');
    expect(aktiv(editor, ERWAEHNUNG_SCHLUESSEL)).toBe(false);
    editor.destroy();
  });

  it('copies a group mention as plain text', () => {
    const { editor } = baue();
    editor.commands.insertContent({ type: 'erwaehnung', attrs: { art: 'gruppe', gruppe: 'ems' } });
    expect(editor.getText()).toContain('@EMs');
    editor.destroy();
  });
});
