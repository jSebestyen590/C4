import { Alert, Button, Modal, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useApi } from './api';
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
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: async (namen: string[]) =>
      pruefen(
        await api.lagerorte[':id'].boeden.$post({ param: { id: regal.id }, json: { namen } }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['lagerorte'] });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = boedenGesamtFehler(wert, vorhandeneNamen);
    setFehler(problem);
    if (!problem) speichern.mutate(wert.namen.map((n) => n.trim()));
  };

  return (
    <Modal opened onClose={onClose} title="Böden hinzufügen">
      <form onSubmit={onSubmit}>
        <Stack>
          <Text size="sm" c="dimmed">
            Zu {pfad}
          </Text>
          <BoedenFelder wert={wert} vorhanden={vorhandeneNamen} onChange={setWert} />
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
