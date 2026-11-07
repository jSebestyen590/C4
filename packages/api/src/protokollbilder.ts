import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { protokollBildPrefix } from '@c4/shared';

const UPLOAD_GUELTIG_S = 300;
const ANZEIGE_GUELTIG_S = 3600;

/** Images of protocols: same bucket as the profile pictures, prefix `protokollbilder/{protocol id}/`. */
export interface Protokollbilder {
  /** Presigned PUT (fixed size, JPEG) for a new image of the protocol. */
  uploadVorbereiten(
    protokollId: string,
    groesse: number,
  ): Promise<{ uploadUrl: string; schluessel: string }>;
  anzeigeUrl(schluessel: string): Promise<string>;
  /** Deletes every image of the protocol. */
  loeschen(protokollId: string): Promise<void>;
}

export function createProtokollbilder(bucket: string, region: string): Protokollbilder {
  const s3 = new S3Client({ region });
  return {
    async uploadVorbereiten(protokollId, groesse) {
      const schluessel = `${protokollBildPrefix(protokollId)}${randomUUID()}.jpg`;
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          Key: schluessel,
          ContentType: 'image/jpeg',
          ContentLength: groesse,
        }),
        { expiresIn: UPLOAD_GUELTIG_S },
      );
      return { uploadUrl, schluessel };
    },
    anzeigeUrl: (schluessel) =>
      getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: schluessel }), {
        expiresIn: ANZEIGE_GUELTIG_S,
      }),
    async loeschen(protokollId) {
      let token: string | undefined;
      do {
        const liste = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: protokollBildPrefix(protokollId),
            ContinuationToken: token,
          }),
        );
        const keys = (liste.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
        if (keys.length > 0) {
          await s3.send(
            new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }),
          );
        }
        token = liste.IsTruncated ? liste.NextContinuationToken : undefined;
      } while (token);
    },
  };
}
