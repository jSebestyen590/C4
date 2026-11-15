import { describe, expect, it } from 'vitest';
import { formatDatum, formatDatumZeit, formatZeit } from './datum';

// 14 Oct 2026 09:30:05 UTC = 11:30:05 in Berlin (CEST); 15 Jan 2026 23:30 UTC = 16 Jan 00:30 (CET).
const SOMMER = '2026-10-14T09:30:05Z';
const WINTER = '2026-01-15T23:30:00Z';

describe('datum', () => {
  it('formats the day in Berlin time', () => {
    expect(formatDatum(SOMMER)).toBe('14.10.2026');
    expect(formatDatum(WINTER)).toBe('16.01.2026');
    expect(formatDatum(SOMMER, 'jahrKurz')).toBe('14.10.26');
  });

  it('formats day and time without comma by default', () => {
    expect(formatDatumZeit(SOMMER)).toBe('14.10.2026 11:30');
    expect(formatDatumZeit(WINTER)).toBe('16.01.2026 00:30');
    expect(formatDatumZeit(SOMMER, 'jahrKurz')).toBe('14.10.26 11:30');
    expect(formatDatumZeit(SOMMER, 'ohneJahr')).toBe('14.10. 11:30');
  });

  it('keeps the comma of the Intl date styles', () => {
    expect(formatDatumZeit(SOMMER, 'mittel')).toBe('14.10.2026, 11:30');
    expect(formatDatumZeit(SOMMER, 'mittelSekunden')).toBe('14.10.2026, 11:30:05');
    expect(formatDatumZeit(SOMMER, 'kurz')).toBe('14.10.26, 11:30');
  });

  it('formats the time and accepts numbers and Dates', () => {
    expect(formatZeit(SOMMER)).toBe('11:30');
    expect(formatZeit(new Date(SOMMER))).toBe('11:30');
    expect(formatDatum(Date.parse(SOMMER))).toBe('14.10.2026');
  });
});
