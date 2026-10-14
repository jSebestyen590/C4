import { Alert, Button, Modal, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { gebindeFehler, gebindeSchema, type Gebinde } from '@c4/shared';
import { useApi } from './api';
import { fehlerText, pruefen } from './warenApi';

export type GebindeEintrag = Gebinde & { archiviert: boolean };

/** Create or edit a Gebinde. Mount it only while it should be open. */
export function GebindeFormular({
  gebinde,
  alle,
  onClose,
}: Readonly<{
  /** Set when editing. */
  gebinde?: GebindeEintrag;
  alle: GebindeEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(gebinde?.name ?? '');
  const [pfand, setPfand] = useState<number | string>(gebinde ? gebinde.pfandCent / 100 : 0);
  const [unterId, setUnterId] = useState<string | null>(gebinde?.unterGebindeId ?? null);
  const [anzahl, setAnzahl] = useState<number | string>(gebinde?.unterAnzahl ?? '');
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: async (json: {
      name: string;
      pfandCent: number;
      unterGebindeId: string | null;
      unterAnzahl: number | null;
    }) => {
      if (gebinde) {
        await pruefen(await api.gebinde[':id'].$put({ param: { id: gebinde.id }, json }));
      } else {
        await pruefen(await api.gebinde.$post({ json }));
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['gebinde'] });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = {
      name,
      pfandCent: pfand === '' ? Number.NaN : Math.round(Number(pfand) * 100),
      unterGebindeId: unterId,
      unterAnzahl: anzahl === '' ? null : Number(anzahl),
    };
    const parsed = gebindeSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    const regel = gebindeFehler(
      { id: gebinde?.id, unterGebindeId: parsed.data.unterGebindeId },
      alle,
    );
    if (regel) return setFehler(regel);
    setFehler(null);
    speichern.mutate(parsed.data);
  };

  // Only Basisgebinde (without Untergebinde of their own) that are in use can be contained.
  const kandidaten = alle
    .filter((g) => g.id !== gebinde?.id && g.unterGebindeId === null && !g.archiviert)
    .map((g) => ({ value: g.id, label: g.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));

  return (
    <Modal opened onClose={onClose} title={gebinde ? 'Gebinde bearbeiten' : 'Gebinde anlegen'}>
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label="Name"
            placeholder="z. B. 0,5l Flasche"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          <NumberInput
            label="Pfand in €"
            decimalSeparator=","
            thousandSeparator="."
            decimalScale={2}
            fixedDecimalScale
            min={0}
            allowNegative={false}
            suffix=" €"
            value={pfand}
            onChange={setPfand}
          />
          <Select
            label="Untergebinde (optional)"
            description="Was dieses Gebinde enthält, z. B. Flaschen in einem Kasten."
            placeholder="Keins"
            clearable
            data={kandidaten}
            value={unterId}
            onChange={(v) => {
              setUnterId(v);
              if (v === null) setAnzahl('');
            }}
          />
          {unterId && (
            <NumberInput
              label="Anzahl Untergebinde"
              allowDecimal={false}
              allowNegative={false}
              min={2}
              value={anzahl}
              onChange={setAnzahl}
            />
          )}
          {fehler && <Alert color="red">{fehler}</Alert>}
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {gebinde ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
