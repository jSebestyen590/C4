import { describe, expect, it, vi } from 'vitest';
import { sperreBeruehren, sperrSchluessel } from './sperren';

describe('sperrSchluessel', () => {
  it('sorts and de-duplicates', () => {
    expect(sperrSchluessel(['b', 'a', 'b', 'c', 'a'])).toEqual(['a', 'b', 'c']);
    expect(sperrSchluessel([])).toEqual([]);
  });
});

describe('sperreBeruehren', () => {
  const fakeTx = () => {
    const values = vi.fn((rows: { schluessel: string }[]) => ({
      rows,
      onConflictDoUpdate: vi.fn(async () => undefined),
    }));
    const insert = vi.fn(() => ({ values }));
    return { tx: { insert } as never, insert, values };
  };

  it('does nothing for an empty list', async () => {
    const { tx, insert } = fakeTx();
    await sperreBeruehren(tx);
    expect(insert).not.toHaveBeenCalled();
  });

  it('writes one statement with the sorted keys', async () => {
    const { tx, insert, values } = fakeTx();
    await sperreBeruehren(tx, 'lagerort:b', 'lagerort:a', 'lagerort:b');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values.mock.calls[0]![0].map((r) => r.schluessel)).toEqual(['lagerort:a', 'lagerort:b']);
  });
});
