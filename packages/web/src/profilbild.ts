const KLEIN_KANTE = 256;

/** Selected square in pixels of the original picture. */
export interface Ausschnitt {
  x: number;
  y: number;
  width: number;
  height: number;
}

const alsJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht umgewandelt werden'))),
      'image/jpeg',
      0.85,
    );
  });

/**
 * Cuts the selected square out of the picture and scales it down to the small variant (never
 * enlarging). The original file itself is uploaded unchanged.
 */
export async function kleinesProfilbild(datei: File, ausschnitt: Ausschnitt): Promise<Blob> {
  const bild = await createImageBitmap(datei);
  try {
    const kante = Math.max(1, Math.round(Math.min(KLEIN_KANTE, ausschnitt.width)));
    const canvas = document.createElement('canvas');
    canvas.width = kante;
    canvas.height = kante;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas nicht verfügbar');
    ctx.drawImage(
      bild,
      ausschnitt.x,
      ausschnitt.y,
      ausschnitt.width,
      ausschnitt.height,
      0,
      0,
      kante,
      kante,
    );
    return await alsJpeg(canvas);
  } finally {
    bild.close();
  }
}
