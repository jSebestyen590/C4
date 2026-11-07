/** Whether the bytes start like a JPEG (the only format the editor uploads). */
export const istJpeg = (bytes: Uint8Array): boolean =>
  bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

function alsDataUrl(bytes: Uint8Array): string {
  let binaer = '';
  const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + block));
  }
  return `data:image/jpeg;base64,${btoa(binaer)}`;
}

/**
 * Loads the images of a protocol for the PDF and returns them as data URLs by key. Images that cannot be
 * loaded (expired or missing URL, network error, not a JPEG) are left out: the PDF then shows a placeholder
 * text instead of failing as a whole.
 */
export async function bilderFuerPdf(
  schluessel: readonly string[],
  urls: Readonly<Record<string, string>>,
  laden: (url: string) => Promise<Pick<Response, 'ok' | 'arrayBuffer'>>,
): Promise<Record<string, string>> {
  const ergebnis: Record<string, string> = {};
  await Promise.all(
    schluessel.map(async (key) => {
      const url = urls[key];
      if (!url) return;
      try {
        const res = await laden(url);
        if (!res.ok) return;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (istJpeg(bytes)) ergebnis[key] = alsDataUrl(bytes);
      } catch (err) {
        console.error('Loading a protocol image for the PDF failed', err);
      }
    }),
  );
  return ergebnis;
}
