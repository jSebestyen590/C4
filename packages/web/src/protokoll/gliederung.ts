import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import {
  BAUSTEIN_TYPEN,
  PROTOKOLL_ABSCHNITTE,
  eventUeberschrift,
  istBausteinInNotizen,
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
import { BAUSTEIN_TITEL } from './symbole';
import { ABSCHNITT_TITEL } from './schema';

// Outline ("Gliederung") of the minutes: the Bausteine per section, and moving one of them (no React).

export interface GliederungEintrag {
  id: string;
  typ: BausteinTyp;
  titel: string;
  /** Whether the Baustein may stand in the notes of another Baustein. */
  verschachtelbar: boolean;
  /** Whether other Bausteine may stand in its notes. */
  kannEnthalten: boolean;
  /** Bausteine in its notes. */
  kinder: GliederungEintrag[];
}

export interface GliederungAbschnitt {
  art: ProtokollAbschnitt;
  titel: string;
  eintraege: GliederungEintrag[];
}

const istBaustein = (node: PmNode): boolean =>
  (BAUSTEIN_TYPEN as readonly string[]).includes(node.type.name);

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
): string {
  const d = (daten ?? {}) as Record<string, unknown>;
  const person = (sub: unknown, name: unknown): string =>
    (typeof sub === 'string' ? personName(sub) : undefined) ??
    (typeof name === 'string' ? name : '');
  switch (typ) {
    case 'bausteinEvent':
      return kurz(eventUeberschrift(d as unknown as BausteinEventDaten)) || BAUSTEIN_TITEL[typ];
    case 'bausteinVergangenesEvent':
      return (
        kurz(vergangenesUeberschrift(d as unknown as BausteinVergangenesEventDaten)) ||
        BAUSTEIN_TITEL[typ]
      );
    case 'bausteinAnwaerter': {
      const a = d as unknown as BausteinAnwaerterDaten;
      return kurz(`${a.vorname ?? ''} ${a.nachname ?? ''}`) || BAUSTEIN_TITEL[typ];
    }
    case 'bausteinBeschluss':
      return mit(BAUSTEIN_TITEL[typ], (d as unknown as BausteinBeschlussDaten).antrag ?? '');
    case 'bausteinMeinungsbild':
      return mit(BAUSTEIN_TITEL[typ], (d as unknown as BausteinMeinungsbildDaten).frage ?? '');
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
      const name = person(a.sub, '');
      return name ? kurz(`${name} ${wort}`) : wort === 'geht' ? 'Geht' : 'Erscheint';
    }
  }
}

function eintrag(
  node: PmNode,
  personName: (sub: string) => string | undefined,
  tief: boolean,
): GliederungEintrag {
  const typ = node.type.name as BausteinTyp;
  const kinder: GliederungEintrag[] = [];
  if (!tief) {
    node.forEach((kind) => {
      if (istBaustein(kind)) kinder.push(eintrag(kind, personName, true));
    });
  }
  return {
    id: node.attrs.id as string,
    typ,
    titel: gliederungTitel(typ, node.attrs.daten, personName),
    verschachtelbar: istBausteinInNotizen(typ),
    kannEnthalten: !istBausteinInNotizen(typ),
    kinder,
  };
}

/** The three sections with their Bausteine in document order (free text is left out). */
export function gliederungBauen(
  doc: PmNode,
  personName?: (sub: string) => string | undefined,
): GliederungAbschnitt[] {
  const name = personName ?? (() => undefined);
  return PROTOKOLL_ABSCHNITTE.map((art, i) => {
    const eintraege: GliederungEintrag[] = [];
    const abschnitt = doc.maybeChild(i);
    abschnitt?.forEach((kind) => {
      if (istBaustein(kind)) eintraege.push(eintrag(kind, name, false));
    });
    return { art, titel: ABSCHNITT_TITEL[art], eintraege };
  });
}

/**
 * Where a Baustein goes: into a section or into the notes of another Baustein, as the `index`-th
 * Baustein of that list (counted without the moved one; `index` = length puts it last).
 */
export type GliederungZiel =
  { abschnitt: number; index: number } | { elternId: string; index: number };

export const abschnittDroppableId = (i: number): string => `abschnitt:${i}`;
export const notizenDroppableId = (id: string): string => `notizen:${id}`;

/** Parses a droppable id of the outline into a target (`index` is filled by the caller). */
export function zielVonDroppable(droppableId: string, index: number): GliederungZiel | null {
  const [art, ...rest] = droppableId.split(':');
  const wert = rest.join(':');
  if (art === 'abschnitt' && /^[0-2]$/.test(wert)) return { abschnitt: Number(wert), index };
  if (art === 'notizen' && wert) return { elternId: wert, index };
  return null;
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
    return istBaustein(node) || node.type.name === 'abschnitt';
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
  const { doc } = state;
  const quelle = findeBaustein(doc, id);
  if (!quelle) return null;
  const von = quelle.pos;
  const bis = von + quelle.node.nodeSize;

  let eltern: PmNode;
  let elternPos: number;
  if ('abschnitt' in ziel) {
    if (ziel.abschnitt < 0 || ziel.abschnitt >= doc.childCount) return null;
    eltern = doc.child(ziel.abschnitt);
    elternPos = 0;
    for (let i = 0; i < ziel.abschnitt; i++) elternPos += doc.child(i).nodeSize;
  } else {
    const f = findeBaustein(doc, ziel.elternId);
    if (!f) return null;
    // Only into the notes of a Baustein that may hold others, and only a Baustein that may be held.
    if (!istBausteinInNotizen(quelle.node.type.name) || istBausteinInNotizen(f.node.type.name))
      return null;
    // Not into itself.
    if (f.pos >= von && f.pos < bis) return null;
    eltern = f.node;
    elternPos = f.pos;
  }

  const liste: Fund[] = [];
  eltern.forEach((kind, offset) => {
    if (istBaustein(kind) && kind !== quelle.node)
      liste.push({ node: kind, pos: elternPos + 1 + offset });
  });
  const index = Math.max(0, Math.min(ziel.index, liste.length));
  let einfuegen: number;
  if (index < liste.length) {
    einfuegen = liste[index]!.pos;
  } else if (liste.length > 0) {
    const letzter = liste[liste.length - 1]!;
    einfuegen = letzter.pos + letzter.node.nodeSize;
  } else {
    einfuegen = elternPos + eltern.nodeSize - 1;
    if (istLeererAbsatz(eltern.lastChild)) einfuegen -= eltern.lastChild!.nodeSize;
  }
  if (einfuegen === von || einfuegen === bis) return null;

  const tr = state.tr;
  tr.insert(einfuegen, quelle.node);
  const versatz = einfuegen <= von ? quelle.node.nodeSize : 0;
  tr.delete(von + versatz, bis + versatz);
  return tr.scrollIntoView();
}
