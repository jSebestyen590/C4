import {
  bausteinEventDatenSchema,
  bausteinThemaDatenSchema,
  bausteinVergangenesEventDatenSchema,
  bausteinAnwaerterDatenSchema,
  eventUeberschrift,
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

export interface DokumentUeberschrift {
  /** Anchor id of the heading element in the document view. */
  id: string;
  /** 1 = section, 2 = Baustein / heading, 3 = sub-heading. */
  ebene: 1 | 2 | 3;
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
  const neu = (k: ProtokollKnoten, ebene: 1 | 2 | 3, text: string) => {
    const id = `${GLIEDERUNG_ID_PREFIX}${eintraege.length}`;
    ids.set(k, id);
    const t = text.trim();
    if (t) eintraege.push({ id, ebene, text: t });
  };

  const gehe = (k: ProtokollKnoten) => {
    if (k.type === 'heading') {
      neu(k, k.attrs?.level === 3 ? 3 : 2, knotenText(k));
    } else {
      const titel = bausteinUeberschrift(k, personName);
      if (titel !== null) neu(k, 2, titel);
    }
    for (const c of ohneLeereEnden(k.content)) gehe(c);
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
    for (const c of inh) gehe(c);
  }
  return { eintraege, ids };
}

/** Nests the flat headings by level: section > heading > sub-heading. */
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
