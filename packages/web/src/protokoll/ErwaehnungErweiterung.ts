import { Extension } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion } from '@tiptap/suggestion';
import { ERWAEHNUNG_TYP } from '@c4/shared';
import {
  erwaehnungEintraege,
  erwaehnungErlaubt,
  type ErwaehnungEintrag,
  type ErwaehnungPerson,
} from './erwaehnungLogik';
import { SLASH_SCHLUESSEL, type SlashSteuerung } from './SlashErweiterung';

/** Plugin key of the @mention suggestion. */
export const ERWAEHNUNG_SCHLUESSEL = new PluginKey('erwaehnungVorschlag');

/** What the editor component gives the extension (reads current values, never stale). */
export interface ErwaehnungSteuerung {
  /** The members that can be mentioned. */
  personen: () => readonly ErwaehnungPerson[];
  zustand: SlashSteuerung['zustand'];
  taste: SlashSteuerung['taste'];
}

/**
 * "@" opens a list of groups and members that filters while typing; choosing one inserts an
 * `erwaehnung` node. Only in paragraphs (free text), and not while the slash menu is open (so
 * "/event @x" stays one query of the slash menu). It runs after the slash menu (lower priority).
 */
export function erwaehnungErweiterung(steuerung: ErwaehnungSteuerung) {
  return Extension.create({
    name: 'erwaehnungVorschlag',
    // Lower than the slash menu (100): its plugin state must be computed before this one reads it.
    priority: 90,

    addProseMirrorPlugins() {
      return [
        Suggestion<ErwaehnungEintrag, ErwaehnungEintrag>({
          editor: this.editor,
          pluginKey: ERWAEHNUNG_SCHLUESSEL,
          char: '@',
          allowSpaces: false,
          startOfLine: false,
          allow: ({ editor, state, range }) =>
            editor.isEditable &&
            erwaehnungErlaubt(state.doc.resolve(range.from).parent.type.name) &&
            !(SLASH_SCHLUESSEL.getState(state) as { active?: boolean } | undefined)?.active,
          items: ({ query }) => erwaehnungEintraege(query, steuerung.personen()),
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: ERWAEHNUNG_TYP, attrs: props.attrs },
                { type: 'text', text: ' ' },
              ])
              .run();
          },
          render: () => {
            const melden = (p: {
              items: ErwaehnungEintrag[];
              query: string;
              command: (e: ErwaehnungEintrag) => void;
              clientRect?: (() => DOMRect | null) | null;
            }) =>
              steuerung.zustand({
                eintraege: p.items,
                query: p.query,
                bezeichnung: 'Erwähnungen',
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
