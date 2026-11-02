import { describe, expect, it } from 'vitest';
import { statusUebergangUeblich } from './status';

describe('statusUebergangUeblich', () => {
  it('accepts the usual steps and becoming Externe:r', () => {
    expect(statusUebergangUeblich('anwaerter', 'mitglied')).toBe(true);
    expect(statusUebergangUeblich('mitglied', 'em')).toBe(true);
    expect(statusUebergangUeblich('anwaerter', 'extern')).toBe(true);
    expect(statusUebergangUeblich('em', 'extern')).toBe(true);
    expect(statusUebergangUeblich('extern', 'anwaerter')).toBe(true);
    expect(statusUebergangUeblich('mitglied', 'mitglied')).toBe(true);
  });

  it('flags skipped steps and steps back', () => {
    expect(statusUebergangUeblich('anwaerter', 'em')).toBe(false);
    expect(statusUebergangUeblich('mitglied', 'anwaerter')).toBe(false);
    expect(statusUebergangUeblich('em', 'mitglied')).toBe(false);
    expect(statusUebergangUeblich('extern', 'mitglied')).toBe(false);
    expect(statusUebergangUeblich('extern', 'em')).toBe(false);
  });
});
