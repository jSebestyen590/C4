import { PROTOKOLL_BILD_MAX_BYTES } from '@c4/shared';

// Pure and browser helpers for the images of a protocol: scaling and the upload.

/** Longest side of an uploaded image in pixels. */
export const BILD_MAX_KANTE = 2000;
export const BILD_QUALITAET = 0.85;

/** Size scaled down to at most `max` on the long side (never scaled up), whole pixels, at least 1. */
export function zielGroesse(
  breite: number,
  hoehe: number,
  max = BILD_MAX_KANTE,
): { breite: number; hoehe: number } {
  const lang = Math.max(breite, hoehe);
  const faktor = lang > max ? max / lang : 1;
  return {
    breite: Math.max(1, Math.round(breite * faktor)),
    hoehe: Math.max(1, Math.round(hoehe * faktor)),
  };
}

/** Whether the file looks like an image (some browsers leave the type of HEIC files empty). */
export const istBilddatei = (datei: Pick<File, 'type' | 'name'>): boolean =>
  datei.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(datei.name);

export const BILD_FEHLER = {
  lesen: 'Das Bild konnte nicht gelesen werden. Nimm ein JPEG- oder PNG-Bild.',
  zuGross: 'Das Bild ist zu groß (höchstens 5 MB).',
  hochladen: 'Das Bild konnte nicht hochgeladen werden.',
  keinBild: 'Das ist keine Bilddatei.',
} as const;

const alsJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(BILD_FEHLER.lesen))),
      'image/jpeg',
      BILD_QUALITAET,
    );
  });

/** Scales the picture to at most 2000 px on the long side and always makes a JPEG of it. */
export async function bildSkalieren(datei: Blob): Promise<Blob> {
  let bild: ImageBitmap;
  try {
    bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(BILD_FEHLER.lesen);
  }
  try {
    const { breite, hoehe } = zielGroesse(bild.width, bild.height);
    const canvas = document.createElement('canvas');
    canvas.width = breite;
    canvas.height = hoehe;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(BILD_FEHLER.lesen);
    // JPEG has no transparency: PNGs with transparent areas get a white background.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, breite, hoehe);
    ctx.drawImage(bild, 0, 0, breite, hoehe);
    const blob = await alsJpeg(canvas);
    if (blob.size > PROTOKOLL_BILD_MAX_BYTES) throw new Error(BILD_FEHLER.zuGross);
    return blob;
  } finally {
    bild.close();
  }
}

/** PUT of the image to the presigned URL with upload progress (0..1). */
export function bildPut(
  url: string,
  blob: Blob,
  fortschritt: (anteil: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'image/jpeg');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) fortschritt(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(BILD_FEHLER.hochladen));
    xhr.onerror = () => reject(new Error(BILD_FEHLER.hochladen));
    xhr.send(blob);
  });
}
