const MAX_KANTE = 512;

/** Scales the picture down so uploads stay small; always yields a JPEG. */
export async function profilbildVerkleinern(datei: File): Promise<Blob> {
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, MAX_KANTE / Math.max(bild.width, bild.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bild.width * faktor);
  canvas.height = Math.round(bild.height * faktor);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  ctx.drawImage(bild, 0, 0, canvas.width, canvas.height);
  bild.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht umgewandelt werden'))),
      'image/jpeg',
      0.85,
    );
  });
}
