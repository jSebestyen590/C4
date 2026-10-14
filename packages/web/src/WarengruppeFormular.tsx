import { Alert, Button, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SubmitEvent } from 'react';
import { pfad, teilbaumIds, warengruppeSchema } from '@c4/shared';
import { useApi } from './api';
import { fehlerText, pruefen } from './warenApi';

export interface WarengruppeKnoten {
  id: string;
  parentId: string | null;
  name: string;
  archiviert: boolean;
}

/** Create or edit (rename, move) a Warengruppe. Mount it only while it should be open. */
export function WarengruppeFormular({
  warengruppe,
  parentId,
  alle,
  onClose,
}: Readonly<{
  /** Set when editing. */
  warengruppe?: WarengruppeKnoten;
  /** Preselected parent of a new Warengruppe. */
  parentId?: string | null;
  alle: WarengruppeKnoten[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(warengruppe?.name ?? '');
  const [parent, setParent] = useState<string | null>(warengruppe?.parentId ?? parentId ?? null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Never itself or one of its descendants (that would form a cycle); archived ones cannot be chosen.
  const eltern = useMemo(() => {
    const gesperrt = new Set(warengruppe ? teilbaumIds(alle, warengruppe.id) : []);
    return alle
      .filter((g) => !gesperrt.has(g.id) && (!g.archiviert || g.id === parent))
      .map((g) => ({ value: g.id, label: pfad(alle, g.id) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [alle, warengruppe, parent]);

  const speichern = useMutation({
    mutationFn: async (json: { name: string; parentId: string | null }) => {
      if (warengruppe) {
        await pruefen(await api.warengruppen[':id'].$put({ param: { id: warengruppe.id }, json }));
      } else {
        await pruefen(await api.warengruppen.$post({ json }));
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['warengruppen'] });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = { name, parentId: parent };
    const parsed = warengruppeSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(eingabe);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        warengruppe
          ? 'Warengruppe bearbeiten'
          : parentId
            ? 'Untergruppe anlegen'
            : 'Warengruppe anlegen'
      }
    >
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
            error={fehler}
          />
          <Select
            label="Übergeordnete Warengruppe"
            placeholder="Keine (oberste Ebene)"
            searchable
            clearable
            inputMode="text"
            nothingFoundMessage="Keine Warengruppe gefunden"
            data={eltern}
            value={parent}
            onChange={setParent}
          />
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {warengruppe ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
