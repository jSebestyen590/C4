import { describe, expect, it } from 'vitest';
import type { SumupTransaktion } from '@c4/shared';
import {
  OHNE_EVENT,
  sumupAbrufText,
  sumupAuswahl,
  sumupEventOptionen,
  sumupTypText,
} from './sumupAnzeige';

const t = (id: string, betragCent: number): SumupTransaktion => ({
  id,
  transactionCode: id,
  zeitpunkt: '2026-10-31T20:00:00Z',
  betragCent,
  typ: 'PAYMENT',
  status: 'SUCCESSFUL',
  trinkgeldCent: 0,
  sumupBenutzer: null,
});

describe('sumupAnzeige', () => {
  it('translates types', () => {
    expect(sumupTypText('PAYMENT')).toBe('Zahlung');
    expect(sumupTypText('CHARGE_BACK')).toBe('Rückbuchung');
    expect(sumupTypText('XYZ')).toBe('XYZ');
  });

  it('sums only checked transactions', () => {
    const r = sumupAuswahl([t('a', 500), t('b', -200), t('c', 100)], new Set(['c']));
    expect(r).toEqual({ ids: ['a', 'b'], anzahl: 2, summeCent: 300 });
  });

  it('builds event options without cancelled events and adds the suggestion', () => {
    const o = sumupEventOptionen(
      [
        { id: 'e1', titel: 'Party', beginn: '2026-10-31T19:00:00Z', ende: '', abgesagt: false },
        { id: 'e2', titel: 'Weg', beginn: '2026-10-30T19:00:00Z', ende: '', abgesagt: true },
      ],
      { eventId: 'e3', eventTitel: 'Alt', eventBeginn: '2026-10-29T19:00:00Z' },
    );
    expect(o.map((x) => x.value)).toEqual([OHNE_EVENT, 'e1', 'e3']);
    expect(o[1]?.label).toBe('Party – 31.10. 20:00');
  });

  it('describes fetch results', () => {
    expect(sumupAbrufText({ transaktionenNeu: 3, auszahlungenNeu: 1, vollstaendig: true })).toBe(
      '3 neue Zahlungen, 1 neue Auszahlung',
    );
    expect(
      sumupAbrufText({ transaktionenNeu: 0, auszahlungenNeu: 0, vollstaendig: false }),
    ).toContain('ruf noch einmal ab');
  });
});
