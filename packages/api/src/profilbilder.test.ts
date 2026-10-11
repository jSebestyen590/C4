import { describe, expect, it } from 'vitest';
import { kleinKey } from './profilbilder';

describe('kleinKey', () => {
  it('inserts the suffix before the extension', () => {
    expect(kleinKey('profilbilder/abc/1234.jpg')).toBe('profilbilder/abc/1234-klein.jpg');
  });
  it('only touches the file name', () => {
    expect(kleinKey('profilbilder/a.b/1234.png')).toBe('profilbilder/a.b/1234-klein.png');
  });
});
