import { describe, expect, it } from 'vitest';
import { kleinKey } from './profilbilder';

describe('kleinKey', () => {
  it('is always a JPEG next to the original', () => {
    expect(kleinKey('profilbilder/abc/1234.jpg')).toBe('profilbilder/abc/1234-klein.jpg');
    expect(kleinKey('profilbilder/abc/1234.png')).toBe('profilbilder/abc/1234-klein.jpg');
  });
  it('only touches the file name', () => {
    expect(kleinKey('profilbilder/a.b/1234.webp')).toBe('profilbilder/a.b/1234-klein.jpg');
  });
});
