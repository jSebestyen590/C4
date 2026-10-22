import {
  Alert,
  Button,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  TextInput,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { IFCO_MASSE, ifcoTypSchema, type IfcoGrundflaeche } from '@c4/shared';
import { useApi } from './api';
import { INVENTAR_KEY, type IfcoTypEintrag } from './inventarDaten';
import { fehlerText, pruefen } from './warenApi';

/** Create or edit an Ifco type (name, footprint, height). Mount it only while it should be open. */
export function IfcoTypFormular({
  typ,
  onClose,
}: Readonly<{
  /** Set when editing. */
  typ?: IfcoTypEintrag;
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(typ?.name ?? '');
  const [grundflaeche, setGrundflaeche] = useState<IfcoGrundflaeche>(typ?.grundflaeche ?? 'gross');
  const [hoeheCm, setHoeheCm] = useState<number | string>(typ?.hoeheCm ?? '');
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: async (json: { name: string; grundflaeche: IfcoGrundflaeche; hoeheCm: number }) =>
      pruefen(
        typ
          ? await api.inventar['ifco-typen'][':id'].$put({ param: { id: typ.id }, json })
          : await api.inventar['ifco-typen'].$post({ json }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = {
      name,
      grundflaeche,
      hoeheCm: typeof hoeheCm === 'number' ? hoeheCm : Number.NaN,
    };
    const parsed = ifcoTypSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(parsed.data);
  };

  return (
    <Modal opened onClose={onClose} title={typ ? 'Ifco-Typ bearbeiten' : 'Ifco-Typ anlegen'}>
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label="Name"
            description="z. B. die Typnummer 6410"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
            error={fehler}
          />
          <SegmentedControl
            fullWidth
            size="md"
            aria-label="Grundfläche"
            value={grundflaeche}
            onChange={(v) => setGrundflaeche(v as IfcoGrundflaeche)}
            styles={{ label: { minHeight: 36, display: 'grid', placeItems: 'center' } }}
            data={[
              { value: 'gross', label: `Groß ${IFCO_MASSE.gross}` },
              { value: 'klein', label: `Klein ${IFCO_MASSE.klein}` },
            ]}
          />
          <NumberInput
            label="Höhe (cm)"
            value={hoeheCm}
            onChange={setHoeheCm}
            min={0.5}
            step={0.5}
            decimalScale={1}
            decimalSeparator=","
            allowNegative={false}
            inputMode="decimal"
          />
          {speichern.isError && (
            <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            {typ ? 'Speichern' : 'Anlegen'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
