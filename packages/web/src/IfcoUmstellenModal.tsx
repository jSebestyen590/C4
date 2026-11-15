import { Alert, Button, Modal, Stack } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useApi } from './api';
import { ifcoPlatzOptionen } from './inventarAnzeige';
import { INVENTAR_KEY, type IfcoEintrag, type IfcoTypEintrag } from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { fehlerText, pruefen } from './warenApi';
import { PfadSelect } from './PfadSelect';

/** Moves an IFCO to another place (or to "ohne Platz"). Mount it only while it should be open. */
export function IfcoUmstellenModal({
  ifco,
  lagerorte,
  ifcos,
  typen,
  onClose,
}: Readonly<{
  ifco: IfcoEintrag;
  lagerorte: LagerKnoten[];
  /** All IFCOs and types, to tell where the IFCO fits. */
  ifcos: IfcoEintrag[];
  typen: IfcoTypEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [lagerortId, setLagerortId] = useState<string | null>(ifco.lagerortId);
  const optionen = useMemo(
    () => ifcoPlatzOptionen(lagerorte, ifco, ifco.typId, ifcos, typen),
    [lagerorte, ifco, ifcos, typen],
  );

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      pruefen(
        await api.inventar.ifcos[':id'].platz.$put({
          param: { id: ifco.id },
          json: { lagerortId },
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  return (
    <Modal opened onClose={onClose} title={`${ifco.name} umstellen`}>
      <Stack>
        <PfadSelect
          label="Neuer Platz"
          placeholder="Ohne Platz"
          searchable
          clearable
          inputMode="text"
          nothingFoundMessage="Kein Lagerort gefunden"
          data={optionen}
          value={lagerortId}
          onChange={setLagerortId}
          data-autofocus
        />
        {speichern.isError && (
          <Alert color="red">{fehlerText(speichern.error, 'Umstellen fehlgeschlagen.')}</Alert>
        )}
        <Button loading={speichern.isPending} onClick={() => speichern.mutate()}>
          Umstellen
        </Button>
      </Stack>
    </Modal>
  );
}
