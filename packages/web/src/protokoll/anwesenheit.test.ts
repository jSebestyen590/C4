import { describe, expect, it } from 'vitest';
import { protokollKopfLeer, type ProtokollDto, type ProtokollTeilnahmeWert } from '@c4/shared';
import { anwesenheitUhrzeit, fehltZuBeginn, kopfNachAnwesenheit, wertVon } from './anwesenheit';

const person = (sub: string, abgeleitet: ProtokollTeilnahmeWert) => ({
  sub,
  username: sub,
  vorname: '',
  nachname: '',
  status: 'mitglied',
  anrede: 'neutral',
  abgeleitet,
  wert: abgeleitet,
  ueberschrieben: false,
});

const dto = (status: 'entwurf' | 'abgeschlossen' = 'entwurf') =>
  ({
    status,
    teilnahme: [
      person('a', 'anwesend'),
      person('v', 'verspaetet'),
      person('e', 'entschuldigt'),
      person('u', 'unentschuldigt'),
    ],
  }) as unknown as ProtokollDto;

describe('anwesenheitUhrzeit', () => {
  it('is the current Berlin time, independent of the day of the Sitzung', () => {
    expect(anwesenheitUhrzeit(new Date('2026-06-01T19:15:00Z'))).toBe('21:15');
    expect(anwesenheitUhrzeit(new Date('2026-01-01T19:15:00Z'))).toBe('20:15');
  });
});

describe('kopfNachAnwesenheit', () => {
  const kopf = protokollKopfLeer();
  it('locks absent people to "da"', () => {
    expect(fehltZuBeginn('entschuldigt')).toBe(true);
    expect(kopfNachAnwesenheit(dto(), kopf, 'e')?.teilnahme).toEqual({ e: 'anwesend' });
    expect(kopfNachAnwesenheit(dto(), kopf, 'u')?.teilnahme).toEqual({ u: 'anwesend' });
  });
  it('keeps other overrides and does not touch verspaetung', () => {
    const k = { ...kopf, teilnahme: { a: 'entschuldigt' as const } };
    const neu = kopfNachAnwesenheit(dto(), k, 'u');
    expect(neu?.teilnahme).toEqual({ a: 'entschuldigt', u: 'anwesend' });
    expect(neu?.verspaetung).toEqual({});
  });
  it('uses overridden values', () => {
    expect(
      kopfNachAnwesenheit(dto(), { ...kopf, teilnahme: { a: 'unentschuldigt' } }, 'a'),
    ).not.toBeNull();
    expect(kopfNachAnwesenheit(dto(), { ...kopf, teilnahme: { e: 'anwesend' } }, 'e')).toBeNull();
  });
  it('changes nothing for present people (old "verspaetet" counts as present), unknown people or closed protocols', () => {
    expect(kopfNachAnwesenheit(dto(), kopf, 'a')).toBeNull();
    expect(kopfNachAnwesenheit(dto(), kopf, 'v')).toBeNull();
    expect(kopfNachAnwesenheit(dto(), kopf, 'zzz')).toBeNull();
    expect(kopfNachAnwesenheit(dto('abgeschlossen'), kopf, 'e')).toBeNull();
  });
});

describe('wertVon', () => {
  const t = dto().teilnahme[2]!; // entschuldigt
  it('normalises verspaetet and locks people with blocks to anwesend', () => {
    const v = dto().teilnahme[1]!;
    expect(wertVon(v, protokollKopfLeer(), true)).toBe('anwesend');
    expect(wertVon(t, protokollKopfLeer(), true)).toBe('entschuldigt');
    expect(wertVon(t, protokollKopfLeer(), true, { e: { ab: '21:00', bis: '' } })).toBe('anwesend');
    expect(wertVon({ ...v, wert: 'verspaetet' }, protokollKopfLeer(), false)).toBe('anwesend');
  });
});
