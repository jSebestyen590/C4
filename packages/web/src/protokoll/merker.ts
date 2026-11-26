import { istMerker, type ProtokollDokument, type ProtokollKnoten } from '@c4/shared';
import { knotenText } from './dokumentDaten';

/** A Merker "Überarbeiten" of the document with its text (for the warning when closing). */
export interface MerkerEintrag {
  id: string;
  text: string;
}

/** All Merker in document order (nested ones included). */
export function merkerListe(dokument: ProtokollDokument): MerkerEintrag[] {
  const liste: MerkerEintrag[] = [];
  const gehe = (k: ProtokollKnoten) => {
    if (istMerker(k.type)) {
      const id = typeof k.attrs?.id === 'string' ? k.attrs.id : '';
      if (id) liste.push({ id, text: knotenText(k).trim() });
      return;
    }
    for (const c of k.content ?? []) gehe(c);
  };
  for (const a of dokument.content) gehe(a);
  return liste;
}
