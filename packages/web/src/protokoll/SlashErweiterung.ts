import { Extension, type Editor } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion } from '@tiptap/suggestion';
import {
  bausteinEinfuegen,
  ausserhalbBaustein,
  imVerschachtelbaren,
  slashErlaubt,
  zitatEinfuegen,
  type TextBereich,
} from './einfuegen';
import {
  anwesenheitPerson,
  slashEintraege,
  type SlashDaten,
  type SlashEintrag,
} from './slashLogik';
import type { SlashZustand } from './SlashPopup';

/** Plugin key of the slash menu (the @mention suggestion yields while it is open). */
export const SLASH_SCHLUESSEL = new PluginKey('slashBefehle');

/** What the editor component gives the extension (all callbacks read current values, they never go stale). */
export interface SlashSteuerung {
  daten: () => SlashDaten;
  zustand: (zustand: SlashZustand | null) => void;
  /** Opens the file picker for an image; `loeschen` is the typed "/bild", removed right away. */
  bild: (editor: Editor, loeschen: TextBereich) => void;
  /** Keyboard handling of the open menu; true = handled. */
  taste: (ereignis: KeyboardEvent) => boolean;
}

/**
 * Slash menu: "/" opens a list of Bausteine and "Zitat" that filters while typing. Only in a paragraph that lies
 * directly in a section or in the free text of a Baustein, or in a list item there (not in quotes). Spaces stay part of the query so the second
 * stage ("/event bar") works.
 */
export function slashErweiterung(steuerung: SlashSteuerung) {
  return Extension.create({
    name: 'slashBefehle',

    addProseMirrorPlugins() {
      return [
        Suggestion<SlashEintrag, SlashEintrag>({
          editor: this.editor,
          pluginKey: SLASH_SCHLUESSEL,
          char: '/',
          allowSpaces: true,
          startOfLine: false,
          allow: ({ editor, state, range }) =>
            editor.isEditable && slashErlaubt(state.doc.resolve(range.from)),
          items: ({ query, editor }) =>
            slashEintraege(
              query,
              steuerung.daten(),
              imVerschachtelbaren(editor.state),
              ausserhalbBaustein(editor.state),
            ),
          command: ({ editor, range, props }) => {
            if (props.aktion.art === 'weiter') {
              const text = `/${props.aktion.text}`;
              editor.commands.command(({ tr }) => {
                tr.insertText(text, range.from, range.to);
                return true;
              });
            } else if (props.aktion.art === 'zitat') {
              zitatEinfuegen(editor, range);
            } else if (props.aktion.art === 'bild') {
              steuerung.bild(editor, range);
            } else {
              bausteinEinfuegen(editor, props.aktion.wahl, range);
              const sub = anwesenheitPerson(props.aktion.wahl);
              if (sub) steuerung.daten().anwesenheit?.(sub);
            }
          },
          render: () => {
            const melden = (p: {
              items: SlashEintrag[];
              query: string;
              command: (e: SlashEintrag) => void;
              clientRect?: (() => DOMRect | null) | null;
            }) =>
              steuerung.zustand({
                eintraege: p.items,
                query: p.query,
                waehlen: (index) => {
                  const eintrag = p.items[index];
                  if (eintrag) p.command(eintrag);
                },
                rect: p.clientRect,
              });
            return {
              onStart: melden,
              onUpdate: melden,
              onExit: () => steuerung.zustand(null),
              onKeyDown: ({ event }) => steuerung.taste(event),
            };
          },
        }),
      ];
    },
  });
}
