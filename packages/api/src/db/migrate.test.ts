import { describe, expect, it } from 'vitest';
import { mitWiederholung } from './migrate';

const konflikt = () => Object.assign(new Error('schema has been updated'), { code: '40001' });
const sofort = () => Promise.resolve();

describe('mitWiederholung', () => {
  it('retries DSQL concurrency conflicts until the statement succeeds', async () => {
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

  it('gives up after the last attempt and rethrows other errors at once', async () => {
    await expect(mitWiederholung(() => Promise.reject(konflikt()), 2, sofort)).rejects.toThrow(
      'schema has been updated',
    );
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
});
