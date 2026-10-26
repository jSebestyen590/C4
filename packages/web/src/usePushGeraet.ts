import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { unwrap, useApi } from './api';
import { geraetAbonnieren, geraetDeaktivieren, pushStatus, type PushStatus } from './pushGeraet';
import { fehlerAnzeigen } from './warenApi';

export const PUSH_STATUS_KEY = ['push-status'];

/** Push on this device, shared by the notifications page and the post-login dialog. */
export function usePushGeraet() {
  const api = useApi();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: PUSH_STATUS_KEY, queryFn: pushStatus });
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

  return {
    status: (status.data ?? 'laedt') as PushStatus,
    aktivieren,
    aktiviertGerade,
    deaktivieren,
    deaktiviertGerade,
  };
}
