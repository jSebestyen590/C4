import { describe, expect, it } from 'vitest';
import { ruecksprungZiel } from './ruecksprung';

const base = '/app/';

describe('ruecksprungZiel', () => {
  it('returns a deep link inside the app', () => {
    expect(ruecksprungZiel({ ziel: '/app/protokolle/123?a=1#x' }, base)).toBe(
      '/app/protokolle/123?a=1#x',
    );
  });
  it('falls back to the start page for foreign or unsafe targets', () => {
    expect(ruecksprungZiel({ ziel: 'https://evil.example/app/' }, base)).toBe(base);
    expect(ruecksprungZiel({ ziel: '//evil.example' }, base)).toBe(base);
    expect(ruecksprungZiel({ ziel: '/app/\\evil' }, base)).toBe(base);
    expect(ruecksprungZiel({ ziel: '/other/page' }, base)).toBe(base);
  });
  it('never returns to the callback page', () => {
    expect(ruecksprungZiel({ ziel: '/app/auth/callback?code=1' }, base)).toBe(base);
  });
  it('falls back without usable state', () => {
    expect(ruecksprungZiel(undefined, base)).toBe(base);
    expect(ruecksprungZiel(null, base)).toBe(base);
    expect(ruecksprungZiel({ ziel: 5 }, base)).toBe(base);
  });
});
