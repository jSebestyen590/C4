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
  ): Promise<{ uploadUrl: string; key: string }>;
  anzeigeUrl(key: string): Promise<string>;
  loeschen(key: string): Promise<void>;
}

export const profilbildPrefix = (sub: string) => `profilbilder/${sub}/`;

export function createProfilbilder(bucket: string, region: string): Profilbilder {
  const s3 = new S3Client({ region });
  return {
    async uploadVorbereiten(sub, { contentType, groesse }) {
      const key = `${profilbildPrefix(sub)}${randomUUID()}.${ENDUNG[contentType]}`;
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: groesse,
        }),
        { expiresIn: UPLOAD_GUELTIG_S },
      );
      return { uploadUrl, key };
    },
    anzeigeUrl: (key) =>
      getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: ANZEIGE_GUELTIG_S,
      }),
    async loeschen(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
