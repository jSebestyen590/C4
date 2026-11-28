import { Extension } from '@tiptap/react';
import { Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Richtung } from './verschieben';

/** Depth of the innermost list item around the cursor, or null outside lists. */
function punktTiefe(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'listItem') return d;
  }
  return null;
}

/**
 * Moves the list item around the cursor (with its nested content) one place up or down among its siblings;
 * the cursor stays at the same place inside it. Null when it is already first / last (or the cursor is in no
 * list item).
 */
export function punktVerschieben(state: EditorState, richtung: Richtung): Transaction | null {
  const tiefe = punktTiefe(state);
  if (tiefe === null) return null;
  const { $from, head } = state.selection;
  const liste = $from.node(tiefe - 1);
  const index = $from.index(tiefe - 1);
  const nachbar = index + (richtung === 'hoch' ? -1 : 1);
  if (nachbar < 0 || nachbar >= liste.childCount) return null;
  const punkt = $from.node(tiefe);
  const pos = $from.before(tiefe);
  const ende = pos + punkt.nodeSize;
  const ziel =
    richtung === 'hoch'
      ? pos - liste.child(nachbar).nodeSize
      : ende - punkt.nodeSize + liste.child(nachbar).nodeSize;
  const tr = state.tr;
  tr.delete(pos, ende);
  tr.insert(ziel, punkt);
  tr.setSelection(Selection.near(tr.doc.resolve(head - pos + ziel), 1));
  return tr.scrollIntoView();
}

/** Ctrl/Cmd+Arrow up / down moves the list item at the cursor; outside of lists the keys keep their default. */
export const PunktVerschieben = Extension.create({
  name: 'punktVerschieben',

  addKeyboardShortcuts() {
    const bewegen = (richtung: Richtung) => () => {
      const { state, view } = this.editor;
      if (punktTiefe(state) === null) return false;
      const tr = punktVerschieben(state, richtung);
      if (tr) view.dispatch(tr);
      return true;
    };
    return { 'Mod-ArrowUp': bewegen('hoch'), 'Mod-ArrowDown': bewegen('runter') };
  },
});
