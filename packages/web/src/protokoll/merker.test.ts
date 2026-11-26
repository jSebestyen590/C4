import { describe, expect, it } from 'vitest';
import { bausteinErzeugen, type ProtokollDokument } from '@c4/shared';
import { merkerListe } from './merker';

describe('merkerListe', () => {
  it('lists Merker in order with their text', () => {
    const m = bausteinErzeugen('bausteinMerker', undefined, [
      { type: 'paragraph', content: [{ type: 'text', text: 'Datum prüfen' }] },
    ]);
    const dok = {
      type: 'doc',
      content: [{ type: 'abschnitt', attrs: { art: 'vergangenes' }, content: [m] }],
    } as unknown as ProtokollDokument;
    expect(merkerListe(dok)).toEqual([{ id: m.attrs!.id, text: 'Datum prüfen' }]);
  });
});
