import { Alert, Button, Modal, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import type { IfcoPlatzMasse } from '@c4/shared';
import { useApi } from './api';
import {
  IfcoPlatzFelder,
  boedenPlatzErgebnis,
  ifcoPlatzStandard,
  type IfcoPlatzWert,
} from './IfcoPlatzFelder';
import { BoedenFelder, boedenGesamtFehler, boedenStandard, type BoedenWert } from './BoedenFelder';
import { fehlerText, pruefen } from './warenApi';

/** Appends Regalböden to a Regal. Mount it only while it should be open. */
export function BoedenModal({
  regal,
  vorhanden,
  vorhandeneNamen,
  pfad,
  onClose,
}: Readonly<{
  regal: { id: string };
  /** Number of Böden the Regal has; the start number continues after them. */
  vorhanden: number;
  vorhandeneNamen: string[];
  pfad: string;
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [wert, setWert] = useState<BoedenWert>(() => boedenStandard(vorhanden + 1));
  const [ifcoPlatz, setIfcoPlatz] = useState<IfcoPlatzWert>(() => ifcoPlatzStandard());
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (eingabe: {
      namen: string[];
      ifcoPlatz: IfcoPlatzMasse | IfcoPlatzMasse[] | null;
    }) =>
      pruefen(await api.lagerorte[':id'].boeden.$post({ param: { id: regal.id }, json: eingabe })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['lagerorte'] });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const platz = boedenPlatzErgebnis(ifcoPlatz, Number(wert.reihen), Number(wert.plaetze));
    const problem =
      boedenGesamtFehler(wert, vorhandeneNamen) ?? (typeof platz === 'string' ? platz : null);
    setFehler(problem);
    if (!problem && typeof platz !== 'string') {
      speichern.mutate({ namen: wert.namen.map((n) => n.trim()), ifcoPlatz: platz });
    }
  };

  return (
    <Modal opened onClose={onClose} title="Böden hinzufügen">
      <form onSubmit={onSubmit}>
        <Stack>
          <Text size="sm" c="dimmed">
            Zu {pfad}
          </Text>
          <BoedenFelder wert={wert} vorhanden={vorhandeneNamen} onChange={setWert} />
          <IfcoPlatzFelder
            wert={ifcoPlatz}
            onChange={setIfcoPlatz}
            label="Als IFCO-Lagerplätze anlegen"
            beschreibung="Alle neuen Böden werden IFCO-Lagerplätze; bei mehreren Reihen hat jede Reihe ihre eigene Höhe."
            reihen={Number(wert.reihen) || 1}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            Hinzufügen
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
