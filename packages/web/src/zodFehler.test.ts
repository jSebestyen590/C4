import { describe, expect, it } from 'vitest';
import { createUserSchema, setGroupsSchema } from '@c4/shared';
import { zodFeldFehler } from './zodFehler';

const issue = (path: PropertyKey[], message: string) => ({ path, message });
const fehlgeschlagen = (...issues: ReturnType<typeof issue>[]) => ({
  success: false as const,
  error: { issues },
});

describe('zodFeldFehler', () => {
  it('returns the first message per top-level field', () => {
    const fehler = zodFeldFehler(
      fehlgeschlagen(
        issue(['name'], 'Zu kurz.'),
        issue(['name'], 'Zu lang.'),
        issue(['adresse', 'plz'], 'PLZ falsch.'),
        issue(['liste', 0], 'Eintrag falsch.'),
      ),
    );
    expect(fehler).toEqual({ name: 'Zu kurz.', adresse: 'PLZ falsch.', liste: 'Eintrag falsch.' });
  });

  it('works with real Zod results', () => {
    const fehler = zodFeldFehler(createUserSchema.safeParse({ email: 'x', groups: 'y' }));
    expect(Object.keys(fehler).sort()).toEqual(['email', 'groups']);
    expect(zodFeldFehler(setGroupsSchema.safeParse({ groups: [] }))).toEqual({});
  });

  it('merges several results, the first message wins', () => {
    const a = fehlgeschlagen(issue(['x'], 'A.'));
    const b = fehlgeschlagen(issue(['x'], 'B.'), issue(['y'], 'Y.'));
    expect(zodFeldFehler(a, { success: true }, b)).toEqual({ x: 'A.', y: 'Y.' });
  });

  it('ignores issues without a path', () => {
    expect(zodFeldFehler(fehlgeschlagen(issue([], 'Allgemein.')))).toEqual({});
  });
});
