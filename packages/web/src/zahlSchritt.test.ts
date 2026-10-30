import { describe, expect, it } from 'vitest';
import { alsZahl, amRand, naechsterWert } from './zahlSchritt';

describe('naechsterWert', () => {
  it('steps by 1 by default', () => {
    expect(naechsterWert(3, 1)).toBe(4);
    expect(naechsterWert(3, -1)).toBe(2);
  });
  it('clamps to min and max', () => {
    expect(naechsterWert(1, -1, { min: 1 })).toBe(1);
    expect(naechsterWert(9, 1, { max: 9 })).toBe(9);
    expect(naechsterWert(0, -1, { min: 2 })).toBe(2);
  });
  it('treats an empty field as 0 and respects min', () => {
    expect(naechsterWert('', 1)).toBe(1);
    expect(naechsterWert('', 1, { min: 3 })).toBe(3);
  });
  it('avoids floating point noise with decimal steps', () => {
    expect(naechsterWert(0.1, 1, { step: 0.2 })).toBe(0.3);
    expect(naechsterWert(0.5, 1, { step: 0.5, min: 0.5, max: 2 })).toBe(1);
    expect(naechsterWert(0.5, -1, { step: 0.5, min: 0.5 })).toBe(0.5);
  });
  it('accepts numeric strings', () => {
    expect(naechsterWert('2,5', 1, { step: 0.5 })).toBe(3);
  });
});

describe('amRand', () => {
  it('detects bounds', () => {
    expect(amRand(1, -1, { min: 1 })).toBe(true);
    expect(amRand(2, -1, { min: 1 })).toBe(false);
    expect(amRand(5, 1, { max: 5 })).toBe(true);
    expect(amRand(5, 1, {})).toBe(false);
  });
  it('is false for an empty field', () => {
    expect(amRand('', -1, { min: 1 })).toBe(false);
  });
});

describe('alsZahl', () => {
  it('parses', () => {
    expect(alsZahl('')).toBeUndefined();
    expect(alsZahl('1,5')).toBe(1.5);
    expect(alsZahl(4)).toBe(4);
  });
});
