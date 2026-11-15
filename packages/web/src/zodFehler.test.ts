import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodFeldFehler } from './zodFehler';

const schema = z.object({
  name: z.string().min(2, 'Zu kurz.').max(3, 'Zu lang.'),
  alter: z.number({ error: 'Zahl nötig.' }),
  adresse: z.object({ plz: z.string().length(5, 'PLZ falsch.') }),
});

describe('zodFeldFehler', () => {
  it('returns the first message per top-level field', () => {
    const fehler = zodFeldFehler(
      schema.safeParse({ name: 'x', alter: 'a', adresse: { plz: '1' } }),
    );
    expect(fehler).toEqual({ name: 'Zu kurz.', alter: 'Zahl nötig.', adresse: 'PLZ falsch.' });
  });

  it('is empty for a successful result', () => {
    const ok = schema.safeParse({ name: 'ab', alter: 1, adresse: { plz: '12345' } });
    expect(zodFeldFehler(ok)).toEqual({});
  });

  it('merges several results, the first message wins', () => {
    const a = z.object({ x: z.string('A.') }).safeParse({});
    const b = z.object({ x: z.string('B.'), y: z.string('Y.') }).safeParse({});
    expect(zodFeldFehler(a, b)).toEqual({ x: 'A.', y: 'Y.' });
  });

  it('ignores issues without a path', () => {
    const r = z
      .string()
      .refine(() => false, 'Nein.')
      .safeParse('a');
    expect(zodFeldFehler(r)).toEqual({});
  });
});
