import { describe, expect, it } from 'vitest';
import { erinnerungText } from './kalenderZeit';

describe('erinnerungText', () => {
  it('uses the largest unit that divides evenly, singular and plural', () => {
    expect(erinnerungText(10080)).toBe('1 Woche vorher');
    expect(erinnerungText(20160)).toBe('2 Wochen vorher');
    expect(erinnerungText(2880)).toBe('2 Tage vorher');
    expect(erinnerungText(1440)).toBe('1 Tag vorher');
    expect(erinnerungText(180)).toBe('3 Stunden vorher');
    expect(erinnerungText(60)).toBe('1 Stunde vorher');
    expect(erinnerungText(90)).toBe('90 Minuten vorher');
    expect(erinnerungText(15)).toBe('15 Minuten vorher');
    expect(erinnerungText(4320 + 60)).toBe('73 Stunden vorher');
  });
});
