import { BILD_TYP, istVerschachtelbar, type ProtokollKnoten } from '@c4/shared';

/** One piece of the notes of a Baustein: text (with the images that belong to it) or a nested Baustein. */
export type NotizAbschnitt =
  | {
      art: 'text';
      /** The text blocks of the piece, without the images. */
      knoten: ProtokollKnoten[];
      /** The image nodes of the piece, in order. */
      bilder: ProtokollKnoten[];
    }
  | { art: 'baustein'; knoten: ProtokollKnoten };

export const istBild = (k: ProtokollKnoten): boolean => k.type === BILD_TYP;

/** Whether any of the nodes is an image (then the notes are laid out by `notizAbschnitte`). */
export const hatBilder = (kinder: readonly ProtokollKnoten[]): boolean => kinder.some(istBild);

/**
 * Splits the notes of a Baustein at the nested Bausteine (Abstimmung, Meinungsbild, Wahl, Thema). The
 * text between them forms one piece each; the images of a piece are taken out of its text, so the view
 * can set them in a column beside it. Nested Bausteine stay whole, in order, between the pieces.
 */
export function notizAbschnitte(kinder: readonly ProtokollKnoten[]): NotizAbschnitt[] {
  const abschnitte: NotizAbschnitt[] = [];
  let aktuell: Extract<NotizAbschnitt, { art: 'text' }> | null = null;
  for (const k of kinder) {
    if (istVerschachtelbar(k.type)) {
      aktuell = null;
      abschnitte.push({ art: 'baustein', knoten: k });
      continue;
    }
    if (!aktuell) {
      aktuell = { art: 'text', knoten: [], bilder: [] };
      abschnitte.push(aktuell);
    }
    if (istBild(k)) aktuell.bilder.push(k);
    else aktuell.knoten.push(k);
  }
  return abschnitte;
}
