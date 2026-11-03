import { Extension, mergeAttributes, Node } from '@tiptap/react';
import { Plugin, PluginKey, Selection, type Transaction } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import { BAUSTEIN_TYPEN, PROTOKOLL_ABSCHNITTE, type ProtokollAbschnitt } from '@c4/shared';

// Document structure of the minutes: exactly three fixed sections, each holding text blocks and Bausteine.

export const ABSCHNITT_TITEL: Record<ProtokollAbschnitt, string> = {
  vergangenes: 'Vergangenes',
  gegenwaertiges: 'Gegenwärtiges',
  zukuenftiges: 'Zukünftiges',
};

const istAbschnittArt = (art: unknown): art is ProtokollAbschnitt =>
  (PROTOKOLL_ABSCHNITTE as readonly string[]).includes(art as string);

/** The document is exactly the three sections. */
export const ProtokollDokumentKnoten = Node.create({
  name: 'doc',
  topNode: true,
  content: 'abschnitt{3}',
});

/**
 * One fixed section. Its heading is rendered by `renderHTML` outside of the content hole, so it is not
 * part of the text. `isolating` keeps joins (Backspace/Delete at a boundary) and lifts from crossing it.
 */
export const AbschnittKnoten = Node.create({
  name: 'abschnitt',
  content: 'block+',
  isolating: true,
  selectable: false,
  draggable: false,
  defining: true,

  addAttributes() {
    return {
      art: {
        default: 'vergangenes',
        parseHTML: (el) => el.getAttribute('data-art'),
        renderHTML: (attrs) => ({ 'data-art': attrs.art as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-art]', contentElement: '.protokoll-abschnitt-inhalt' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const art = node.attrs.art as unknown;
    return [
      'section',
      mergeAttributes(HTMLAttributes, { class: 'protokoll-abschnitt' }),
      [
        'div',
        {
          class: 'protokoll-abschnitt-titel',
          contenteditable: 'false',
          role: 'heading',
          'aria-level': '2',
        },
        istAbschnittArt(art) ? ABSCHNITT_TITEL[art] : '',
      ],
      ['div', { class: 'protokoll-abschnitt-inhalt' }, 0],
    ];
  },
});

/** Whether the document still has the three sections in the fixed order. */
export function abschnitteIntakt(doc: PmNode): boolean {
  if (doc.childCount !== PROTOKOLL_ABSCHNITTE.length) return false;
  for (let i = 0; i < doc.childCount; i++) {
    const kind = doc.child(i);
    if (kind.type.name !== 'abschnitt' || kind.attrs.art !== PROTOKOLL_ABSCHNITTE[i]) return false;
  }
  return true;
}

/** Adds an empty paragraph to every section that does not end with a text block. Returns whether it did. */
export function absatzAmEndeEinfuegen(tr: Transaction): boolean {
  const stellen: number[] = [];
  tr.doc.forEach((abschnitt, abschnittPos) => {
    if (!abschnitt.lastChild?.isTextblock) stellen.push(abschnittPos + abschnitt.nodeSize - 1);
  });
  // Bottom up, so the earlier positions stay valid.
  for (const pos of stellen.sort((a, b) => b - a)) {
    tr.insert(pos, tr.doc.type.schema.nodes.paragraph!.create());
  }
  return stellen.length > 0;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bausteinNamen = new Set<string>(BAUSTEIN_TYPEN);
const key = new PluginKey('protokollAbsicherung');

/**
 * Safeguards of the structure:
 * - Backspace/Delete over a selection that spans sections only empties them (`addKeyboardShortcuts`).
 * - `filterTransaction` rejects every change that would remove, merge, reorder or re-label a section
 *   (Backspace/Delete at a boundary, select-all + delete, paste over several sections).
 * - `appendTransaction` keeps an empty paragraph at the end of every section (a place to type after a
 *   Baustein) and gives Bausteine a fresh id when it is missing or duplicated (copy and paste).
 */
export const ProtokollAbsicherung = Extension.create({
  name: 'protokollAbsicherung',

  addKeyboardShortcuts() {
    // A selection over several sections (select all) is deleted section by section, so the sections
    // survive and just lose the selected content.
    const loeschen = () =>
      this.editor.commands.command(({ state, tr, dispatch }) => {
        const { from, to, empty } = state.selection;
        if (empty || state.doc.resolve(from).index(0) === state.doc.resolve(to).index(0))
          return false;
        const bereiche: [number, number][] = [];
        state.doc.forEach((abschnitt, pos) => {
          const von = Math.max(from, pos + 1);
          const bis = Math.min(to, pos + abschnitt.nodeSize - 1);
          if (von < bis) bereiche.push([von, bis]);
        });
        // Bottom up, so the earlier positions stay valid.
        for (const [von, bis] of bereiche.reverse()) tr.delete(von, bis);
        tr.setSelection(Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size))));
        dispatch?.(tr.scrollIntoView());
        return true;
      });
    return { Backspace: loeschen, Delete: loeschen };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        filterTransaction: (tr) => !tr.docChanged || abschnitteIntakt(tr.doc),
        appendTransaction: (transactions, _alt, state) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = state.tr;
          const gesehen = new Set<string>();
          state.doc.descendants((node, pos) => {
            if (!bausteinNamen.has(node.type.name)) return;
            const id: unknown = node.attrs.id;
            if (typeof id === 'string' && GUID.test(id) && !gesehen.has(id)) {
              gesehen.add(id);
              return;
            }
            const neu = globalThis.crypto.randomUUID();
            gesehen.add(neu);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: neu });
          });
          absatzAmEndeEinfuegen(tr);
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
