import { describe, expect, it } from 'vitest';
import { besetzungEingabeSchema } from './schemas';

const basis = { mitgliedSub: 'm1', start: '2026-01-01', ende: '2026-12-31' };

describe('besetzungEingabeSchema', () => {
  it('accepts a normal Besetzung and defaults the end to open', () => {
    expect(besetzungEingabeSchema.safeParse(basis).success).toBe(true);
    expect(
      besetzungEingabeSchema.parse({ mitgliedSub: 'm1', start: '2026-01-01' }).ende,
    ).toBeNull();
  });
  it('rejects an end before the start', () => {
    expect(besetzungEingabeSchema.safeParse({ ...basis, ende: '2025-12-31' }).success).toBe(false);
  });
});
