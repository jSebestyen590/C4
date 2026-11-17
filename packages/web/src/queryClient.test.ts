import { beforeEach, describe, expect, it, vi } from 'vitest';

const zeigen = vi.fn();
vi.mock('@mantine/notifications', () => ({ notifications: { show: (o: unknown) => zeigen(o) } }));

import {
  createQueryClient,
  mutationFehlerBehandeln,
  mutationFehlerMeldung,
  STANDARD_MUTATIONSFEHLER,
} from './queryClient';
import { ApiFehler } from './warenApi';

beforeEach(() => zeigen.mockClear());

describe('mutationFehlerMeldung', () => {
  it('uses the API message of an ApiFehler', () => {
    expect(mutationFehlerMeldung(new ApiFehler(409, 'Schon vergeben.'))).toBe('Schon vergeben.');
  });
  it('falls back for other errors and empty messages', () => {
    expect(mutationFehlerMeldung(new Error('Request failed (500)'))).toBe(STANDARD_MUTATIONSFEHLER);
    expect(mutationFehlerMeldung(new ApiFehler(500, ''))).toBe(STANDARD_MUTATIONSFEHLER);
    expect(mutationFehlerMeldung('x')).toBe(STANDARD_MUTATIONSFEHLER);
  });
});

describe('mutationFehlerBehandeln', () => {
  it('shows a red notification', () => {
    mutationFehlerBehandeln(new ApiFehler(400, 'Nein.'), undefined);
    expect(zeigen).toHaveBeenCalledWith({ color: 'red', message: 'Nein.' });
  });
  it('stays silent when the mutation shows its own error', () => {
    mutationFehlerBehandeln(new Error('x'), { eigeneFehlermeldung: true });
    expect(zeigen).not.toHaveBeenCalled();
  });
});

describe('createQueryClient', () => {
  it('sets the default staleTime and handles mutation errors globally', async () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new ApiFehler(400, 'Ups.')) })
      .execute(undefined)
      .catch(() => undefined);
    expect(zeigen).toHaveBeenCalledWith({ color: 'red', message: 'Ups.' });
    zeigen.mockClear();
    await client
      .getMutationCache()
      .build(client, {
        mutationFn: () => Promise.reject(new Error('x')),
        meta: { eigeneFehlermeldung: true },
      })
      .execute(undefined)
      .catch(() => undefined);
    expect(zeigen).not.toHaveBeenCalled();
  });
});
