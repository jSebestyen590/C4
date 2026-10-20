import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ifcoInhaltSchema, pfad } from '@c4/shared';
import { useApi } from './api';
import {
  INVENTAR_KEY,
  type GegenstandEintrag,
  type IfcoEintrag,
  type KategorieEintrag,
} from './inventarDaten';
import { fehlerText, pruefen } from './warenApi';

let keyZaehler = 0;
const neuerKey = () => keyZaehler++;

interface Zeile {
  key: number;
  gegenstandId: string | null;
  anzahl: number | string;
}

/** Edits the whole content of an Ifco: Gegenstand and amount per row. Mount it only while it should be open. */
export function IfcoInhaltModal({
  ifco,
  gegenstaende,
  kategorien,
  onClose,
}: Readonly<{
  ifco: IfcoEintrag;
  gegenstaende: GegenstandEintrag[];
  kategorien: KategorieEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [zeilen, setZeilen] = useState<Zeile[]>(() =>
    ifco.inhalt.map((p) => ({
      key: neuerKey(),
      gegenstandId: p.gegenstandId,
      anzahl: p.anzahl,
    })),
  );
  const [fehler, setFehler] = useState<string | null>(null);

  const gewaehlt = zeilen.flatMap((z) => (z.gegenstandId ? [z.gegenstandId] : []));
  const bisher = useMemo(() => new Set(ifco.inhalt.map((p) => p.gegenstandId)), [ifco]);
  const optionen = (eigene: string | null) =>
    gegenstaende
      .filter((g) => !g.archiviert || bisher.has(g.id))
      .map((g) => ({
        value: g.id,
        label: `${g.name} (${pfad(kategorien, g.kategorieId)})`,
        disabled: g.id !== eigene && gewaehlt.includes(g.id),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));

  const aendern = (key: number, teil: Partial<Zeile>) =>
    setZeilen((l) => l.map((z) => (z.key === key ? { ...z, ...teil } : z)));

  const speichern = useMutation({
    mutationFn: async (json: { positionen: { gegenstandId: string; anzahl: number }[] }) =>
      pruefen(await api.inventar.ifcos[':id'].inhalt.$put({ param: { id: ifco.id }, json })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  const onSpeichern = () => {
    if (zeilen.some((z) => !z.gegenstandId))
      return setFehler('Bitte wähle für jede Zeile einen Gegenstand.');
    const eingabe = {
      positionen: zeilen.map((z) => ({
        gegenstandId: z.gegenstandId!,
        anzahl: typeof z.anzahl === 'number' ? z.anzahl : Number.NaN,
      })),
    };
    const parsed = ifcoInhaltSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(eingabe);
  };

  return (
    <Modal opened onClose={onClose} title={`Inhalt von ${ifco.name}`}>
      <Stack>
        {zeilen.length === 0 && <Text c="dimmed">Die Ifco ist leer.</Text>}
        {zeilen.map((z, i) => (
          <Paper key={z.key} withBorder p="sm">
            <Stack gap="xs">
              <Select
                label={`Gegenstand ${i + 1}`}
                placeholder="Gegenstand wählen"
                searchable
                inputMode="text"
                nothingFoundMessage="Kein Gegenstand gefunden"
                data={optionen(z.gegenstandId)}
                value={z.gegenstandId}
                onChange={(gegenstandId) => aendern(z.key, { gegenstandId })}
              />
              <Group align="flex-end" wrap="nowrap" gap="xs">
                <NumberInput
                  label="Anzahl"
                  style={{ flex: 1 }}
                  allowDecimal={false}
                  allowNegative={false}
                  min={1}
                  inputMode="numeric"
                  value={z.anzahl}
                  onChange={(anzahl) => aendern(z.key, { anzahl })}
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={44}
                  aria-label={`Gegenstand ${i + 1} entfernen`}
                  onClick={() => setZeilen((l) => l.filter((x) => x.key !== z.key))}
                >
                  <IconTrash size={20} />
                </ActionIcon>
              </Group>
            </Stack>
          </Paper>
        ))}
        <Button
          variant="light"
          leftSection={<IconPlus size={18} />}
          onClick={() =>
            setZeilen((l) => [...l, { key: neuerKey(), gegenstandId: null, anzahl: 1 }])
          }
        >
          Gegenstand hinzufügen
        </Button>
        {fehler && <Alert color="red">{fehler}</Alert>}
        {speichern.isError && (
          <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
        )}
        <Button loading={speichern.isPending} onClick={onSpeichern}>
          Speichern
        </Button>
      </Stack>
    </Modal>
  );
}
