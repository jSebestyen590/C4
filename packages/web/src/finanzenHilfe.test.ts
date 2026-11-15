import { describe, expect, it } from 'vitest';
import { HILFE } from './finanzenHilfe';

describe('HILFE', () => {
  it('has a non-empty text for every field', () => {
    const texte = Object.values(HILFE).flatMap((gruppe) => Object.values(gruppe));
    expect(texte.length).toBeGreaterThan(0);
    for (const t of texte) expect(t.trim().length).toBeGreaterThan(20);
  });
});
