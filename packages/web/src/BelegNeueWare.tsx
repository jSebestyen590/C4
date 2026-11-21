import { Alert, Modal } from '@mantine/core';
import { WareFormular } from './WareFormular';
import { useWarenStammdaten } from './warenDaten';

/**
 * "Neue Ware anlegen" from a Beleg row: the Ware form (modal) with the typed name prefilled. Mount it
 * only while open and outside the Beleg `<form>` (events of a portal bubble through React parents).
 */
export function BelegNeueWare({
  name,
  onAngelegt,
  onClose,
}: Readonly<{
  name: string;
  onAngelegt: (ware: { id: string; name: string }) => void;
  onClose: () => void;
}>) {
  const stamm = useWarenStammdaten();
  if (stamm.fehler)
    return (
      <Modal opened onClose={onClose} title="Ware anlegen">
        <Alert color="red">Die Stammdaten konnten nicht geladen werden.</Alert>
      </Modal>
    );
  if (stamm.laedt) return null;
  return (
    <WareFormular
      warengruppen={stamm.warengruppen}
      gebinde={stamm.gebinde}
      vorbelegterName={name}
      onAngelegt={onAngelegt}
      onClose={onClose}
    />
  );
}
