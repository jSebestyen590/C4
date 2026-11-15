import { Alert, Button, Modal, Stack } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { wareSchema } from '@c4/shared';
import { useApi } from './api';
import { leereWareWerte, WareFelder, wareWerte } from './WareFelder';
import { fehlerText, pruefen } from './warenApi';
import type { WareEintrag } from './warenDaten';
import type { GebindeEintrag } from './GebindeFormular';

/** Create or edit a Ware (full screen on phones). Mount it only while it should be open. */
export function WareFormular({
  ware,
  warengruppen,
  gebinde,
  onClose,
}: Readonly<{
  /** Set when editing. */
  ware?: WareEintrag;
  warengruppen: { id: string; parentId: string | null; name: string; archiviert: boolean }[];
  gebinde: GebindeEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const mobil = useMediaQuery('(max-width: 48em)');
  const [werte, setWerte] = useState(ware ? wareWerte(ware) : leereWareWerte);
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (json: ReturnType<typeof wareSchema.parse>) => {
      if (ware) await pruefen(await api.waren[':id'].$put({ param: { id: ware.id }, json }));
      else await pruefen(await api.waren.$post({ json }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['waren'] });
      notifications.show({ color: 'green', message: 'Die Ware wurde gespeichert.' });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (werte.warengruppeId === null) return setFehler('Bitte wähle eine Warengruppe.');
    const parsed = wareSchema.safeParse(werte);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(parsed.data);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen={mobil}
      title={ware ? 'Ware bearbeiten' : 'Ware anlegen'}
    >
      <form onSubmit={onSubmit}>
        <Stack>
          <WareFelder
            werte={werte}
            onChange={setWerte}
            fehler={null}
            warengruppen={warengruppen}
            gebinde={gebinde}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {ware ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
