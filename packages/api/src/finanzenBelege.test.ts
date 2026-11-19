import { describe, expect, it } from 'vitest';
import { belegEntwurfDatenSchema } from '@c4/shared';
import { einreichungWarePosten, type EinreichungWare } from './finanzenBelege';

const warePosten = (wareId: string, gebindeId: string) => ({
  art: 'ware' as const,
  wareId,
  gebindeId,
  anzahlMilli: 2000,
  einzelpreisCent: 500,
  steuersatz: 1900,
});
const daten = (...posten: ReturnType<typeof warePosten>[]) =>
  belegEntwurfDatenSchema.parse({ posten });
const waren: Record<string, EinreichungWare> = {
  w1: { archiviert: false, gebindeIds: ['g1'], kategorieId: 'k1' },
  w2: { archiviert: false, gebindeIds: ['g2'], kategorieId: null },
  w3: { archiviert: true, gebindeIds: ['g3'], kategorieId: 'k1' },
};
const suche = (id: string) => waren[id];

describe('einreichungWarePosten', () => {
  it('fills the Kategorie from the Warengruppe, or leaves it empty', () => {
    const r = einreichungWarePosten(daten(warePosten('w1', 'g1'), warePosten('w2', 'g2')), suche);
    expect(r.fehler).toEqual([]);
    expect(r.daten.posten.map((p) => ('kategorieId' in p ? p.kategorieId : undefined))).toEqual([
      'k1',
      null,
    ]);
  });

  it('rejects unknown and archived Waren and foreign Gebinde', () => {
    const r = einreichungWarePosten(
      daten(warePosten('x', 'g1'), warePosten('w3', 'g3'), warePosten('w1', 'g2')),
      suche,
    );
    expect(r.fehler).toEqual([
      'Posten 1: Die Ware gibt es nicht.',
      'Posten 2: Die Ware ist archiviert.',
      'Posten 3: Dieses Gebinde gehört nicht zur Ware.',
    ]);
  });
});
