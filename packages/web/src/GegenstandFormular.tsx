import {
  Alert,
  Button,
  Modal,
  NumberInput,
  Select,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SubmitEvent } from 'react';
import { gegenstandSchema } from '@c4/shared';
import { useApi } from './api';
import { kategorieOptionen } from './inventarAnzeige';
import type { GegenstandEintrag, KategorieEintrag } from './inventarDaten';
import { INVENTAR_KEY } from './inventarDaten';
import { fehlerText, pruefen } from './warenApi';

/** Create or edit a Gegenstand (the Plätze are edited separately). Mount it only while it should be open. */
export function GegenstandFormular({
  gegenstand,
  kategorien,
  onClose,
  onAngelegt,
}: Readonly<{
  /** Set when editing. */
  gegenstand?: GegenstandEintrag;
  kategorien: KategorieEintrag[];
  onClose: () => void;
  onAngelegt?: (id: string) => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(gegenstand?.name ?? '');
  const [kategorieId, setKategorieId] = useState<string | null>(gegenstand?.kategorieId ?? null);
  const [anzahl, setAnzahl] = useState<number | string>(gegenstand?.anzahl ?? 1);
  const [beschreibung, setBeschreibung] = useState(gegenstand?.beschreibung ?? '');
  const [fehler, setFehler] = useState<string | null>(null);

  const optionen = useMemo(
    () => kategorieOptionen(kategorien, gegenstand?.kategorieId),
    [kategorien, gegenstand],
  );

  const speichern = useMutation({
    mutationFn: async (json: {
      name: string;
      beschreibung: string;
      kategorieId: string;
      anzahl: number;
    }) => {
      if (gegenstand) {
        await pruefen(
          await api.inventar.gegenstaende[':id'].$put({ param: { id: gegenstand.id }, json }),
        );
        return null;
      }
      const res = await api.inventar.gegenstaende.$post({ json });
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
    const eingabe = {
      name,
      beschreibung,
      kategorieId: kategorieId ?? '',
      anzahl: typeof anzahl === 'number' ? anzahl : Number.NaN,
    };
    const parsed = gegenstandSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(eingabe);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={gegenstand ? 'Gegenstand bearbeiten' : 'Gegenstand anlegen'}
    >
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          <Select
            label="Kategorie"
            placeholder="Kategorie wählen"
            searchable
            inputMode="text"
            nothingFoundMessage="Keine Kategorie gefunden"
            data={optionen}
            value={kategorieId}
            onChange={setKategorieId}
          />
          <NumberInput
            label="Anzahl (Soll)"
            allowDecimal={false}
            allowNegative={false}
            min={1}
            inputMode="numeric"
            value={anzahl}
            onChange={setAnzahl}
          />
          <Textarea
            label="Beschreibung (optional)"
            autosize
            minRows={2}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.currentTarget.value)}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {gegenstand ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
