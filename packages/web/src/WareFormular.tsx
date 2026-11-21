import { Alert, Button, Modal, Stack } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { wareSchema } from '@c4/shared';
import { useApi } from './api';
import { leereWareWerte, WareFelder, wareWerte } from './WareFelder';
import { ApiFehler, fehlerText, pruefen } from './warenApi';
import type { WareEintrag } from './warenDaten';
import type { GebindeEintrag } from './GebindeFormular';
import { warenKeys } from './warenDaten';

/** Create or edit a Ware (full screen on phones). Mount it only while it should be open. */
export function WareFormular({
  ware,
  warengruppen,
  gebinde,
  vorbelegterName,
  onAngelegt,
  onClose,
}: Readonly<{
  /** Set when editing. */
  ware?: WareEintrag;
  warengruppen: { id: string; parentId: string | null; name: string; archiviert: boolean }[];
  gebinde: GebindeEintrag[];
  /** Name preset when creating (e.g. the text typed in a Beleg). */
  vorbelegterName?: string;
  /** Called after a new Ware was created, with its id and saved values. */
  onAngelegt?: (ware: { id: string; name: string }) => void;
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const mobil = useMediaQuery('(max-width: 48em)');
  const [werte, setWerte] = useState(
    ware ? wareWerte(ware) : { ...leereWareWerte, name: vorbelegterName?.trim() ?? '' },
  );
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (json: ReturnType<typeof wareSchema.parse>) => {
      if (ware) {
        await pruefen(await api.waren[':id'].$put({ param: { id: ware.id }, json }));
        return null;
      }
      const res = await api.waren.$post({ json });
      await pruefen(res);
      return { id: ((await res.json()) as { id: string }).id, name: json.name };
    },
    onSuccess: async (angelegt) => {
      await qc.invalidateQueries({ queryKey: warenKeys.alle });
      notifications.show({ color: 'green', message: 'Die Ware wurde gespeichert.' });
      if (angelegt) onAngelegt?.(angelegt);
      onClose();
    },
  });

  // API errors that name a field are shown at that field, the rest in the alert.
  const apiFeld = speichern.error instanceof ApiFehler ? speichern.error.feld : undefined;
  const apiText = speichern.isError
    ? fehlerText(speichern.error, 'Speichern fehlgeschlagen.')
    : null;

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
            fehler={apiFeld === 'name' ? apiText : null}
            aliasFehler={apiFeld === 'alias' ? apiText : null}
            standardFehler={apiFeld === 'standardGebindeId' ? apiText : null}
            warengruppen={warengruppen}
            gebinde={gebinde}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          {apiText && !['name', 'alias', 'standardGebindeId'].includes(apiFeld ?? '') && (
            <Alert color="red">{apiText}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {ware ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
