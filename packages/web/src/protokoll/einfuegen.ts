import { TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { BAUSTEIN_TYPEN, bausteinErzeugen, type ProtokollKnoten } from '@c4/shared';
import { ersterLeererFeld } from './bausteinLogik';
import type { BausteinWahl } from './slashLogik';

export interface TextBereich {
  from: number;
  to: number;
}

const bausteinNamen: readonly string[] = BAUSTEIN_TYPEN;

/**
 * Inserts a Baustein at the cursor (after deleting `loeschen`, e.g. the typed "/query") and focuses its
 * first empty field. The Baustein goes after the block the cursor is in; an empty paragraph is replaced;
 * inside a Baustein's free text it goes after that Baustein (no nesting). One transaction = one undo step.
 */
export function bausteinEinfuegen(
  editor: Editor,
  wahl: BausteinWahl,
  loeschen?: TextBereich,
): void {
  const { state, view } = editor;
  const tr = state.tr;
  if (loeschen) tr.delete(loeschen.from, loeschen.to);

  const position = tr.selection.from;
  const $pos = tr.doc.resolve(Math.min(position, tr.doc.content.size));

  // Innermost container (a section or a Baustein) around the cursor.
  let container = -1;
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name;
    if (name === 'abschnitt' || bausteinNamen.includes(name)) {
      container = d;
      break;
    }
  }

  let von: number;
  let bis: number;
  if (container === -1) {
    // No usable cursor (e.g. a selection spanning sections): end of the last section.
    von = bis = tr.doc.content.size - 1;
  } else if ($pos.node(container).type.name === 'abschnitt') {
    const blockDepth = container + 1;
    if ($pos.depth >= blockDepth) {
      const block = $pos.node(blockDepth);
      von = $pos.before(blockDepth);
      bis = $pos.after(blockDepth);
      if (!(block.type.name === 'paragraph' && block.content.size === 0)) von = bis;
    } else {
      von = bis = $pos.pos;
    }
  } else {
    // Inside a Baustein: after it.
    von = bis = $pos.after(container);
  }

  const json: ProtokollKnoten = bausteinErzeugen(wahl.typ, wahl.daten as never);
  const knoten = state.schema.nodeFromJSON(json);
  tr.replaceWith(von, bis, knoten);
  view.dispatch(tr.scrollIntoView());

  // The inserted node can have moved if the trailing-paragraph rule added nodes before it; find it by id.
  const id = (json.attrs as { id: string }).id;
  let pos = von;
  editor.state.doc.descendants((n, p) => {
    if (n.attrs.id === id) pos = p;
    return !bausteinNamen.includes(n.type.name);
  });
  fokusSetzen(editor, pos, ersterLeererFeld(wahl.typ, wahl.daten));
}

/**
 * Focuses the input marked `data-fokus="<ziel>"` of the Baustein at `pos`, or puts the cursor into its
 * free text for `ziel === 'text'`. The node view renders a moment after the transaction, so this retries
 * for a short while (timers, not animation frames: those pause in background tabs).
 */
export function fokusSetzen(editor: Editor, pos: number, ziel: string): void {
  let versuche = 0;
  const schritt = () => {
    if (editor.isDestroyed) return;
    if (ziel === 'text') {
      const knoten = editor.state.doc.nodeAt(pos);
      if (!knoten) return;
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos + 1))),
      );
      editor.view.focus();
      return;
    }
    const dom = editor.view.nodeDOM(pos);
    const feld =
      dom instanceof HTMLElement ? dom.querySelector<HTMLElement>(`[data-fokus="${ziel}"]`) : null;
    if (feld) {
      feld.focus();
      return;
    }
    if (versuche++ < 40) setTimeout(schritt, 30);
  };
  setTimeout(schritt, 0);
}

/**
 * Turns the paragraph at the cursor into a quote (after deleting `loeschen`, e.g. the typed "/query") and
 * keeps the cursor inside it. Unlike Bausteine this works wherever the cursor is, also in a Baustein's
 * free text. Already inside a quote: only deletes the query. One transaction = one undo step.
 */
export function zitatEinfuegen(editor: Editor, loeschen?: TextBereich): void {
  const kette = editor.chain().focus();
  if (loeschen) kette.deleteRange(loeschen);
  if (!editor.isActive('blockquote')) kette.setParagraph().wrapIn('blockquote');
  kette.scrollIntoView().run();
}
