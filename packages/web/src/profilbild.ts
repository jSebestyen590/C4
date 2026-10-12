const KLEIN_KANTE = 256;

/** Selected square in pixels of the original picture. */
export interface Ausschnitt {
  x: number;
  y: number;
  width: number;
  height: number;
}

const alsBild = (canvas: HTMLCanvasElement, typ: string, qualitaet: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht umgewandelt werden'))),
      typ,
      qualitaet,
    );
  });

export interface Profilbilder {
  /** The selected area at full resolution; PNGs stay lossless, everything else is a 95 % JPEG. */
  gross: Blob;
  /** The selected area as a JPEG of at most 256 px. */
  klein: Blob;
}

/** Cuts the selected square out of the picture: once at full resolution, once scaled down. */
export async function profilbilderErzeugen(
  datei: File,
  ausschnitt: Ausschnitt,
): Promise<Profilbilder> {
  const bild = await createImageBitmap(datei);
  try {
    const zuschneiden = (maxKante: number) => {
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
      return canvas;
    };
    const [gross, klein] = await Promise.all([
      alsBild(
        zuschneiden(Number.POSITIVE_INFINITY),
        datei.type === 'image/png' ? 'image/png' : 'image/jpeg',
        0.95,
      ),
      alsBild(zuschneiden(KLEIN_KANTE), 'image/jpeg', 0.85),
    ]);
    return { gross, klein };
  } finally {
    bild.close();
  }
}
