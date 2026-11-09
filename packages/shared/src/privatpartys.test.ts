import { describe, expect, it } from 'vitest';
import {
  privatpartyEingabeSchema,
  privatpartyOptionName,
  privatpartyPersonEingabeSchema,
  privatpartyStatusEingabeSchema,
  privatpartyUmfrageTitel,
  zitatTrennen,
} from './privatpartys';

const termin = { datum: '2026-12-12', beginn: '19:00', ende: '02:00', stufe: 'bevorzugt' as const };

describe('privatpartyEingabeSchema', () => {
  it('requires a person and at least one date', () => {
    expect(privatpartyEingabeSchema.safeParse({ personId: 'p1', termine: [termin] }).success).toBe(
      true,
    );
    expect(privatpartyEingabeSchema.safeParse({ personId: 'p1', termine: [] }).success).toBe(false);
    expect(privatpartyEingabeSchema.safeParse({ termine: [termin] }).success).toBe(false);
  });
  it('rejects the same date and times twice and equal begin and end', () => {
    expect(
      privatpartyEingabeSchema.safeParse({
        personId: 'p1',
        termine: [termin, { ...termin, stufe: 'notfalls' }],
      }).success,
    ).toBe(false);
    expect(
      privatpartyEingabeSchema.safeParse({
        personId: 'p1',
        termine: [{ ...termin, ende: '19:00' }],
      }).success,
    ).toBe(false);
  });
  it('turns empty texts into null', () => {
    const r = privatpartyEingabeSchema.parse({
      personId: 'p1',
      anlass: '  ',
      notizen: '',
      termine: [termin],
    });
    expect(r.anlass).toBeNull();
    expect(r.notizen).toBeNull();
  });
});

describe('privatpartyPersonEingabeSchema', () => {
  it('needs a name and validates an optional email', () => {
    expect(privatpartyPersonEingabeSchema.safeParse({ name: '' }).success).toBe(false);
    expect(privatpartyPersonEingabeSchema.parse({ name: 'Eva', email: '' }).email).toBeNull();
    expect(privatpartyPersonEingabeSchema.safeParse({ name: 'Eva', email: 'x' }).success).toBe(
      false,
    );
    expect(privatpartyPersonEingabeSchema.safeParse({ name: 'Eva', email: 'e@x.de' }).success).toBe(
      true,
    );
  });
});

describe('helpers', () => {
  it('names poll options with times and Stufe', () => {
    expect(privatpartyOptionName(termin)).toBe('19:00–02:00 · Bevorzugt');
  });
  it('builds the poll title', () => {
    expect(privatpartyUmfrageTitel(null)).toBe('Privatparty');
    expect(privatpartyUmfrageTitel('30. Geburtstag')).toBe('Privatparty: 30. Geburtstag');
  });
  it('parses a status change', () => {
    expect(privatpartyStatusEingabeSchema.safeParse({ status: 'abgesagt' }).success).toBe(true);
    expect(privatpartyStatusEingabeSchema.safeParse({ status: 'x' }).success).toBe(false);
  });
});

describe('zitatTrennen', () => {
  it('keeps plain text', () => {
    expect(zitatTrennen('Hallo\nTschüss')).toEqual({ neu: 'Hallo\nTschüss', zitat: '' });
  });
  it('cuts at "Am … schrieb …:"', () => {
    const r = zitatTrennen(
      'Ja, passt.\n\nAm 12.11.2026 um 10:00 schrieb C4 <a@b.de>:\n> Hallo\n> Wann?',
    );
    expect(r.neu).toBe('Ja, passt.');
    expect(r.zitat).toContain('Am 12.11.2026');
    expect(r.zitat).toContain('> Wann?');
  });
  it('cuts at a wrapped "On … wrote:" and collapses > lines', () => {
    const r = zitatTrennen('Thanks\n\nOn Mon, Nov 9, 2026 at 10:00 AM Eva\n<e@x.de> wrote:\n> hi');
    expect(r.neu).toBe('Thanks');
    expect(zitatTrennen('A\n> q\nB').neu).toBe('A\nB');
  });
});
