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

/** A row of the flat outline list (one Droppable): section header, Baustein, nested Baustein or notes slot. */
export type GliederungZeile =
  | { art: 'abschnitt'; key: string; abschnitt: number; titel: string }
  | { art: 'baustein'; key: string; abschnitt: number; eintrag: GliederungEintrag }
  | {
      art: 'kind';
      key: string;
      abschnitt: number;
      elternId: string;
      eintrag: GliederungEintrag;
    }
  | { art: 'notizen'; key: string; abschnitt: number; elternId: string };

/**
 * The flat rows of the outline. While a Baustein `gezogenId` is dragged, its own nested Bausteine are
 * left out, and for a nestable one every Baustein that may hold others gets a "notes" slot row behind its
 * nested Bausteine.
 */
export function gliederungZeilen(
  baum: GliederungAbschnitt[],
  gezogenId: string | null = null,
): GliederungZeile[] {
  const alle = baum.flatMap((a) => a.eintraege.flatMap((e) => [e, ...e.kinder]));
  const gezogen = gezogenId ? alle.find((e) => e.id === gezogenId) : undefined;
  const zeilen: GliederungZeile[] = [];
  baum.forEach((a, i) => {
    zeilen.push({ art: 'abschnitt', key: `abschnitt:${i}`, abschnitt: i, titel: a.titel });
    for (const e of a.eintraege) {
      zeilen.push({ art: 'baustein', key: e.id, abschnitt: i, eintrag: e });
      if (e.id !== gezogenId) {
        for (const k of e.kinder)
          zeilen.push({ art: 'kind', key: k.id, abschnitt: i, elternId: e.id, eintrag: k });
      }
      if (gezogen?.verschachtelbar && e.kannEnthalten)
        zeilen.push({ art: 'notizen', key: `notizen:${e.id}`, abschnitt: i, elternId: e.id });
    }
  });
  return zeilen;
}

/**
 * Target of dropping the row `gezogenId` at the flat index `index` of `zeilen` (the list as rendered
 * during the drag; `index` is the final position of the dragged row). Looks at the rows directly above and
 * below the dropped row:
 * - below is a nested row or a notes slot of a parent and the dragged Baustein is nestable: nested into
 *   that parent, before that nested row (at the end for the slot);
 * - otherwise top-level in the section of the row above (a section header: first position), before the
 *   next top-level Baustein; a non-nestable one dropped above a nested row goes right behind its parent.
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
  const unten = rest[pos];
  const oben = rest[pos - 1];

  if (unten && (unten.art === 'kind' || unten.art === 'notizen')) {
    if (gezogen.eintrag.verschachtelbar) {
      const geschwister = rest.filter((z) => z.art === 'kind' && z.elternId === unten.elternId);
      const n = unten.art === 'kind' ? geschwister.indexOf(unten) : geschwister.length;
      return { elternId: unten.elternId, index: n };
    }
    // Not nestable: top-level directly behind the parent.
    const elternPos = rest.findIndex((z) => z.art === 'baustein' && z.key === unten.elternId);
    if (elternPos < 0) return null;
    return {
      abschnitt: unten.abschnitt,
      index: rest
        .slice(0, elternPos + 1)
        .filter((z) => z.art === 'baustein' && z.abschnitt === unten.abschnitt).length,
    };
  }
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
