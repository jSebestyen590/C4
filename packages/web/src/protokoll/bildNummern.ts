import { BILD_TYP, type ProtokollKnoten } from '@c4/shared';

/** The description of an image node, trimmed ('' = none). */
export const bildBeschreibung = (k: ProtokollKnoten): string =>
  typeof k.attrs?.beschreibung === 'string' ? k.attrs.beschreibung.trim() : '';

/**
 * Numbers the images like a list of figures: in document order (also those in the notes of Bausteine,
 * nested ones included), counting only images WITH a description, so the numbers have no gaps. An
 * image without a description is not in the map (no number, no caption). Keyed by node object.
 */
export function bildNummern(dokument: ProtokollKnoten): Map<ProtokollKnoten, number> {
  const nummern = new Map<ProtokollKnoten, number>();
  const gehe = (k: ProtokollKnoten) => {
    if (k.type === BILD_TYP) {
      if (bildBeschreibung(k)) nummern.set(k, nummern.size + 1);
      return;
    }
    for (const kind of k.content ?? []) gehe(kind);
  };
  gehe(dokument);
  return nummern;
}

/** Caption of a numbered image: `Abb. 3: Beschreibung`. */
export const bildUnterschrift = (nummer: number, beschreibung: string): string =>
  `Abb. ${nummer}: ${beschreibung.trim()}`;
