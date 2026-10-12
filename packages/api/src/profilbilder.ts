import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import type { ProfilbildAnfrage } from '@c4/shared';

const UPLOAD_GUELTIG_S = 300;
const ANZEIGE_GUELTIG_S = 3600;

const ENDUNG: Record<ProfilbildAnfrage['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface Profilbilder {
  /** Presigned PUT for a new picture below the member's own prefix. */
  uploadVorbereiten(
    sub: string,
    anfrage: ProfilbildAnfrage,
  ): Promise<{ uploadUrl: string; kleinUploadUrl: string; key: string }>;
  anzeigeUrl(key: string): Promise<string>;
  /** Deletes the large picture and its small variant. */
  loeschen(key: string): Promise<void>;
}

/** Key of the small variant (always a JPEG) that belongs to the original `key`. */
export const kleinKey = (key: string) => key.replace(/\.[^./]+$/, '-klein.jpg');

export const profilbildPrefix = (sub: string) => `profilbilder/${sub}/`;

export function createProfilbilder(bucket: string, region: string): Profilbilder {
  const s3 = new S3Client({ region });
  return {
    async uploadVorbereiten(sub, { contentType, groesse, kleinGroesse }) {
      const key = `${profilbildPrefix(sub)}${randomUUID()}.${ENDUNG[contentType]}`;
      const putUrl = (k: string, typ: string, laenge: number) =>
        getSignedUrl(
          s3,
          new PutObjectCommand({
            Bucket: bucket,
            Key: k,
            ContentType: typ,
            ContentLength: laenge,
          }),
          { expiresIn: UPLOAD_GUELTIG_S },
        );
      const [uploadUrl, kleinUploadUrl] = await Promise.all([
        putUrl(key, contentType, groesse),
        putUrl(kleinKey(key), 'image/jpeg', kleinGroesse),
      ]);
      return { uploadUrl, kleinUploadUrl, key };
    },
    anzeigeUrl: (key) =>
      getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: ANZEIGE_GUELTIG_S,
      }),
    async loeschen(key) {
      await Promise.all(
        [key, kleinKey(key)].map((k) =>
          s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: k })),
        ),
      );
    },
  };
}
