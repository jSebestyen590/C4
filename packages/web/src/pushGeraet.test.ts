import { describe, expect, it } from 'vitest';
import { gleicherSchluessel } from './pushGeraet';

// 65-byte uncompressed P-256 point shape: 0x04 followed by 64 bytes.
const bytes = Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 4 : (i * 7) % 256));
const base64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

describe('gleicherSchluessel', () => {
  it('matches the same key as ArrayBuffer or view', () => {
    const key = base64url(bytes);
    expect(gleicherSchluessel(bytes.buffer.slice(0), key)).toBe(true);
    expect(gleicherSchluessel(bytes, key)).toBe(true);
  });

  it('respects view offsets', () => {
    const grosser = new Uint8Array(70);
    grosser.set(bytes, 3);
    expect(gleicherSchluessel(grosser.subarray(3, 68), base64url(bytes))).toBe(true);
  });

  it('rejects different, missing or malformed keys', () => {
    const anders = Uint8Array.from(bytes);
    anders[10] = (anders[10] ?? 0) ^ 1;
    expect(gleicherSchluessel(anders.buffer, base64url(bytes))).toBe(false);
    expect(gleicherSchluessel(bytes.slice(0, 64).buffer, base64url(bytes))).toBe(false);
    expect(gleicherSchluessel(null, base64url(bytes))).toBe(false);
    expect(gleicherSchluessel(bytes, '***')).toBe(false);
  });
});
