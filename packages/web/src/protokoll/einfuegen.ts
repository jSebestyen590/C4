import type { Node as PmNode, ResolvedPos } from '@tiptap/pm/model';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import {
  BAUSTEIN_TYPEN,
  BILD_TYP,
  darfInNotizen,
  istBausteinInNotizen,
  istThema,
  istVerschachtelbar,
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
 * - Abstimmung, Meinungsbild, Wahl, Todo, Thema and erscheint / geht may also go into the free text of another
 *   Baustein: at the cursor's block there (an empty paragraph is replaced, else after the block). A Thema
 *   goes into the innermost Baustein that can hold others (a Thema inside a Thema, at any depth); inside
 *   an Abstimmung, Meinungsbild or Wahl they go after that one (votes hold no Bausteine).
 * - From a list item in such notes (also for a quote, see `listenStelle`) the Baustein stands in the list
 *   item instead of after the whole list, so the following items keep their level.
 */
interface Entfernen {
  von: number;
  bis: number;
  /** Put an empty paragraph there instead of just deleting (the range is all the content of its parent). */
  ersatz?: boolean;
}

/** `von`..`bis` is replaced by the Baustein; `entfernen` (before or after `von`) is an empty list item to clean up. */
export interface EinfuegeStelle {
  von: number;
  bis: number;
  entfernen?: Entfernen;
  /**
   * Position right behind the list item the block stands in: an empty item must follow there (the place
   * to continue typing), one is added unless the next sibling already is an empty item.
   */
  punktDanach?: number;
}

export function einfuegeStelle(
  doc: PmNode,
  position: number,
  typ: BausteinTyp | typeof BILD_TYP,
): EinfuegeStelle {
  const $pos = doc.resolve(Math.min(position, doc.content.size));
  const bild = typ === BILD_TYP;
  const verschachtelbar = bild || istVerschachtelbar(typ);

  // The container whose direct children we insert between: the section, or for a nestable type the
  // innermost Baustein that may hold it (not an Abstimmung / Meinungsbild / Wahl itself).
  let container = -1;
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name;
    if (name === 'abschnitt') {
      container = d;
      break;
    }
    // An image goes into the notes of every Baustein with free text (also the votes).
    if (
      verschachtelbar &&
      (bild
        ? bausteinNamen.includes(name) && name !== 'bausteinAnwesenheit'
        : darfInNotizen(name, typ))
    ) {
      container = d;
      break;
    }
  }

  // No usable cursor (e.g. a selection spanning sections): end of the last section.
  if (container === -1) {
    const ende = doc.content.size - 1;
    return { von: ende, bis: ende };
  }
  // From a list item inside the notes of a Baustein: into the list item (not after the whole list).
  if (!bild && $pos.node(container).type.name !== 'abschnitt') {
    const imPunkt = listenStelle($pos, container);
    if (imPunkt) return imPunkt;
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
  // (A top-level Thema: the empty list is cleaned up next to it, as before.)
  const ersetzt =
    bild ||
    istBausteinInNotizen(typ) ||
    (istThema(typ) && $pos.node(container).type.name !== 'abschnitt');
  if (leer.ganz && leer.liste === blockDepth && ersetzt) {
    return { von, bis }; // the list was only this item: the Baustein takes its place
  }
  return { ...stelle, entfernen: leer.bereich };
}

const LISTEN = ['bulletList', 'orderedList'];

/**
 * Where a block (Baustein or quote) goes when the cursor is in a paragraph that is a direct child of a list
 * item, so it stands in the list and the following items keep their level. `container`: depth of the
 * Baustein (or -1 for none) the list must belong to directly, else null (a vote between them).
 * - The paragraph is not the item's first child, or the item has text / further children: right after
 *   the paragraph, as a child of the same item (an empty later paragraph is replaced).
 * - The item is empty and has no other children: with a previous item in its list the block becomes the
 *   last child of that one (same level, below its text and sub list) and the empty item stays behind it.
 *   The first item of a NESTED list keeps its level: it becomes `listItem(empty paragraph, block)`
 *   (shown without bullet). The first item of a list in the notes: the block goes in front of the list
 *   (replaces it when the item was its only one).
 * Either way an empty item follows the block (`punktDanach`). Null: the cursor is not in such a paragraph.
 */
export function listenStelle($pos: ResolvedPos, container = -1): EinfuegeStelle | null {
  const d = $pos.depth;
  if (d < 2 || $pos.parent.type.name !== 'paragraph') return null;
  const punkt = d - 1;
  if ($pos.node(punkt).type.name !== 'listItem') return null;
  // The outermost list of the chain list > item > list > item ...; what holds it must be the container.
  let aussen = punkt - 1;
  while (aussen > 1 && $pos.node(aussen - 1).type.name === 'listItem') aussen -= 2;
  if (container !== -1 && aussen - 1 !== container) return null;

  const absatz = $pos.parent;
  const nach = $pos.after(d);
  const item = $pos.node(punkt);
  const punktDanach = $pos.after(punkt);
  if ($pos.index(punkt) > 0) {
    const leer = absatz.content.size === 0;
    return leer
      ? { von: $pos.before(d), bis: nach, punktDanach }
      : { von: nach, bis: nach, punktDanach };
  }
  if (absatz.content.size > 0 || item.childCount > 1) return { von: nach, bis: nach, punktDanach };

  const liste = $pos.node(punkt - 1);
  const index = $pos.index(punkt - 1);
  const itemVon = $pos.before(punkt);
  if (index > 0) {
    // End of the previous item's content; the empty item stays as the one behind the block.
    return { von: itemVon - 1, bis: itemVon - 1 };
  }
  if (punkt >= 2 && $pos.node(punkt - 2).type.name === 'listItem') {
    return { von: nach, bis: nach, punktDanach };
  }
  if (liste.childCount === 1) return { von: $pos.before(punkt - 1), bis: $pos.after(punkt - 1) };
  return {
    von: $pos.before(punkt - 1),
    bis: $pos.before(punkt - 1),
    entfernen: { von: itemVon, bis: $pos.after(punkt) },
  };
}

/** Where a quote goes at `position`: see `listenStelle`; null when the cursor is not in a list item. */
export function zitatStelle(doc: PmNode, position: number): EinfuegeStelle | null {
  return listenStelle(doc.resolve(Math.min(position, doc.content.size)));
}

/**
 * Replaces `stelle.von..bis` by `knoten` and removes `stelle.entfernen` (a range that can lie before or
 * after it; an `ersatz` one is replaced by `absatz`). Returns the position of the inserted node.
 */
export function stelleAnwenden(
  tr: Transaction,
  stelle: EinfuegeStelle,
  knoten: PmNode,
  absatz: PmNode,
): number {
  const start = tr.steps.length;
  tr.replaceWith(stelle.von, stelle.bis, knoten);
  const e = stelle.entfernen;
  if (e) {
    const m = tr.mapping.slice(start);
    const von = m.map(e.von, 1);
    const bis = m.map(e.bis, -1);
    if (e.ersatz) tr.replaceWith(von, bis, absatz);
    else tr.delete(von, bis);
  }
  const pos = tr.mapping.slice(start).map(stelle.von, -1);
  if (stelle.punktDanach !== undefined) {
    // A place to continue: an empty list item right behind the one holding the block.
    const danach = tr.mapping.slice(start).map(stelle.punktDanach, 1);
    const naechster = tr.doc.resolve(danach).nodeAfter;
    const leer =
      naechster?.type.name === 'listItem' &&
      naechster.childCount === 1 &&
      naechster.firstChild!.type.name === 'paragraph' &&
      naechster.firstChild!.content.size === 0;
    if (!leer) {
      const { listItem } = tr.doc.type.schema.nodes;
      tr.insert(danach, listItem!.create(null, absatz));
    }
  }
  return pos;
}

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

/** Whether the cursor is inside an Abstimmung or Meinungsbild (where neither of them can be inserted). */
export function imVerschachtelbaren(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if (istBausteinInNotizen($from.node(d).type.name)) return true;
  }
  return false;
}

/** Whether the cursor is at the top level of a section, in no Baustein (a Todo cannot be inserted there). */
export function ausserhalbBaustein(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if (bausteinNamen.includes($from.node(d).type.name)) return false;
  }
  return true;
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
  const eingefuegt = stelleAnwenden(
    tr,
    { von, bis, entfernen },
    knoten,
    state.schema.nodes.paragraph!.create(),
  );
  view.dispatch(tr.scrollIntoView());

  // The inserted node can have moved if the trailing-paragraph rule added nodes before it; find it by id
  // (also inside other Bausteine).
  const id = (json.attrs as { id: string }).id;
  let pos = eingefuegt;
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
      // In a list item: the next item (an empty one follows every block inserted from a list).
      const $ende = tr.doc.resolve(ende);
      if ($ende.parent.type.name === 'listItem') {
        const hinter = $ende.after();
        if (tr.doc.resolve(hinter).nodeAfter?.type.name === 'listItem') {
          tr.setSelection(TextSelection.near(tr.doc.resolve(hinter + 1)));
          editor.view.dispatch(tr.scrollIntoView());
          editor.view.focus();
          return;
        }
      }
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
 * free text and in list items. Already inside a quote: only deletes the query. One transaction = one undo step.
 */
export function zitatEinfuegen(editor: Editor, loeschen?: TextBereich): void {
  // In a list item the quote becomes a child of the list (see `listenStelle`), not a quote around the item's text.
  const { state, view } = editor;
  const tr = state.tr;
  if (loeschen) tr.delete(loeschen.from, loeschen.to);
  const stelle = zitatStelle(tr.doc, tr.selection.from);
  if (stelle) {
    const { blockquote, paragraph } = state.schema.nodes;
    const pos = stelleAnwenden(
      tr,
      stelle,
      blockquote!.create(null, paragraph!.create()),
      paragraph!.create(),
    );
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return;
  }
  const kette = editor.chain().focus();
  if (loeschen) kette.deleteRange(loeschen);
  if (!editor.isActive('blockquote')) kette.setParagraph().wrapIn('blockquote');
  kette.scrollIntoView().run();
}

/**
 * Enter on the empty last paragraph of a quote that stands in a list item: the paragraph goes and the cursor
 * continues in a sibling item behind the item holding the quote (the next one when it is empty, else a new
 * one), so the level stays. Null: not that situation (the default Enter applies).
 */
export function zitatInPunktVerlassen(state: EditorState): Transaction | null {
  const { $from, empty } = state.selection;
  const d = $from.depth;
  if (!empty || d < 3 || $from.parent.type.name !== 'paragraph' || $from.parent.content.size > 0) {
    return null;
  }
  const zitat = $from.node(d - 1);
  if (zitat.type.name !== 'blockquote' || $from.node(d - 2).type.name !== 'listItem') return null;
  if ($from.index(d - 1) !== zitat.childCount - 1) return null;
  const punktEnde = $from.after(d - 2);
  const tr = state.tr;
  // The empty paragraph goes; a quote that consisted only of it goes as well.
  if (zitat.childCount === 1) tr.delete($from.before(d - 1), $from.after(d - 1));
  else tr.delete($from.before(d), $from.after(d));
  const danach = tr.mapping.map(punktEnde);
  const naechster = tr.doc.resolve(danach).nodeAfter;
  const leer =
    naechster?.type.name === 'listItem' &&
    naechster.childCount === 1 &&
    naechster.firstChild!.content.size === 0;
  if (!leer) {
    const { listItem, paragraph } = state.schema.nodes;
    tr.insert(danach, listItem!.create(null, paragraph!.create()));
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(danach + 2)));
  return tr.scrollIntoView();
}
