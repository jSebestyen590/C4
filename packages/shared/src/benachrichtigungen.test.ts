import { describe, expect, it } from 'vitest';
import {
  BENACHRICHTIGUNGS_ARTEN,
  benachrichtigungsArt,
  effektiveEinstellung,
  einstellungSchema,
  pushAboSchema,
} from './benachrichtigungen';

const art = (key: string) => benachrichtigungsArt(key)!;

describe('effektiveEinstellung', () => {
  it('uses the defaults without stored row', () => {
    expect(effektiveEinstellung(art('kalender.erinnerung'), 'mitglied')).toEqual({
      aktiv: true,
      minuten: 30,
    });
    expect(effektiveEinstellung(art('kalender.aenderung'), 'anwaerter')).toEqual({
      aktiv: true,
      minuten: null,
    });
  });

  it('can default per status', () => {
    const fehlend = art('kalender.fehlende_dienste');
    expect(effektiveEinstellung(fehlend, 'mitglied').aktiv).toBe(true);
    expect(effektiveEinstellung(fehlend, 'anwaerter').aktiv).toBe(true);
    expect(effektiveEinstellung(fehlend, 'em').aktiv).toBe(false);
  });

  it('lets a stored row override the default', () => {
    const fehlend = art('kalender.fehlende_dienste');
    expect(effektiveEinstellung(fehlend, 'em', { aktiv: true, minuten: null }).aktiv).toBe(true);
    expect(effektiveEinstellung(fehlend, 'mitglied', { aktiv: false, minuten: null }).aktiv).toBe(
      false,
    );
  });

  it('keeps stored minutes only when they are an option', () => {
    const erinnerung = art('kalender.erinnerung');
    expect(
      effektiveEinstellung(erinnerung, 'mitglied', { aktiv: true, minuten: 120 }).minuten,
    ).toBe(120);
    expect(effektiveEinstellung(erinnerung, 'mitglied', { aktiv: true, minuten: 7 }).minuten).toBe(
      30,
    );
    expect(
      effektiveEinstellung(erinnerung, 'mitglied', { aktiv: false, minuten: null }).minuten,
    ).toBe(30);
  });
});

describe('registry', () => {
  it('has unique keys prefixed by their area', () => {
    const keys = BENACHRICHTIGUNGS_ARTEN.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of BENACHRICHTIGUNGS_ARTEN) {
      expect(a.key.startsWith(`${a.bereich}.`)).toBe(true);
      if (a.minuten) expect(a.minuten.optionen).toContain(a.minuten.standard);
    }
  });
});

describe('schemas', () => {
  it('accepts a browser subscription', () => {
    const ok = pushAboSchema.safeParse({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'k', auth: 'a' },
    });
    expect(ok.success).toBe(true);
    expect(
      pushAboSchema.safeParse({ endpoint: 'nope', keys: { p256dh: 'k', auth: 'a' } }).success,
    ).toBe(false);
  });

  it('validates settings against the registry', () => {
    expect(
      einstellungSchema.safeParse({ art: 'kalender.erinnerung', aktiv: true, minuten: 60 }).success,
    ).toBe(true);
    expect(
      einstellungSchema.safeParse({ art: 'kalender.erinnerung', aktiv: true, minuten: 61 }).success,
    ).toBe(false);
    expect(
      einstellungSchema.safeParse({ art: 'kalender.aenderung', aktiv: true, minuten: 30 }).success,
    ).toBe(false);
    expect(einstellungSchema.safeParse({ art: 'unbekannt', aktiv: true }).success).toBe(false);
    expect(einstellungSchema.safeParse({ art: 'kalender.aenderung', aktiv: false }).success).toBe(
      true,
    );
  });
});
