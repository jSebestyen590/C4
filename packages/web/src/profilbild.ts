const GROSS_KANTE = 512;
const KLEIN_KANTE = 256;

/** Selected square in pixels of the original picture. */
export interface Ausschnitt {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Profilbilder {
  /** Up to 512 px; shown when the picture is opened. */
  gross: Blob;
  /** Up to 256 px; shown everywhere else. */
  klein: Blob;
}

const alsJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht umgewandelt werden'))),
      'image/jpeg',
      0.85,
    );
  });

/** Cuts the selected square out of the picture and scales it to both sizes (never enlarging). */
export async function profilbilderErzeugen(
  datei: File,
  ausschnitt: Ausschnitt,
): Promise<Profilbilder> {
  const bild = await createImageBitmap(datei);
  try {
    const erzeugen = (maxKante: number) => {
      const kante = Math.max(1, Math.round(Math.min(maxKante, ausschnitt.width)));
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
      return alsJpeg(canvas);
    };
    const [gross, klein] = await Promise.all([erzeugen(GROSS_KANTE), erzeugen(KLEIN_KANTE)]);
    return { gross, klein };
  } finally {
    bild.close();
  }
}
