import { useCallback, useMemo, useRef, useState } from 'react';
import type { ProtokollBildUploadDto, ProtokollDto } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { pruefen } from '../warenApi';

/** Image URLs of a protocol page and the calls the editor needs to upload new images. */
export interface BilderZugriff {
  protokollId: string;
  /** Presigned GET URLs by key, plus local previews of images uploaded in this session. */
  urls: Readonly<Record<string, string>>;
  /** Fetches fresh URLs (e.g. after one expired); at most once per `ERNEUERN_PAUSE_MS`. */
  erneuern: () => void;
  /** Remembers the (local) URL of a fresh upload. */
  hinzufuegen: (schluessel: string, url: string) => void;
  /** Asks the API for an upload URL for an image of `groesse` bytes. */
  uploadVorbereiten: (groesse: number) => Promise<ProtokollBildUploadDto>;
}

export const ERNEUERN_PAUSE_MS = 30_000;

/**
 * Keeps the image URLs of an open protocol. Refreshing does not touch the document: the page re-keys
 * the editor on every refetch of the protocol, so the URLs come from their own request.
 */
export function useProtokollBilder(id: string, anfang: Record<string, string>): BilderZugriff {
  const api = useApi();
  const [urls, setUrls] = useState<Record<string, string>>(anfang);
  const zuletzt = useRef(0);
  const laeuft = useRef(false);

  const erneuern = useCallback(() => {
    const jetzt = Date.now();
    if (laeuft.current || jetzt - zuletzt.current < ERNEUERN_PAUSE_MS) return;
    laeuft.current = true;
    zuletzt.current = jetzt;
    void (async () => {
      try {
        const dto = (await unwrap(
          await api.protokolle[':id'].$get({ param: { id } }),
        )) as ProtokollDto;
        setUrls((alt) => ({ ...alt, ...dto.bilder }));
      } catch (err) {
        console.error('Refreshing the protocol image URLs failed', err);
      } finally {
        laeuft.current = false;
      }
    })();
  }, [api, id]);

  const hinzufuegen = useCallback(
    (schluessel: string, url: string) => setUrls((alt) => ({ ...alt, [schluessel]: url })),
    [],
  );

  const uploadVorbereiten = useCallback(
    async (groesse: number) => {
      const res = await api.protokolle[':id'].bilder.$post({
        param: { id },
        json: { groesse },
      });
      await pruefen(res);
      return (await res.json()) as unknown as ProtokollBildUploadDto;
    },
    [api, id],
  );

  return useMemo(
    () => ({ protokollId: id, urls, erneuern, hinzufuegen, uploadVorbereiten }),
    [id, urls, erneuern, hinzufuegen, uploadVorbereiten],
  );
}
