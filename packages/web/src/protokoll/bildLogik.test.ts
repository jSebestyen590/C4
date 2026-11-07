import { describe, expect, it } from 'vitest';
import { BILD_MAX_KANTE, istBilddatei, zielGroesse } from './bildLogik';
import { bilderFuerPdf, istJpeg } from './pdfBilder';

describe('zielGroesse', () => {
  it('scales the long side down to 2000 px and keeps the ratio', () => {
    expect(BILD_MAX_KANTE).toBe(2000);
    expect(zielGroesse(4000, 3000)).toEqual({ breite: 2000, hoehe: 1500 });
    expect(zielGroesse(3000, 4000)).toEqual({ breite: 1500, hoehe: 2000 });
    expect(zielGroesse(4032, 3024)).toEqual({ breite: 2000, hoehe: 1500 });
  });

  it('never scales up and never returns 0', () => {
    expect(zielGroesse(800, 600)).toEqual({ breite: 800, hoehe: 600 });
    expect(zielGroesse(2000, 2000)).toEqual({ breite: 2000, hoehe: 2000 });
    expect(zielGroesse(20000, 1)).toEqual({ breite: 2000, hoehe: 1 });
  });
});

describe('istBilddatei', () => {
  it('takes image types and image extensions (HEIC often has no type)', () => {
    expect(istBilddatei({ type: 'image/png', name: 'a' })).toBe(true);
    expect(istBilddatei({ type: '', name: 'IMG_1.HEIC' })).toBe(true);
    expect(istBilddatei({ type: 'application/pdf', name: 'a.pdf' })).toBe(false);
  });
});

describe('bilderFuerPdf', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const antwort = (bytes: Uint8Array, ok = true) =>
    Promise.resolve({ ok, arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer) });

  it('knows JPEG bytes', () => {
    expect(istJpeg(jpeg)).toBe(true);
    expect(istJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('returns data URLs and leaves out images that fail, are missing or not a JPEG', async () => {
    const laden = (url: string) => {
      if (url === 'u-ok') return antwort(jpeg);
      if (url === 'u-404') return antwort(jpeg, false);
      if (url === 'u-png') return antwort(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
      return Promise.reject(new Error('Netzwerk'));
    };
    const ergebnis = await bilderFuerPdf(
      ['ok', '404', 'png', 'netz', 'ohneUrl'],
      { ok: 'u-ok', '404': 'u-404', png: 'u-png', netz: 'u-netz' },
      laden,
    );
    expect(Object.keys(ergebnis)).toEqual(['ok']);
    expect(ergebnis.ok).toBe(`data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`);
  });
});
