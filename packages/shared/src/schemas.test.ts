import { describe, expect, it } from 'vitest';
import { besetzungEingabeSchema } from './schemas';

const basis = { mitgliedSub: 'm1', start: '2026-01-01', ende: '2026-12-31' };

describe('besetzungEingabeSchema', () => {
  it('accepts a rights period wider than the Besetzung', () => {
    const r = besetzungEingabeSchema.safeParse({
      ...basis,
      rechteVon: '2025-12-01',
      rechteBis: '2027-01-31',
    });
    expect(r.success).toBe(true);
  });
  it('defaults the rights period to none', () => {
    const r = besetzungEingabeSchema.parse(basis);
    expect(r.rechteVon).toBeNull();
    expect(r.rechteBis).toBeNull();
  });
  it('rejects rights that end before they begin', () => {
    expect(besetzungEingabeSchema.safeParse({ ...basis, rechteBis: '2025-12-31' }).success).toBe(
      false,
    );
  });
});
