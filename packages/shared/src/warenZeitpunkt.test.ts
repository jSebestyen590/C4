import { describe, expect, it } from 'vitest';
import { buchungsZeitpunktSchema, ZUKUNFT_TOLERANZ_MS } from './waren';

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('buchungsZeitpunktSchema', () => {
  it('allows the past and a phone clock slightly ahead', () => {
    expect(buchungsZeitpunktSchema.safeParse(iso(-86_400_000)).success).toBe(true);
    expect(buchungsZeitpunktSchema.safeParse(iso(ZUKUNFT_TOLERANZ_MS - 30_000)).success).toBe(true);
  });
  it('rejects times beyond the tolerance', () => {
    const res = buchungsZeitpunktSchema.safeParse(iso(ZUKUNFT_TOLERANZ_MS + 30_000));
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe('Der Zeitpunkt darf nicht in der Zukunft liegen.');
    expect(buchungsZeitpunktSchema.safeParse(iso(86_400_000)).success).toBe(false);
  });
  it('keeps the format error for garbage', () => {
    const res = buchungsZeitpunktSchema.safeParse('gestern');
    expect(res.error?.issues[0]?.message).toBe('Ungültiger Zeitpunkt.');
  });
});
