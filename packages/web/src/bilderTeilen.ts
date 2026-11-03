import { notifications } from '@mantine/notifications';
import { useApi } from './api';
import { fehlerText, pruefen } from './warenApi';

/** Whether a URL is an anonymous OneDrive sharing link (not the plain web URL of the folder). */
export const istFreigabeLink = (url: string): boolean => /^https:\/\/1drv\.ms\//.test(url);

/**
 * Shares the read-only link of a photo folder: the system share sheet when available, else the
 * clipboard. Pass the link when it is known: `navigator.share` must run inside the tap, which a
 * fetch before it can lose on iOS. Without a link, it is requested first (and cached by the API).
 */
export function useBilderTeilen() {
  const api = useApi();

  const linkTeilen = async (titel: string, url: string) => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: titel, url });
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') throw err;
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    notifications.show({
      color: 'green',
      message: 'Link kopiert. Alle mit dem Link können die Bilder ansehen.',
    });
  };

  return async (ordnerId: string, titel: string, url?: string | null) => {
    try {
      if (url && istFreigabeLink(url)) return await linkTeilen(titel, url);
      const res = await api.bilder.ordner[':id'].freigabe.$post({ param: { id: ordnerId } });
      await pruefen(res);
      const { url: neu } = (await res.json()) as { url: string };
      await linkTeilen(titel, neu);
    } catch (err) {
      notifications.show({ color: 'red', message: fehlerText(err) });
    }
  };
}
