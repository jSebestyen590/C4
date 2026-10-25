import { Alert, Button, Modal, Stack } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { IfcoInhaltPosition } from '@c4/shared';
import { useApi } from './api';
import {
  IfcoInhaltFelder,
  inhaltPruefen,
  inhaltZeilenAus,
  type InhaltZeile,
} from './IfcoInhaltFelder';
import {
  INVENTAR_KEY,
  type GegenstandEintrag,
  type IfcoEintrag,
  type KategorieEintrag,
} from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { fehlerText, pruefen } from './warenApi';

/**
 * Content rows shared by "Inhalt bearbeiten" and "IFCO anlegen": `pruefen` returns the positions
 * to send, or null after showing the error.
 */
export function useIfcoInhalt(ifco: IfcoEintrag | undefined, gegenstaende: GegenstandEintrag[]) {
  const [zeilen, setZeilen] = useState<InhaltZeile[]>(() => inhaltZeilenAus(ifco, gegenstaende));
  const [fehler, setFehler] = useState<string | null>(null);
  const pruefenUndMelden = (): IfcoInhaltPosition[] | null => {
    const r = inhaltPruefen(zeilen, gegenstaende, ifco?.id);
    if ('fehler' in r) {
      setFehler(r.fehler);
      return null;
    }
    setFehler(null);
    return r.positionen;
  };
  return { zeilen, setZeilen, fehler, pruefen: pruefenUndMelden };
}

/** Edits the whole content of an IFCO: Gegenstand and amount per row. Mount it only while it should be open. */
export function IfcoInhaltModal({
  ifco,
  gegenstaende,
  kategorien,
  lagerorte,
  ifcos,
  onClose,
}: Readonly<{
  ifco: IfcoEintrag;
  gegenstaende: GegenstandEintrag[];
  kategorien: KategorieEintrag[];
  lagerorte: LagerKnoten[];
  ifcos: IfcoEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const inhalt = useIfcoInhalt(ifco, gegenstaende);

  const speichern = useMutation({
    mutationFn: async (positionen: IfcoInhaltPosition[]) =>
      pruefen(
        await api.inventar.ifcos[':id'].inhalt.$put({
          param: { id: ifco.id },
          json: { positionen },
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  return (
    <Modal opened onClose={onClose} title={`Inhalt von ${ifco.name}`}>
      <Stack>
        <IfcoInhaltFelder
          zeilen={inhalt.zeilen}
          setZeilen={inhalt.setZeilen}
          ifco={ifco}
          gegenstaende={gegenstaende}
          kategorien={kategorien}
          lagerorte={lagerorte}
          ifcos={ifcos}
        />
        {inhalt.fehler && <Alert color="red">{inhalt.fehler}</Alert>}
        {speichern.isError && (
          <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
        )}
        <Button
          loading={speichern.isPending}
          onClick={() => {
            const positionen = inhalt.pruefen();
            if (positionen) speichern.mutate(positionen);
          }}
        >
          Speichern
        </Button>
      </Stack>
    </Modal>
  );
}
