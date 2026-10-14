import { Alert, Button, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { lagerortSchema } from '@c4/shared';
import { useApi } from './api';
import { fehlerText, pruefen } from './warenApi';

export interface LagerortBearbeitung {
  id: string;
  name: string;
  beschreibung: string | null;
  parentId: string | null;
}

/** Create (below `parentId`) or edit a Lagerort. Mount it only while it should be open. */
export function LagerortFormular({
  lagerort,
  parentId,
  parentPfad,
  onClose,
}: Readonly<{
  /** Set when editing. */
  lagerort?: LagerortBearbeitung;
  /** Parent of a new Lagerort; null = top level. */
  parentId?: string | null;
  parentPfad?: string;
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(lagerort?.name ?? '');
  const [beschreibung, setBeschreibung] = useState(lagerort?.beschreibung ?? '');
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: async (json: { name: string; beschreibung: string; parentId: string | null }) => {
      if (lagerort) {
        await pruefen(await api.lagerorte[':id'].$put({ param: { id: lagerort.id }, json }));
      } else {
        await pruefen(await api.lagerorte.$post({ json }));
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['lagerorte'] });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = {
      name,
      beschreibung,
      parentId: lagerort ? lagerort.parentId : (parentId ?? null),
    };
    const parsed = lagerortSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(eingabe);
  };

  const titel = lagerort
    ? 'Lagerort bearbeiten'
    : parentId
      ? 'Unterebene anlegen'
      : 'Lager anlegen';

  return (
    <Modal opened onClose={onClose} title={titel}>
      <form onSubmit={onSubmit}>
        <Stack>
          {!lagerort && parentPfad && (
            <Text size="sm" c="dimmed">
              Unterhalb von {parentPfad}
            </Text>
          )}
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
            error={fehler}
          />
          <Textarea
            label="Beschreibung (optional)"
            autosize
            minRows={2}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.currentTarget.value)}
          />
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {lagerort ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
