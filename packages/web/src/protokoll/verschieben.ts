import { Extension } from '@tiptap/react';
import { Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';

export type Richtung = 'hoch' | 'runter';

const istLeererAbsatz = (node: PmNode | null | undefined): boolean =>
  !!node && node.type.name === 'paragraph' && node.content.size === 0;

/**
 * Moves the block at `pos` one sibling up or down within its parent. At the edge of a section a block
 * of the section moves to the end of the previous / start of the next section; inside a Baustein's
 * notes it never leaves them. The empty paragraph that ends every section is no sibling to swap with.
 * Returns null when the move is impossible.
 */
export function blockVerschieben(
  state: EditorState,
  pos: number,
  richtung: Richtung,
): Transaction | null {
  const { doc } = state;
  const node = doc.nodeAt(pos);
  if (!node) return null;
  const $pos = doc.resolve(pos);
  const eltern = $pos.parent;
  const index = $pos.index();
  const imAbschnitt = eltern.type.name === 'abschnitt';
  const schlussAbsatz = imAbschnitt && istLeererAbsatz(eltern.lastChild);
  // The ending empty paragraph itself stays where it is.
  if (schlussAbsatz && index === eltern.childCount - 1) return null;
  // Index of the last real sibling.
  const letzter = eltern.childCount - 1 - (schlussAbsatz ? 1 : 0);
  const ende = pos + node.nodeSize;
  const abschnittTiefe = $pos.depth;

  let ziel: number;
  if (richtung === 'hoch') {
    if (index > 0) {
      ziel = pos - eltern.child(index - 1).nodeSize;
    } else {
      if (!imAbschnitt || eltern.childCount < 2) return null;
      const abschnittIndex = $pos.index(abschnittTiefe - 1);
      if (abschnittIndex === 0) return null;
      const davor = doc.child(abschnittIndex - 1);
      const davorPos = $pos.before(abschnittTiefe) - davor.nodeSize;
      const davorEnde = davorPos + davor.nodeSize - 1;
      ziel = istLeererAbsatz(davor.lastChild) ? davorEnde - davor.lastChild!.nodeSize : davorEnde;
    }
  } else if (index < letzter) {
    // After deletion the next sibling starts at `pos`.
    ziel = ende + eltern.child(index + 1).nodeSize - node.nodeSize;
  } else {
    if (!imAbschnitt || eltern.childCount < 2) return null;
    const abschnittIndex = $pos.index(abschnittTiefe - 1);
    if (abschnittIndex >= doc.childCount - 1) return null;
    ziel = $pos.after(abschnittTiefe) - node.nodeSize + 1;
  }

  const tr = state.tr;
  const { from, head } = state.selection;
  tr.delete(pos, ende);
  tr.insert(ziel, node);
  // Keep the cursor at the same place inside the moved block (or at its start if it was elsewhere).
  const innen = from >= pos && head <= ende;
  const neuePos = innen ? head - pos + ziel : ziel + 1;
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(neuePos, tr.doc.content.size)), 1));
  return tr.scrollIntoView();
}

/** Position of the block the cursor is in: top-level block of a section, or a block inside a Baustein's notes. */
export function blockBeiCursor(state: EditorState): number | null {
  const { $from } = state.selection;
  let tiefe = 2;
  for (let d = $from.depth; d >= 2; d--) {
    if ($from.node(d).type.name.startsWith('baustein')) {
      tiefe = d + 1;
      break;
    }
  }
  if ($from.depth < tiefe) return null;
  return $from.before(tiefe);
}

/** Alt+Arrow up / down moves the block at the cursor. */
export const BlockVerschieben = Extension.create({
  name: 'blockVerschieben',

  addKeyboardShortcuts() {
    const bewegen = (richtung: Richtung) => () => {
      const pos = blockBeiCursor(this.editor.state);
      if (pos === null) return true;
      const tr = blockVerschieben(this.editor.state, pos, richtung);
      if (tr) this.editor.view.dispatch(tr);
      return true;
    };
    return { 'Alt-ArrowUp': bewegen('hoch'), 'Alt-ArrowDown': bewegen('runter') };
  },
});
