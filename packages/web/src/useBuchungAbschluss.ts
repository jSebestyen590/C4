import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

/** After a successful booking: refresh stock, tell the user and go back to the Lager page. */
export function useBuchungAbschluss() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async (nachricht: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['waren'] }),
      qc.invalidateQueries({ queryKey: ['lagerorte', 'bestand'] }),
    ]);
    notifications.show({ color: 'green', message: nachricht });
    navigate('/lager');
  };
}
