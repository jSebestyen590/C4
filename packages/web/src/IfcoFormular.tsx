import { Alert, Button, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SubmitEvent } from 'react';
import { ifcoSchema } from '@c4/shared';
import { useApi } from './api';
import { lagerortOptionen } from './inventarAnzeige';
import { INVENTAR_KEY, type IfcoEintrag } from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { fehlerText, pruefen } from './warenApi';

/** Create or edit an Ifco (name, description, place). Mount it only while it should be open. */
export function IfcoFormular({
  ifco,
  lagerorte,
  onClose,
  onAngelegt,
}: Readonly<{
  /** Set when editing. */
  ifco?: IfcoEintrag;
  lagerorte: LagerKnoten[];
  onClose: () => void;
  onAngelegt?: (id: string) => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(ifco?.name ?? '');
  const [lagerortId, setLagerortId] = useState<string | null>(ifco?.lagerortId ?? null);
  const [beschreibung, setBeschreibung] = useState(ifco?.beschreibung ?? '');
  const [fehler, setFehler] = useState<string | null>(null);

  const optionen = useMemo(() => lagerortOptionen(lagerorte, ifco?.lagerortId), [lagerorte, ifco]);

  const speichern = useMutation({
    mutationFn: async (json: { name: string; beschreibung: string; lagerortId: string | null }) => {
      if (ifco) {
        await pruefen(await api.inventar.ifcos[':id'].$put({ param: { id: ifco.id }, json }));
        return null;
      }
      const res = await api.inventar.ifcos.$post({ json });
      await pruefen(res);
      return res.ok ? ((await res.json()) as { id: string }).id : null;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
      if (id) onAngelegt?.(id);
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = { name, beschreibung, lagerortId };
    const parsed = ifcoSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(eingabe);
  };

  return (
    <Modal opened onClose={onClose} title={ifco ? 'Ifco bearbeiten' : 'Ifco anlegen'}>
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
            label="Platz"
            placeholder="Ohne Platz"
            searchable
            clearable
            inputMode="text"
            nothingFoundMessage="Kein Lagerort gefunden"
            data={optionen}
            value={lagerortId}
            onChange={setLagerortId}
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
            {ifco ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
