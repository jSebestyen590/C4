import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Readable } from 'node:stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { belegDateiSchluessel, type ArchivDaten, type BelegDateiTyp } from '@c4/shared';

const UPLOAD_GUELTIG_S = 300;
const ANZEIGE_GUELTIG_S = 3600;

/**
 * The Finanzarchiv bucket (Object Lock, see docs/finanzen.md): Beleg files under `belege/<sha256>.<ext>`
 * (uploaded by the browser), the daily exports under `export/` and `anker/` (written by the export job).
 * Nothing is ever deleted or overwritten with different content.
 */
export interface Finanzarchiv {
  /** False without a bucket (local development): the chain check then only looks at the database. */
  readonly eingerichtet: boolean;
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
  /** All stored versions below a prefix, grouped by key (version ids oldest first). */
  versionenAuflisten(prefix: string): Promise<{ schluessel: string; versionIds: string[] }[]>;
  /** Text of an object, of one version when `versionId` is given. */
  lesen(schluessel: string, versionId?: string): Promise<string>;
  /** Object content as a stream (for large files); rejects when the object does not exist. */
  lesenStream(schluessel: string): Promise<Readable>;
  /** Writes an object from a stream with a multipart upload (the size need not be known). */
  streamSchreiben(schluessel: string, inhalt: Readable, contentType: string): Promise<void>;
  /** Stored SHA-256 checksum (Base64) of an object, `null` when it does not exist or has none. */
  dateiPruefsumme(schluessel: string): Promise<string | null>;
}

export function createFinanzarchiv(bucket: string, region: string): Finanzarchiv {
  const s3 = new S3Client({ region });
  return {
    eingerichtet: true,
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
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: schluessel,
          Body: inhalt,
          ...(schluessel.endsWith('.zip') && { ContentType: 'application/zip' }),
        }),
      );
    },
    async versionenAuflisten(prefix) {
      const jeSchluessel = new Map<string, { versionId: string; zeit: number }[]>();
      let keyMarker: string | undefined;
      let versionMarker: string | undefined;
      do {
        const seite = await s3.send(
          new ListObjectVersionsCommand({
            Bucket: bucket,
            Prefix: prefix,
            KeyMarker: keyMarker,
            VersionIdMarker: versionMarker,
          }),
        );
        for (const v of seite.Versions ?? []) {
          if (!v.Key) continue;
          const liste = jeSchluessel.get(v.Key) ?? [];
          liste.push({ versionId: v.VersionId ?? 'null', zeit: v.LastModified?.getTime() ?? 0 });
          jeSchluessel.set(v.Key, liste);
        }
        keyMarker = seite.IsTruncated ? seite.NextKeyMarker : undefined;
        versionMarker = seite.IsTruncated ? seite.NextVersionIdMarker : undefined;
      } while (keyMarker !== undefined || versionMarker !== undefined);
      return [...jeSchluessel]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([schluessel, v]) => ({
          schluessel,
          versionIds: v.sort((a, b) => a.zeit - b.zeit).map((x) => x.versionId),
        }));
    },
    async lesen(schluessel, versionId) {
      const res = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: schluessel, VersionId: versionId }),
      );
      return (await res.Body?.transformToString('utf-8')) ?? '';
    },
    async lesenStream(schluessel) {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: schluessel }));
      if (!res.Body) throw new Error(`Objekt ${schluessel} ist leer.`);
      return res.Body as Readable;
    },
    async streamSchreiben(schluessel, inhalt, contentType) {
      // 8 MB parts, 4 in flight: about 32 MB of memory however large the object is.
      await new Upload({
        client: s3,
        params: { Bucket: bucket, Key: schluessel, Body: inhalt, ContentType: contentType },
        partSize: 8 * 1024 * 1024,
        queueSize: 4,
        // The role may not abort (permissions boundary); the bucket's lifecycle drops leftover parts.
        leavePartsOnError: true,
      }).done();
    },
    async dateiPruefsumme(schluessel) {
      try {
        const res = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: schluessel, ChecksumMode: 'ENABLED' }),
        );
        return res.ChecksumSHA256 ?? null;
      } catch (e) {
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404) return null;
        throw e;
      }
    },
  };
}

/** Used while `FINANZARCHIV_BUCKET` is not set (local development): every use fails with a clear message. */
export const finanzarchivNichtEingerichtet: Finanzarchiv = {
  eingerichtet: false,
  uploadVorbereiten: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
  anzeigeUrl: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
  exportSchreiben: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
  versionenAuflisten: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
  lesen: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
  lesenStream: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
  streamSchreiben: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
  dateiPruefsumme: () => Promise.reject(new Error('FINANZARCHIV_BUCKET ist nicht gesetzt.')),
};

const S3_PARALLEL = 16;

/** Maps with at most `S3_PARALLEL` calls at a time, keeping the order. */
async function begrenzt<T, R>(liste: readonly T[], f: (x: T) => Promise<R>): Promise<R[]> {
  const ergebnis: R[] = new Array<R>(liste.length);
  let naechster = 0;
  const arbeiter = async () => {
    while (naechster < liste.length) {
      const i = naechster++;
      ergebnis[i] = await f(liste[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(S3_PARALLEL, liste.length) }, arbeiter));
  return ergebnis;
}

/** Reads everything `pruefeArchiv` needs: all versions of the export, anchor and Festschreibung objects and the Beleg checksums. */
export async function archivLaden(
  archiv: Finanzarchiv,
  belegDateien: readonly { sha256: string; schluessel: string }[],
): Promise<ArchivDaten> {
  const gelistet = (
    await Promise.all(
      ['export/', 'anker/', 'festschreibung/'].map((p) => archiv.versionenAuflisten(p)),
    )
  ).flat();
  const objekte = await begrenzt(gelistet, async (o) => ({
    schluessel: o.schluessel,
    versionen: await Promise.all(o.versionIds.map((v) => archiv.lesen(o.schluessel, v))),
  }));
  const dateien = await begrenzt(belegDateien, async (d) => ({
    sha256: d.sha256,
    pruefsumme: await archiv.dateiPruefsumme(d.schluessel),
  }));
  return { objekte, belegDateien: dateien };
}
