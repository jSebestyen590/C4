import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { unwrap, useApi } from './api';
import {
  geraetAbgleichen,
  geraetAbonnieren,
  geraetDeaktivieren,
  hatLokalesAbo,
  pushStatus,
  type PushStatus,
} from './pushGeraet';
import { fehlerAnzeigen } from './warenApi';

export const PUSH_STATUS_KEY = ['push-status'];

type Api = ReturnType<typeof useApi>;

/**
 * Re-registers this device's subscription with the server (and renews it if the server's VAPID key
 * changed, e.g. after a database reset). Errors are only logged. Returns whether a subscription exists.
 */
export async function pushAbgleichen(api: Api): Promise<boolean> {
  try {
    if (!(await hatLokalesAbo())) return false;
    const { publicKey } = await unwrap(await api.push.schluessel.$get());
    const abo = await geraetAbgleichen(publicKey);
    if (!abo) return false;
    await unwrap(await api.push.abos.$post({ json: abo }));
    return true;
  } catch (e) {
    console.error('Push sync failed', e);
    return false;
  }
}

let abgeglichen = false;

/** Syncs once per app start; mount after the profile gate passed (`bereit`). */
export function usePushAbgleichBeimStart(bereit: boolean) {
  const api = useApi();
  const qc = useQueryClient();
  useEffect(() => {
    if (!bereit || abgeglichen) return;
    abgeglichen = true;
    void pushAbgleichen(api).finally(() => qc.invalidateQueries({ queryKey: PUSH_STATUS_KEY }));
  }, [bereit, api, qc]);
}

/** Push on this device, shared by the notifications page and the post-login dialog. */
export function usePushGeraet() {
  const api = useApi();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: PUSH_STATUS_KEY,
    queryFn: () =>
      pushStatus(
        async (endpoint) =>
          (await unwrap(await api.push.abos.status.$get({ query: { endpoint } }))).registriert,
      ),
  });
  const [aktiviertGerade, setAktiviertGerade] = useState(false);
  const [deaktiviertGerade, setDeaktiviertGerade] = useState(false);

  /**
   * Call directly from a click handler: the permission prompt is the first thing that happens, with
   * no await before it, because iOS only shows it inside the user gesture. Returns true on success.
   */
  const aktivieren = async (): Promise<boolean> => {
    const erlaubnis = Notification.requestPermission();
    setAktiviertGerade(true);
    try {
      if ((await erlaubnis) !== 'granted') {
        notifications.show({
          color: 'yellow',
          message: 'Ohne Erlaubnis können wir dir keine Benachrichtigungen schicken.',
        });
        return false;
      }
      const { publicKey } = await unwrap(await api.push.schluessel.$get());
      const abo = await geraetAbonnieren(publicKey);
      await unwrap(await api.push.abos.$post({ json: abo }));
      notifications.show({ color: 'green', message: 'Push ist auf diesem Gerät aktiv.' });
      return true;
    } catch (e) {
      fehlerAnzeigen(e, 'Push konnte nicht aktiviert werden.');
      return false;
    } finally {
      setAktiviertGerade(false);
      void qc.invalidateQueries({ queryKey: PUSH_STATUS_KEY });
    }
  };

  const deaktivieren = async (): Promise<void> => {
    setDeaktiviertGerade(true);
    try {
      const endpoint = await geraetDeaktivieren();
      if (endpoint) await unwrap(await api.push.abos.$delete({ json: { endpoint } }));
    } catch (e) {
      fehlerAnzeigen(e, 'Push konnte nicht deaktiviert werden.');
    } finally {
      setDeaktiviertGerade(false);
      void qc.invalidateQueries({ queryKey: PUSH_STATUS_KEY });
    }
  };

  const syncNoetig = async (): Promise<boolean> => {
    if (!(await hatLokalesAbo())) return false;
    await pushAbgleichen(api);
    void qc.invalidateQueries({ queryKey: PUSH_STATUS_KEY });
    return true;
  };

  return {
    syncNoetig,
    status: (status.data ?? 'laedt') as PushStatus,
    aktivieren,
    aktiviertGerade,
    deaktivieren,
    deaktiviertGerade,
  };
}
