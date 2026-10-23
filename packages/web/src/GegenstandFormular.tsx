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
import { gegenstandAnlegenSchema, gegenstandSchema } from '@c4/shared';
import { useApi } from './api';
import { kategorieOptionen, zielAusWert, zielOptionen } from './inventarAnzeige';
import type { GegenstandEintrag, IfcoEintrag, KategorieEintrag } from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { PfadSelect } from './PfadSelect';
import { INVENTAR_KEY } from './inventarDaten';
import { fehlerText, pruefen } from './warenApi';

/**
 * Create or edit a Gegenstand. Creating may put it onto a first place (by default with the whole
 * Anzahl); afterwards the Plätze are edited separately. Mount it only while it should be open.
 */
export function GegenstandFormular({
  gegenstand,
  kategorien,
  lagerorte = [],
  ifcos = [],
  onClose,
}: Readonly<{
  /** Set when editing. */
  gegenstand?: GegenstandEintrag;
  kategorien: KategorieEintrag[];
  /** Places offered when creating. */
  lagerorte?: LagerKnoten[];
  ifcos?: IfcoEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(gegenstand?.name ?? '');
  const [kategorieId, setKategorieId] = useState<string | null>(gegenstand?.kategorieId ?? null);
  const [anzahl, setAnzahl] = useState<number | string>(gegenstand?.anzahl ?? 1);
  const [beschreibung, setBeschreibung] = useState(gegenstand?.beschreibung ?? '');
  const [ziel, setZiel] = useState<string | null>(null);
  // null: follows the Anzahl until changed by hand.
  const [platzAnzahl, setPlatzAnzahl] = useState<number | string | null>(null);
  const amPlatz = platzAnzahl ?? anzahl;
  const [fehler, setFehler] = useState<string | null>(null);

  const optionen = useMemo(
    () => kategorieOptionen(kategorien, gegenstand?.kategorieId),
    [kategorien, gegenstand],
  );
  const platzOptionen = useMemo(
    () => zielOptionen(lagerorte, ifcos, new Set(), new Set()),
    [lagerorte, ifcos],
  );

  const speichern = useMutation({
    mutationFn: async (json: {
      name: string;
      beschreibung: string;
      kategorieId: string;
      anzahl: number;
      platz: { lagerortId: string | null; ifcoId: string | null; anzahl: number } | null;
    }) => {
      const { platz, ...daten } = json;
      if (gegenstand) {
        await pruefen(
          await api.inventar.gegenstaende[':id'].$put({
            param: { id: gegenstand.id },
            json: daten,
          }),
        );
      } else {
        await pruefen(await api.inventar.gegenstaende.$post({ json: { ...daten, platz } }));
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = {
      name,
      beschreibung,
      kategorieId: kategorieId ?? '',
      anzahl: typeof anzahl === 'number' ? anzahl : Number.NaN,
      platz: ziel
        ? { ...zielAusWert(ziel), anzahl: typeof amPlatz === 'number' ? amPlatz : Number.NaN }
        : null,
    };
    const parsed = (gegenstand ? gegenstandSchema : gegenstandAnlegenSchema).safeParse(eingabe);
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
          {!gegenstand && (
            <PfadSelect
              label="Platz (optional)"
              placeholder="Lagerort oder IFCO wählen"
              searchable
              clearable
              inputMode="text"
              nothingFoundMessage="Nichts gefunden"
              data={platzOptionen}
              value={ziel}
              onChange={setZiel}
            />
          )}
          {!gegenstand && ziel && (anzahl !== 1 || amPlatz !== 1) && (
            <NumberInput
              label="Anzahl an diesem Platz"
              allowDecimal={false}
              allowNegative={false}
              min={1}
              inputMode="numeric"
              value={amPlatz}
              onChange={setPlatzAnzahl}
            />
          )}
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
