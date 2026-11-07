import {
  bausteinEventDatenSchema,
  bausteinThemaDatenSchema,
  bausteinVergangenesEventDatenSchema,
  bausteinAnwaerterDatenSchema,
  eventUeberschrift,
  istBausteinInNotizen,
  vergangenesUeberschrift,
  type ProtokollDokument,
  type ProtokollKnoten,
} from '@c4/shared';
import {
  emZeilen,
  aufnahmeZeilen,
  istLeererAbsatz,
  knotenText,
  ohneLeereEnden,
} from './dokumentDaten';
import { ABSCHNITT_TITEL } from './schema';

// Outline of the document view ("Dokument"): the headings only (sections, Bausteine shown as a
// heading, headings typed in the free text), not votes, attendance lines or lists. Derived from the
// same data the view renders; the view puts `ID_PREFIX + n` on the heading elements.

export const GLIEDERUNG_ID_PREFIX = 'dok-ueb-';

/**
 * Heading levels: 1 = section (`h2` in the view), 2 = top-level Baustein (`h3`), then one deeper per nested
 * Thema (`h4`, `h5`, `h6`). Level 5 (`h6`) is the deepest; anything below stays there.
 */
export const MAX_EBENE = 5;

/** The level `n` steps below `ebene`, capped at `MAX_EBENE`. */
export const unterEbene = (ebene: number, n = 1): number => Math.min(ebene + n, MAX_EBENE);

/** The HTML heading tag (`h2`..`h6`) of a level. */
export const ueberschriftTag = (ebene: number): 'h2' | 'h3' | 'h4' | 'h5' | 'h6' =>
  `h${Math.min(Math.max(ebene, 1), MAX_EBENE) + 1}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/**
 * Steps below the enclosing heading for a heading typed in the free text: the editor's "Überschrift 2"
 * is one level below it, "Überschrift 3" two.
 */
export const eigeneUeberschriftSchritte = (level: unknown): 1 | 2 => (level === 3 ? 2 : 1);

export interface DokumentUeberschrift {
  /** Anchor id of the heading element in the document view. */
  id: string;
  /** Level, see `MAX_EBENE`. */
  ebene: number;
  text: string;
}

export interface DokumentGliederungsKnoten extends DokumentUeberschrift {
  kinder: DokumentGliederungsKnoten[];
}

export interface DokumentGliederungDaten {
  /** Flat list in document order. */
  eintraege: DokumentUeberschrift[];
  /** Anchor id per heading node (sections, Bausteine with heading, `heading` nodes). */
  ids: Map<ProtokollKnoten, string>;
}

/** Name of the person/free text after "Aufnahme" / "Neues EM": ": Name" or ''. */
export function personSuffix(
  sub: string | null,
  name: string,
  person: (sub: string) => string | null,
): string {
  const p = sub ? person(sub) : null;
  if (p) return `: ${p}`;
  return name ? `: ${name}` : '';
}

/** Heading text of a Baustein that the document view renders as a heading, else null. */
export function bausteinUeberschrift(
  k: ProtokollKnoten,
  personName: (sub: string) => string | null,
): string | null {
  const daten: unknown = k.attrs?.daten;
  switch (k.type) {
    case 'bausteinEvent': {
      const d = bausteinEventDatenSchema.safeParse(daten);
      return (d.success ? eventUeberschrift(d.data) : '') || 'Event';
    }
    case 'bausteinThema': {
      const d = bausteinThemaDatenSchema.safeParse(daten);
      return (d.success ? d.data.titel.trim() : '') || 'Thema';
    }
    case 'bausteinVergangenesEvent': {
      const d = bausteinVergangenesEventDatenSchema.safeParse(daten);
      return (d.success ? vergangenesUeberschrift(d.data) : '') || 'Vergangenes Event';
    }
    case 'bausteinAnwaerter': {
      const d = bausteinAnwaerterDatenSchema.safeParse(daten);
      const name = d.success ? `${d.data.vorname} ${d.data.nachname}`.trim() : '';
      return `Neue:r Anwärter:in${name ? `: ${name}` : ''}`;
    }
    case 'bausteinAufnahme': {
      const z = aufnahmeZeilen(daten, undefined);
      return `Aufnahme${personSuffix(z.sub, z.name, personName)}`;
    }
    case 'bausteinEm': {
      const z = emZeilen(daten, undefined);
      return `Neues EM${personSuffix(z.sub, z.name, personName)}`;
    }
    default:
      return null;
  }
}

/** The headings of the document view in order, with the anchor id of each heading node. */
export function dokumentUeberschriften(
  inhalt: ProtokollDokument,
  personName: (sub: string) => string | null,
): DokumentGliederungDaten {
  const eintraege: DokumentUeberschrift[] = [];
  const ids = new Map<ProtokollKnoten, string>();
  const neu = (k: ProtokollKnoten, ebene: number, text: string) => {
    const id = `${GLIEDERUNG_ID_PREFIX}${eintraege.length}`;
    ids.set(k, id);
    const t = text.trim();
    if (t) eintraege.push({ id, ebene, text: t });
  };

  // `eltern`: level of the enclosing heading; `innen`: inside the notes of a Baustein.
  const gehe = (k: ProtokollKnoten, eltern: number, innen: boolean) => {
    let hier = eltern;
    if (k.type === 'heading') {
      neu(k, unterEbene(eltern, eigeneUeberschriftSchritte(k.attrs?.level)), knotenText(k));
    } else {
      const titel = bausteinUeberschrift(k, personName);
      if (titel !== null) {
        hier = unterEbene(eltern);
        neu(k, hier, titel);
      } else if (istBausteinInNotizen(k.type) && !innen) {
        // A top-level vote is styled like a heading (not in the outline): its notes sit below it.
        hier = unterEbene(eltern);
      }
    }
    const inBaustein = innen || k.type.startsWith('baustein');
    for (const c of ohneLeereEnden(k.content)) gehe(c, hier, inBaustein);
  };

  for (const a of inhalt.content) {
    const art = a.attrs?.art as keyof typeof ABSCHNITT_TITEL;
    const titel = ABSCHNITT_TITEL[art] ?? '';
    const inh = ohneLeereEnden(a.content).filter(
      (c, i, alle) => !(istLeererAbsatz(c) && alle.length === 1),
    );
    // Same rules as the view: "Sonstiges" only shows with content.
    if (art === 'sonstiges' && inh.length === 0) continue;
    if (titel) neu(a, 1, titel);
    for (const c of inh) gehe(c, 1, false);
  }
  return { eintraege, ids };
}

/** Nests the flat headings by level: section > Baustein > nested Thema / heading > ... */
export function dokumentGliederungBauen(
  eintraege: readonly DokumentUeberschrift[],
): DokumentGliederungsKnoten[] {
  const wurzeln: DokumentGliederungsKnoten[] = [];
  const stapel: DokumentGliederungsKnoten[] = [];
  for (const e of eintraege) {
    const knoten = { ...e, kinder: [] };
    while (stapel.length > 0 && stapel[stapel.length - 1]!.ebene >= e.ebene) stapel.pop();
    const eltern = stapel[stapel.length - 1];
    (eltern ? eltern.kinder : wurzeln).push(knoten);
    stapel.push(knoten);
  }
  return wurzeln;
}
