import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { lagerortKeys, warenKeys } from './warenDaten';

/** After a successful booking: refresh stock, tell the user and go back to the Lager page. */
export function useBuchungAbschluss() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async (nachricht: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: warenKeys.alle }),
      qc.invalidateQueries({ queryKey: lagerortKeys.bestand }),
    ]);
    notifications.show({ color: 'green', message: nachricht });
    navigate('/lager');
  };
}
