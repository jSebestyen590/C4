import type { Node as PmNode, ResolvedPos } from '@tiptap/pm/model';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import {
  BAUSTEIN_TYPEN,
  istBausteinInNotizen,
  type BausteinTyp,
  type ProtokollKnoten,
} from '@c4/shared';
import { bausteinNeu, ersterLeererFeld } from './bausteinLogik';
import type { BausteinWahl } from './slashLogik';

export interface TextBereich {
  from: number;
  to: number;
}

const bausteinNamen: readonly string[] = BAUSTEIN_TYPEN;

/**
 * Where a Baustein of type `typ` goes when the cursor is at `position`: a range in the document
 * (`von` = `bis` inserts, otherwise the range, an empty paragraph, is replaced).
 * - Most Bausteine are top level: after the block of the section the cursor is in (an empty paragraph is
 *   replaced); inside a Baustein's free text that means after that Baustein (no nesting).
 * - Abstimmung and Meinungsbild may also go into the free text of another Baustein: at the cursor's
 *   block there (an empty paragraph is replaced, else after the block). Inside an Abstimmung or
 *   Meinungsbild they go after that one (they do not nest in each other).
 */
interface Entfernen {
  von: number;
  bis: number;
  /** Put an empty paragraph there instead of just deleting (the range is all the content of its parent). */
  ersatz?: boolean;
}

/** `von`..`bis` is replaced by the Baustein; `entfernen` (before `von`) is an empty list item to clean up. */
export interface EinfuegeStelle {
  von: number;
  bis: number;
  entfernen?: Entfernen;
}

export function einfuegeStelle(doc: PmNode, position: number, typ: BausteinTyp): EinfuegeStelle {
  const $pos = doc.resolve(Math.min(position, doc.content.size));
  const verschachtelbar = istBausteinInNotizen(typ);

  // The container whose direct children we insert between: the section, or for a nestable type the
  // innermost Baustein that is not an Abstimmung / Meinungsbild itself.
  let container = -1;
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name;
    if (name === 'abschnitt') {
      container = d;
      break;
    }
    if (verschachtelbar && bausteinNamen.includes(name) && !istBausteinInNotizen(name)) {
      container = d;
      break;
    }
  }

  // No usable cursor (e.g. a selection spanning sections): end of the last section.
  if (container === -1) {
    const ende = doc.content.size - 1;
    return { von: ende, bis: ende };
  }
  const blockDepth = container + 1;
  if ($pos.depth < blockDepth) return { von: $pos.pos, bis: $pos.pos };
  const block = $pos.node(blockDepth);
  const von = $pos.before(blockDepth);
  const bis = $pos.after(blockDepth);
  const stelle =
    block.type.name === 'paragraph' && block.content.size === 0 ? { von, bis } : { von: bis, bis };
  const leer = leerenListenpunkt($pos);
  if (!leer) return stelle;
  // The cursor sits in an empty last list item (the typed "/query" is gone): the item goes away.
  if (leer.ganz && leer.liste === blockDepth && verschachtelbar) {
    return { von, bis }; // the list was only this item: the Baustein takes its place
  }
  return { ...stelle, entfernen: leer.bereich };
}

const LISTEN = ['bulletList', 'orderedList'];

/**
 * The empty last list item the cursor is in, with what to remove: the item, or its (nested) list if it
 * is the only item, or the whole outermost list (replaced by an empty paragraph when it is the only
 * content of its parent). `liste` = depth of the outermost list. Null: not such an item.
 */
function leerenListenpunkt(
  $pos: ResolvedPos,
): { liste: number; ganz: boolean; bereich: Entfernen } | null {
  // The item: the paragraph is its only child, empty, and the item is last in its list.
  let punkt = -1;
  for (let d = $pos.depth - 1; d > 0; d--) {
    if ($pos.node(d).type.name === 'listItem') {
      punkt = d;
      break;
    }
    if (!LISTEN.includes($pos.node(d).type.name)) break;
  }
  if (punkt === -1 || $pos.depth !== punkt + 1) return null;
  const absatz = $pos.parent;
  if (absatz.type.name !== 'paragraph' || absatz.content.size !== 0) return null;
  if ($pos.node(punkt).childCount !== 1) return null;
  if ($pos.index(punkt - 1) !== $pos.node(punkt - 1).childCount - 1) return null;

  // Outermost list of the chain list > item > list > item ...
  let aussen = punkt - 1;
  while (aussen - 2 > 0 && $pos.node(aussen - 1).type.name === 'listItem') aussen -= 2;
  const liste = $pos.node(punkt - 1);
  if (liste.childCount > 1) {
    return {
      liste: aussen,
      ganz: false,
      bereich: { von: $pos.before(punkt), bis: $pos.after(punkt) },
    };
  }
  if (punkt - 1 > aussen) {
    // Nested list with only this item: the list goes, the parent item keeps its text.
    return {
      liste: aussen,
      ganz: false,
      bereich: { von: $pos.before(punkt - 1), bis: $pos.after(punkt - 1) },
    };
  }
  return {
    liste: aussen,
    ganz: true,
    bereich: {
      von: $pos.before(aussen),
      bis: $pos.after(aussen),
      ersatz: $pos.node(aussen - 1).childCount === 1,
    },
  };
}

/**
 * Whether the slash menu may open at `$pos`: in a paragraph that lies directly in a section or in the
 * free text of a Baustein, or in a list item of a list there (nested lists too). Not in quotes.
 */
export function slashErlaubt($pos: ResolvedPos): boolean {
  if ($pos.parent.type.name !== 'paragraph' || $pos.depth < 1) return false;
  let d = $pos.depth - 1;
  if ($pos.node(d).type.name === 'listItem') {
    while (
      d > 0 &&
      ($pos.node(d).type.name === 'listItem' || LISTEN.includes($pos.node(d).type.name))
    )
      d--;
  }
  const aussen = $pos.node(d).type.name;
  return aussen === 'abschnitt' || bausteinNamen.includes(aussen);
}

/** Whether the cursor is in a list (the quote entry is not offered there). */
export function imListenpunkt(state: EditorState): boolean {
  const { $from } = state.selection;
  return $from.depth >= 2 && $from.node($from.depth - 1).type.name === 'listItem';
}

/** Whether the cursor is inside an Abstimmung or Meinungsbild (where neither of them can be inserted). */
export function imVerschachtelbaren(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if (istBausteinInNotizen($from.node(d).type.name)) return true;
  }
  return false;
}

/**
 * Inserts a Baustein at the cursor (after deleting `loeschen`, e.g. the typed "/query") and focuses its
 * first empty field; see `einfuegeStelle` for the position. One transaction = one undo step.
 */
export function bausteinEinfuegen(
  editor: Editor,
  wahl: BausteinWahl,
  loeschen?: TextBereich,
): void {
  const { state, view } = editor;
  const tr = state.tr;
  if (loeschen) tr.delete(loeschen.from, loeschen.to);

  const { von, bis, entfernen } = einfuegeStelle(tr.doc, tr.selection.from, wahl.typ);
  const json: ProtokollKnoten = bausteinNeu(wahl.typ, wahl.daten);
  const knoten = state.schema.nodeFromJSON(json);
  tr.replaceWith(von, bis, knoten);
  // Before the insertion point, so the positions above stay valid.
  if (entfernen?.ersatz) {
    tr.replaceWith(entfernen.von, entfernen.bis, state.schema.nodes.paragraph!.create());
  } else if (entfernen) {
    tr.delete(entfernen.von, entfernen.bis);
  }
  view.dispatch(tr.scrollIntoView());

  // The inserted node can have moved if the trailing-paragraph rule added nodes before it; find it by id
  // (also inside other Bausteine).
  const id = (json.attrs as { id: string }).id;
  let pos = von;
  let gefunden = false;
  editor.state.doc.descendants((n, p) => {
    if (gefunden) return false;
    if (n.attrs.id === id) {
      pos = p;
      gefunden = true;
      return false;
    }
    return true;
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
    if (ziel === 'nach') {
      const knoten = editor.state.doc.nodeAt(pos);
      if (!knoten) return;
      const ende = Math.min(pos + knoten.nodeSize, editor.state.doc.content.size);
      const tr = editor.state.tr;
      // Behind the block: its next paragraph, or a new one if something else follows.
      if (!tr.doc.resolve(ende).nodeAfter?.isTextblock) {
        tr.insert(ende, editor.state.schema.nodes.paragraph!.create());
      }
      tr.setSelection(TextSelection.near(tr.doc.resolve(ende + 1), -1));
      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      return;
    }
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
