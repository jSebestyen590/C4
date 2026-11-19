import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { belegDateiSchluessel, type BelegDateiTyp } from '@c4/shared';

const UPLOAD_GUELTIG_S = 300;
const ANZEIGE_GUELTIG_S = 3600;

/**
 * The Finanzarchiv bucket (Object Lock, see docs/finanzen.md): Beleg files under `belege/<sha256>.<ext>`
 * (uploaded by the browser), the daily exports under `export/` and `anker/` (written by the export job).
 * Nothing is ever deleted or overwritten with different content.
 */
export interface Finanzarchiv {
  /**
   * Presigned PUT for a Beleg file. The SHA-256 (hex from the browser) is a signed header: the
   * browser must send `x-amz-checksum-sha256` (Base64, returned) and the `Content-Type`, and S3 rejects
   * the upload when the content does not match.
   */
  uploadVorbereiten(datei: {
    sha256: string;
    groesse: number;
    typ: BelegDateiTyp;
  }): Promise<{ uploadUrl: string; schluessel: string; checksumSha256: string }>;
  anzeigeUrl(schluessel: string): Promise<string>;
  /** Writes an export or anchor file. */
  exportSchreiben(schluessel: string, inhalt: string | Uint8Array): Promise<void>;
}

export function createFinanzarchiv(bucket: string, region: string): Finanzarchiv {
  const s3 = new S3Client({ region });
  return {
    async uploadVorbereiten({ sha256, groesse, typ }) {
      const schluessel = belegDateiSchluessel(sha256, typ);
      const checksumSha256 = Buffer.from(sha256, 'hex').toString('base64');
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          Key: schluessel,
          ContentType: typ,
          ContentLength: groesse,
          ChecksumSHA256: checksumSha256,
        }),
        {
          expiresIn: UPLOAD_GUELTIG_S,
          // Without this the presigner moves the checksum into the query string (not verified by S3)
          // and leaves Content-Type unsigned.
          unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
          signableHeaders: new Set(['content-type']),
        },
      );
      return { uploadUrl, schluessel, checksumSha256 };
    },
    anzeigeUrl: (schluessel) =>
      getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: schluessel }), {
        expiresIn: ANZEIGE_GUELTIG_S,
      }),
    async exportSchreiben(schluessel, inhalt) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: schluessel, Body: inhalt }));
    },
  };
}

/** Used while `FINANZARCHIV_BUCKET` is not set (local development): every use fails with a clear message. */
export const finanzarchivNichtEingerichtet: Finanzarchiv = {
  uploadVorbereiten: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
  anzeigeUrl: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
  exportSchreiben: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
};
