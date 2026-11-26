import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import {
  BAUSTEIN_TYPEN,
  istMerker,
  PROTOKOLL_ABSCHNITTE,
  eventUeberschrift,
  darfInNotizen,
  istNurInNotizen,
  istVerschachtelbar,
  kannBausteineEnthalten,
  vergangenesUeberschrift,
  type BausteinAnwaerterDaten,
  type BausteinAnwesenheitDaten,
  type BausteinAufnahmeDaten,
  type BausteinBeschlussDaten,
  type BausteinEmDaten,
  type BausteinEventDaten,
  type BausteinMeinungsbildDaten,
  type BausteinTyp,
  type BausteinVergangenesEventDaten,
  type BausteinWahlDaten,
  type ProtokollAbschnitt,
} from '@c4/shared';
import { bausteinKategorie, type KategorieNamen } from './kategorieNamen';
import { BAUSTEIN_TITEL, bausteinSymbol } from './symbole';
import type { SlashSymbol } from './slashLogik';
import { ABSCHNITT_TITEL } from './schema';

// Outline ("Gliederung") of the minutes: the Bausteine per section, and moving one of them (no React).

export interface GliederungEintrag {
  id: string;
  typ: BausteinTyp;
  titel: string;
  /** Icon of the entry (Anwesenheit: "erscheint" or "geht"). */
  symbol: SlashSymbol;
  /** Whether the Baustein may stand in the notes of another Baustein (Abstimmung, Meinungsbild, Wahl, Thema). */
  verschachtelbar: boolean;
  /** Whether other Bausteine may stand in its notes. */
  kannEnthalten: boolean;
  /** Bausteine in its notes (a Thema holds Themen: any depth). */
  kinder: GliederungEintrag[];
}

export interface GliederungAbschnitt {
  art: ProtokollAbschnitt;
  titel: string;
  eintraege: GliederungEintrag[];
}

const istBaustein = (node: PmNode): boolean =>
  (BAUSTEIN_TYPEN as readonly string[]).includes(node.type.name);

/**
 * The place of the document view that belongs to the cursor at `pos`: the id of the innermost Baustein
 * around it, else `abschnitt:<art>` of the section. A Merker is not part of the document: the nearest
 * Baustein before it counts instead. Null if there is nothing.
 */
export function aktiveStelleId(doc: PmNode, pos: number): string | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  let eigene: PmNode | null = null;
  let eigenePos = 0;
  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d);
    if (istBaustein(n)) {
      eigene = n;
      eigenePos = $pos.before(d);
      break;
    }
  }
  const abschnitt = $pos.depth > 0 ? $pos.node(1) : null;
  const abschnittId =
    abschnitt?.type.name === 'abschnitt' ? `abschnitt:${String(abschnitt.attrs.art)}` : null;
  if (!eigene) return abschnittId;
  if (!istMerker(eigene.type.name)) return String(eigene.attrs.id);
  // Merker: the last visible Baustein that starts before it.
  let davor: string | null = null;
  doc.descendants((node, p) => {
    if (p >= eigenePos) return false;
    if (istBaustein(node) && !istMerker(node.type.name)) davor = String(node.attrs.id);
    return true;
  });
  return davor ?? abschnittId;
}

const TITEL_LAENGE = 80;
const kurz = (text: string): string => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > TITEL_LAENGE ? `${t.slice(0, TITEL_LAENGE - 1)}…` : t;
};
const mit = (praefix: string, text: string): string => {
  const t = kurz(text);
  return t ? `${praefix}: ${t}` : praefix;
};

/** Short title of a Baustein; `personName` resolves a `sub` to the name shown for a person. */
export function gliederungTitel(
  typ: BausteinTyp,
  daten: unknown,
  personName: (sub: string) => string | undefined = () => undefined,
  kategorien?: KategorieNamen,
  /** The free text of the Baustein (the Merker is titled by its beginning). */
  text = '',
): string {
  const d = (daten ?? {}) as Record<string, unknown>;
  const person = (sub: unknown, name: unknown): string =>
    (typeof sub === 'string' ? personName(sub) : undefined) ??
    (typeof name === 'string' ? name : '');
  switch (typ) {
    case 'bausteinEvent':
      return (
        kurz(
          eventUeberschrift({
            ...(d as unknown as BausteinEventDaten),
            kategorie: bausteinKategorie(typ, d, kategorien),
          }),
        ) || BAUSTEIN_TITEL[typ]
      );
    case 'bausteinThema':
      return kurz(String(d.titel ?? '')) || BAUSTEIN_TITEL[typ];
    case 'bausteinVergangenesEvent':
      return (
        kurz(
          vergangenesUeberschrift({
            ...(d as unknown as BausteinVergangenesEventDaten),
            kategorie: bausteinKategorie(typ, d, kategorien),
          }),
        ) || BAUSTEIN_TITEL[typ]
      );
    case 'bausteinAnwaerter': {
      const a = d as unknown as BausteinAnwaerterDaten;
      return kurz(`${a.vorname ?? ''} ${a.nachname ?? ''}`) || BAUSTEIN_TITEL[typ];
    }
    case 'bausteinMerker':
      return mit(BAUSTEIN_TITEL[typ], text);
    case 'bausteinTodo':
      return mit(BAUSTEIN_TITEL[typ], String(d.titel ?? ''));
    case 'bausteinBeschluss':
      return mit(BAUSTEIN_TITEL[typ], (d as unknown as BausteinBeschlussDaten).antrag ?? '');
    case 'bausteinMeinungsbild':
      return mit(BAUSTEIN_TITEL[typ], (d as unknown as BausteinMeinungsbildDaten).frage ?? '');
    case 'bausteinAuswahl':
      return mit('Abstimmung', String(d.frage ?? ''));
    case 'bausteinWahl':
      return mit(BAUSTEIN_TITEL[typ], (d as unknown as BausteinWahlDaten).posten ?? '');
    case 'bausteinAufnahme': {
      const a = d as unknown as BausteinAufnahmeDaten;
      return mit(BAUSTEIN_TITEL[typ], person(a.sub, a.name));
    }
    case 'bausteinEm': {
      const e = d as unknown as BausteinEmDaten;
      return mit(BAUSTEIN_TITEL[typ], person(e.sub, e.name));
    }
    case 'bausteinAnwesenheit': {
      const a = d as unknown as BausteinAnwesenheitDaten;
      const wort = a.art === 'geht' ? 'geht' : 'erscheint';
      const name = person(a.sub, a.name);
      return name ? kurz(`${name} ${wort}`) : wort === 'geht' ? 'Geht' : 'Erscheint';
    }
  }
}

interface Unterbaustein {
  node: PmNode;
  /** Position of the Baustein. */
  pos: number;
  /** Position and end of the child of the parent it belongs to (the list holding it, if it is in a list item). */
  blockPos: number;
  blockEnde: number;
}

/**
 * The Bausteine directly below `eltern` (a section or Baustein) in document order: its children, and
 * those in its list items and sub lists (a Baustein inserted from a list item); not the ones inside
 * other Bausteine. `ausser` (and what it holds) is left out.
 */
function bausteineUnter(eltern: PmNode, elternPos = 0, ausser?: PmNode): Unterbaustein[] {
  const liste: Unterbaustein[] = [];
  const sammeln = (knoten: PmNode, pos: number, block?: { pos: number; ende: number }): void => {
    knoten.forEach((kind, offset) => {
      const kindPos = pos + 1 + offset;
      const b = block ?? { pos: kindPos, ende: kindPos + kind.nodeSize };
      if (istBaustein(kind)) {
        if (kind !== ausser)
          liste.push({ node: kind, pos: kindPos, blockPos: b.pos, blockEnde: b.ende });
      } else if (!kind.isTextblock && !kind.isAtom) {
        sammeln(kind, kindPos, b);
      }
    });
  };
  sammeln(eltern, elternPos);
  return liste;
}

function eintrag(
  node: PmNode,
  personName: (sub: string) => string | undefined,
  kategorien?: KategorieNamen,
): GliederungEintrag {
  const typ = node.type.name as BausteinTyp;
  const kinder: GliederungEintrag[] = [];
  for (const kind of bausteineUnter(node)) kinder.push(eintrag(kind.node, personName, kategorien));
  return {
    id: node.attrs.id as string,
    typ,
    titel: gliederungTitel(typ, node.attrs.daten, personName, kategorien, node.textContent),
    symbol: bausteinSymbol(typ, node.attrs.daten),
    verschachtelbar: istVerschachtelbar(typ),
    // Attendance is a leaf (no notes); Abstimmung/Meinungsbild/Wahl hold text only.
    kannEnthalten: kannBausteineEnthalten(typ) && !node.type.isLeaf,
    kinder,
  };
}

/** The entry and all entries below it, depth first. */
const mitNachfahren = (e: GliederungEintrag): GliederungEintrag[] => [
  e,
  ...e.kinder.flatMap(mitNachfahren),
];

/** The three sections with their Bausteine in document order (free text is left out). */
export function gliederungBauen(
  doc: PmNode,
  personName?: (sub: string) => string | undefined,
  kategorien?: KategorieNamen,
): GliederungAbschnitt[] {
  const name = personName ?? (() => undefined);
  return PROTOKOLL_ABSCHNITTE.map((art, i) => {
    const eintraege: GliederungEintrag[] = [];
    const abschnitt = doc.maybeChild(i);
    if (abschnitt)
      for (const kind of bausteineUnter(abschnitt))
        eintraege.push(eintrag(kind.node, name, kategorien));
    return { art, titel: ABSCHNITT_TITEL[art], eintraege };
  });
}

/**
 * Where a Baustein goes: into a section or into the notes of another Baustein, as the `index`-th
 * Baustein of that list (counted without the moved one; `index` = length puts it last).
 */
export type GliederungZiel =
  { abschnitt: number; index: number } | { elternId: string; index: number };

/** A row of the flat outline list (one Droppable): section header, Baustein, nested Baustein or notes slot. */
export type GliederungZeile =
  | { art: 'abschnitt'; key: string; abschnitt: number; titel: string }
  | { art: 'baustein'; key: string; abschnitt: number; eintrag: GliederungEintrag }
  | {
      art: 'kind';
      key: string;
      abschnitt: number;
      elternId: string;
      /** Ids of all ancestors, the outermost first (`elternId` is the last). */
      pfad: string[];
      /** Nesting depth: 1 = in the notes of a top-level Baustein, 2 = in a Thema in there, ... */
      tiefe: number;
      eintrag: GliederungEintrag;
      /** Rendered with zero height (an ancestor is being dragged). */
      eingeklappt: boolean;
    }
  | {
      art: 'notizen';
      key: string;
      abschnitt: number;
      elternId: string;
      /** Ids of all ancestors of the slot, the outermost first (`elternId` is the last). */
      pfad: string[];
      /** Depth of the Bausteine the slot takes (like `tiefe` of a `kind`). */
      tiefe: number;
      /** Rendered with zero height (nothing nestable is dragged, or the slot is inside the dragged one). */
      eingeklappt: boolean;
    };

/**
 * The flat rows of the outline, depth first. The set of rows is constant (pangea does not allow adding
 * or removing Draggables during a drag): every nested Baustein and every notes slot is always there.
 * Rows that are not usable are flagged `eingeklappt` (rendered with zero height): everything below the
 * Baustein `gezogenId` being dragged (nested rows and notes slots; a Baustein cannot go into itself or
 * its descendants), and all notes slots unless a nestable Baustein is dragged.
 */
export function gliederungZeilen(
  baum: GliederungAbschnitt[],
  gezogenId: string | null = null,
): GliederungZeile[] {
  const alle = baum.flatMap((a) => a.eintraege.flatMap(mitNachfahren));
  const gezogen = gezogenId ? alle.find((e) => e.id === gezogenId) : undefined;
  const zeilen: GliederungZeile[] = [];

  // The rows below `e` (its nested Bausteine, then its notes slot); `pfad` = the ancestors of `e`.
  const unterhalb = (e: GliederungEintrag, abschnitt: number, tiefe: number, pfad: string[]) => {
    const voll = [...pfad, e.id];
    for (const k of e.kinder) {
      zeilen.push({
        art: 'kind',
        key: k.id,
        abschnitt,
        elternId: e.id,
        pfad: voll,
        tiefe: tiefe + 1,
        eintrag: k,
        eingeklappt: gezogenId !== null && voll.includes(gezogenId),
      });
      unterhalb(k, abschnitt, tiefe + 1, voll);
    }
    if (e.kannEnthalten)
      zeilen.push({
        art: 'notizen',
        key: `notizen:${e.id}`,
        abschnitt,
        elternId: e.id,
        pfad: voll,
        tiefe: tiefe + 1,
        eingeklappt: !gezogen?.verschachtelbar || (gezogenId !== null && voll.includes(gezogenId)),
      });
  };

  baum.forEach((a, i) => {
    zeilen.push({ art: 'abschnitt', key: `abschnitt:${i}`, abschnitt: i, titel: a.titel });
    for (const e of a.eintraege) {
      zeilen.push({ art: 'baustein', key: e.id, abschnitt: i, eintrag: e });
      unterhalb(e, i, 0, []);
    }
  });
  return zeilen;
}

/**
 * Target of dropping the row `gezogenId` at the flat index `index` of `zeilen` (the full, constant list; `index` is the final position of the dragged row). Looks at the rows directly above and
 * below the dropped row:
 * - below is a nested row or a notes slot of a parent (any depth) and the dragged Baustein is nestable:
 *   nested into that parent, before that nested row (at the end for the slot);
 * - otherwise top-level in the section of the row above (a section header: first position), before the
 *   next top-level Baustein; a non-nestable one dropped above a nested row goes right behind its
 *   top-level ancestor.
 * Rows inside the dragged Baustein are collapsed, so it can never land in itself or its descendants.
 */
export function gliederungZiel(
  zeilen: GliederungZeile[],
  gezogenId: string,
  index: number,
): GliederungZiel | null {
  const gezogen = zeilen.find(
    (z) => z.art !== 'abschnitt' && z.art !== 'notizen' && z.key === gezogenId,
  );
  if (gezogen?.art !== 'baustein' && gezogen?.art !== 'kind') return null;
  const rest = zeilen.filter((z) => z !== gezogen);
  const pos = Math.max(0, Math.min(index, rest.length));
  // Collapsed rows do not exist for the target; `index` still counts them.
  const unten = rest.slice(pos).find((z) => !('eingeklappt' in z && z.eingeklappt));
  const oben = rest[pos - 1];

  if (unten && (unten.art === 'kind' || unten.art === 'notizen')) {
    if (gezogen.eintrag.verschachtelbar) {
      if (unten.pfad.includes(gezogenId)) return null;
      const geschwister = rest.filter(
        (z) => z.art === 'kind' && !z.eingeklappt && z.elternId === unten.elternId,
      );
      const n = unten.art === 'kind' ? geschwister.indexOf(unten) : geschwister.length;
      return { elternId: unten.elternId, index: n };
    }
    // Not nestable: top-level directly behind the outermost ancestor (a Todo cannot go there).
    if (istNurInNotizen(gezogen.eintrag.typ)) return null;
    const elternPos = rest.findIndex((z) => z.art === 'baustein' && z.key === unten.pfad[0]);
    if (elternPos < 0) return null;
    return {
      abschnitt: unten.abschnitt,
      index: rest
        .slice(0, elternPos + 1)
        .filter((z) => z.art === 'baustein' && z.abschnitt === unten.abschnitt).length,
    };
  }
  // Top level: not for a Todo, which only stands in the notes of another Baustein.
  if (istNurInNotizen(gezogen.eintrag.typ)) return null;
  const abschnitt = oben?.abschnitt ?? 0;
  return {
    abschnitt,
    index: rest.slice(0, pos).filter((z) => z.art === 'baustein' && z.abschnitt === abschnitt)
      .length,
  };
}

interface Fund {
  node: PmNode;
  pos: number;
}

export function findeBaustein(doc: PmNode, id: string): Fund | null {
  let fund: Fund | null = null;
  doc.descendants((node, pos) => {
    if (fund) return false;
    if (istBaustein(node) && node.attrs.id === id) {
      fund = { node, pos };
      return false;
    }
    // Also into lists (a Baustein can stand in a list item), not into text.
    return !node.isTextblock && !node.isAtom;
  });
  return fund;
}

const istLeererAbsatz = (node: PmNode | null | undefined): boolean =>
  !!node && node.type.name === 'paragraph' && node.content.size === 0;

/**
 * Moves the Baustein `id` to `ziel` as one transaction (insert, then delete), so undo restores it in one
 * step. Returns null when the move is not allowed or changes nothing. A Baustein goes directly before
 * the `index`-th Baustein of the target list, else behind the last one; without any Baustein to the end
 * of the target (before its trailing empty paragraph).
 */
export function bausteinInGliederungVerschieben(
  state: EditorState,
  id: string,
  ziel: GliederungZiel,
): Transaction | null {
  const ergebnis = bausteinVerschiebenErgebnis(state, id, ziel);
  return ergebnis === 'unveraendert' ? null : ergebnis;
}

/**
 * Like `bausteinInGliederungVerschieben`, but tells "nothing would change" (`'unveraendert'`, no error
 * for the user) apart from "not allowed" (null).
 */
export function bausteinVerschiebenErgebnis(
  state: EditorState,
  id: string,
  ziel: GliederungZiel,
): Transaction | 'unveraendert' | null {
  const { doc } = state;
  const quelle = findeBaustein(doc, id);
  if (!quelle) return null;
  const von = quelle.pos;
  const bis = von + quelle.node.nodeSize;

  let eltern: PmNode;
  let elternPos: number;
  if ('abschnitt' in ziel) {
    // A Todo only stands in the notes of another Baustein, never at the top level.
    if (istNurInNotizen(quelle.node.type.name)) return null;
    if (ziel.abschnitt < 0 || ziel.abschnitt >= doc.childCount) return null;
    eltern = doc.child(ziel.abschnitt);
    elternPos = 0;
    for (let i = 0; i < ziel.abschnitt; i++) elternPos += doc.child(i).nodeSize;
  } else {
    const f = findeBaustein(doc, ziel.elternId);
    if (!f) return null;
    // Only into the notes of a Baustein that may hold others, and only a Baustein that may be held.
    if (!darfInNotizen(f.node.type.name, quelle.node.type.name)) return null;
    // Not into itself or one of its own descendants (a Thema carries its notes along).
    if (f.pos >= von && f.pos < bis) return null;
    eltern = f.node;
    elternPos = f.pos;
  }

  // The outline counts Bausteine in list items too; they are inserted next to the list holding them.
  const liste = bausteineUnter(eltern, elternPos, quelle.node);
  const index = Math.max(0, Math.min(ziel.index, liste.length));
  let einfuegen: number;
  if (index < liste.length) {
    einfuegen = liste[index]!.blockPos;
  } else if (liste.length > 0) {
    einfuegen = liste[liste.length - 1]!.blockEnde;
  } else {
    einfuegen = elternPos + eltern.nodeSize - 1;
    if (istLeererAbsatz(eltern.lastChild)) einfuegen -= eltern.lastChild!.nodeSize;
  }
  if (einfuegen === von || einfuegen === bis) return 'unveraendert';

  const tr = state.tr;
  tr.insert(einfuegen, quelle.node);
  const versatz = einfuegen <= von ? quelle.node.nodeSize : 0;
  if (doc.resolve(von).parent.childCount === 1) {
    // The only child of its parent (e.g. the only content of a Thema's notes): leave an empty paragraph.
    tr.replaceWith(von + versatz, bis + versatz, state.schema.nodes.paragraph!.create());
  } else {
    tr.delete(von + versatz, bis + versatz);
  }
  // No `scrollIntoView`: only the outline scrolls while moving, the editor stays where it is.
  return tr;
}
