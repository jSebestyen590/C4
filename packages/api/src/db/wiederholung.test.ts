import { describe, expect, it } from 'vitest';
import {
  istDatenAbweichung,
  istKonflikt,
  mitWiederholung,
  sqlState,
  transaktionenWiederholen,
} from './wiederholung';

const konflikt = () => Object.assign(new Error('schema has been updated'), { code: '40001' });
const sofort = () => Promise.resolve();

describe('istKonflikt', () => {
  it('recognises SQLSTATE 40001 and the DSQL codes in the message', () => {
    expect(istKonflikt(konflikt())).toBe(true);
    expect(istKonflikt(new Error('change conflicts with another transaction, OC000'))).toBe(true);
    expect(istKonflikt(new Error('schema has been updated by another transaction (OC001)'))).toBe(
      true,
    );
    expect(istKonflikt(new Error('Failed query', { cause: konflikt() }))).toBe(true);
    expect(istKonflikt(new Error('syntax error'))).toBe(false);
    expect(istKonflikt(new Error('SOC0001'))).toBe(false);
    expect(istKonflikt(Object.assign(new Error('x'), { code: '23505' }))).toBe(false);
  });
});

describe('mitWiederholung', () => {
  it('retries conflicts until the action succeeds', async () => {
    let aufrufe = 0;
    const ergebnis = await mitWiederholung(
      async () => {
        aufrufe++;
        if (aufrufe < 3) throw konflikt();
        return 'ok';
      },
      5,
      sofort,
    );
    expect(ergebnis).toBe('ok');
    expect(aufrufe).toBe(3);
  });

  it('retries on OC000/OC001 messages without a code', async () => {
    let aufrufe = 0;
    await mitWiederholung(
      async () => {
        aufrufe++;
        if (aufrufe < 2) throw new Error('OC000');
      },
      3,
      sofort,
    );
    expect(aufrufe).toBe(2);
  });

  it('gives up after the last attempt and rethrows other errors at once', async () => {
    let versuche = 0;
    await expect(
      mitWiederholung(
        () => {
          versuche++;
          return Promise.reject(konflikt());
        },
        2,
        sofort,
      ),
    ).rejects.toThrow('schema has been updated');
    expect(versuche).toBe(2);
    let aufrufe = 0;
    await expect(
      mitWiederholung(
        () => {
          aufrufe++;
          return Promise.reject(new Error('syntax error'));
        },
        5,
        sofort,
      ),
    ).rejects.toThrow('syntax error');
    expect(aufrufe).toBe(1);
  });

  it('waits with exponential backoff and jitter', async () => {
    const wartezeiten: number[] = [];
    let aufrufe = 0;
    await mitWiederholung(
      async () => {
        if (++aufrufe < 4) throw konflikt();
      },
      5,
      async (ms) => void wartezeiten.push(ms),
      100,
      () => 1,
    );
    expect(wartezeiten).toEqual([100, 200, 400]);
    const mitMinimum: number[] = [];
    aufrufe = 0;
    await mitWiederholung(
      async () => {
        if (++aufrufe < 3) throw konflikt();
      },
      5,
      async (ms) => void mitMinimum.push(ms),
      100,
      () => 0,
    );
    expect(mitMinimum).toEqual([50, 100]);
  });
});

describe('sqlState', () => {
  it('finds the SQLSTATE through the cause chain', () => {
    expect(sqlState(Object.assign(new Error('x'), { code: '23505' }))).toBe('23505');
    expect(sqlState(new Error('Failed query', { cause: { code: '23503' } }))).toBe('23503');
    expect(sqlState(new Error('x'))).toBeUndefined();
    expect(sqlState(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBeUndefined();
    expect(sqlState(undefined)).toBeUndefined();
  });

  it('flags unique and foreign-key violations only', () => {
    expect(istDatenAbweichung(new Error('x', { cause: { code: '23505' } }))).toBe(true);
    expect(istDatenAbweichung({ code: '23503' })).toBe(true);
    expect(istDatenAbweichung({ code: '40001' })).toBe(false);
    expect(istDatenAbweichung(new Error('x'))).toBe(false);
  });
});

describe('transaktionenWiederholen', () => {
  const fakeDb = (aktion: () => Promise<string>) => ({
    transaction: async (fn: (tx: string) => Promise<string>) => {
      await aktion();
      return fn('tx');
    },
  });

  it('retries a top-level transaction that fails twice with a conflict', async () => {
    let aufrufe = 0;
    const wartezeiten: number[] = [];
    const db = transaktionenWiederholen(
      fakeDb(async () => {
        if (++aufrufe < 3) throw konflikt();
        return 'ok';
      }),
      async (ms) => void wartezeiten.push(ms),
    );
    expect(await db.transaction(async (tx) => `${tx}!`)).toBe('tx!');
    expect(aufrufe).toBe(3);
    expect(wartezeiten).toHaveLength(2);
    expect(Math.max(...wartezeiten)).toBeLessThan(300);
  });

  it('throws other errors immediately', async () => {
    let aufrufe = 0;
    const db = transaktionenWiederholen(
      fakeDb(async () => {
        aufrufe++;
        throw new Error('syntax error');
      }),
      sofort,
    );
    await expect(db.transaction(async () => 'x')).rejects.toThrow('syntax error');
    expect(aufrufe).toBe(1);
  });

  it('throws the conflict after the third attempt', async () => {
    let aufrufe = 0;
    const db = transaktionenWiederholen(
      fakeDb(async () => {
        aufrufe++;
        throw konflikt();
      }),
      sofort,
    );
    await expect(db.transaction(async () => 'x')).rejects.toMatchObject({ code: '40001' });
    expect(aufrufe).toBe(3);
  });

  it('does not multiply attempts inside an explicit mitWiederholung', async () => {
    let aufrufe = 0;
    const db = transaktionenWiederholen(
      fakeDb(async () => {
        aufrufe++;
        throw konflikt();
      }),
      sofort,
    );
    await expect(
      mitWiederholung(() => db.transaction(async () => 'x'), 4, sofort),
    ).rejects.toMatchObject({ code: '40001' });
    expect(aufrufe).toBe(4);
  });
});
