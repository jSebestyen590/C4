import { describe, expect, it } from 'vitest';
import { protokollKopfLeer, type ProtokollDto, type ProtokollTeilnahmeWert } from '@c4/shared';
import { anwesenheitUhrzeit, fehltZuBeginn, kopfNachErscheinen } from './anwesenheit';

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

describe('kopfNachErscheinen', () => {
  const kopf = protokollKopfLeer();
  it('marks absent people as late', () => {
    expect(fehltZuBeginn('entschuldigt')).toBe(true);
    expect(kopfNachErscheinen(dto(), kopf, 'e')?.teilnahme).toEqual({ e: 'verspaetet' });
    expect(kopfNachErscheinen(dto(), kopf, 'u')?.teilnahme).toEqual({ u: 'verspaetet' });
  });
  it('keeps other overrides and does not touch verspaetung', () => {
    const k = { ...kopf, teilnahme: { a: 'entschuldigt' as const } };
    const neu = kopfNachErscheinen(dto(), k, 'u');
    expect(neu?.teilnahme).toEqual({ a: 'entschuldigt', u: 'verspaetet' });
    expect(neu?.verspaetung).toEqual({});
  });
  it('uses overridden values', () => {
    expect(
      kopfNachErscheinen(dto(), { ...kopf, teilnahme: { a: 'unentschuldigt' } }, 'a'),
    ).not.toBeNull();
    expect(kopfNachErscheinen(dto(), { ...kopf, teilnahme: { e: 'anwesend' } }, 'e')).toBeNull();
  });
  it('changes nothing for present or late people, unknown people or closed protocols', () => {
    expect(kopfNachErscheinen(dto(), kopf, 'a')).toBeNull();
    expect(kopfNachErscheinen(dto(), kopf, 'v')).toBeNull();
    expect(kopfNachErscheinen(dto(), kopf, 'zzz')).toBeNull();
    expect(kopfNachErscheinen(dto('abgeschlossen'), kopf, 'e')).toBeNull();
  });
});
