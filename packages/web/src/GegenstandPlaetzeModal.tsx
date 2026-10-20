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
import { abweichungText, gegenstandPlaetzeSchema, inventarAbweichung } from '@c4/shared';
import { useApi } from './api';
import { zielAusWert, zielOptionen, zielWert } from './inventarAnzeige';
import { INVENTAR_KEY, type GegenstandEintrag, type IfcoEintrag } from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { fehlerText, pruefen } from './warenApi';

let keyZaehler = 0;
const neuerKey = () => keyZaehler++;

interface Zeile {
  key: number;
  ziel: string | null;
  anzahl: number | string;
}

/**
 * Edits all Plätze of a Gegenstand at once: target (Lagerort or Ifco) and amount per row, with the
 * live sum against the target. Mount it only while it should be open.
 */
export function GegenstandPlaetzeModal({
  gegenstand,
  lagerorte,
  ifcos,
  onClose,
}: Readonly<{
  gegenstand: GegenstandEintrag;
  lagerorte: LagerKnoten[];
  ifcos: IfcoEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [zeilen, setZeilen] = useState<Zeile[]>(() =>
    gegenstand.plaetze.map((p) => ({
      key: neuerKey(),
      ziel: zielWert(p),
      anzahl: p.anzahl,
    })),
  );
  const [fehler, setFehler] = useState<string | null>(null);

  // Archived targets stay selectable only where the Gegenstand already is.
  const behalten = useMemo(() => new Set(gegenstand.plaetze.map(zielWert)), [gegenstand]);
  const gewaehlt = zeilen.flatMap((z) => (z.ziel ? [z.ziel] : []));

  const summe = inventarAbweichung(
    gegenstand.anzahl,
    zeilen.map((z) => ({ anzahl: typeof z.anzahl === 'number' ? z.anzahl : 0 })),
  );
  const abweichung = abweichungText(summe.differenz);

  const aendern = (key: number, teil: Partial<Zeile>) =>
    setZeilen((l) => l.map((z) => (z.key === key ? { ...z, ...teil } : z)));

  const speichern = useMutation({
    mutationFn: async (json: {
      plaetze: { lagerortId: string | null; ifcoId: string | null; anzahl: number }[];
    }) =>
      pruefen(
        await api.inventar.gegenstaende[':id'].plaetze.$put({
          param: { id: gegenstand.id },
          json,
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      onClose();
    },
  });

  const onSpeichern = () => {
    if (zeilen.some((z) => !z.ziel)) return setFehler('Bitte wähle für jede Zeile einen Platz.');
    const eingabe = {
      plaetze: zeilen.map((z) => ({
        ...zielAusWert(z.ziel!),
        anzahl: typeof z.anzahl === 'number' ? z.anzahl : Number.NaN,
      })),
    };
    const parsed = gegenstandPlaetzeSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(eingabe);
  };

  return (
    <Modal opened onClose={onClose} title={`Plätze von ${gegenstand.name}`}>
      <Stack>
        {zeilen.length === 0 && <Text c="dimmed">Noch kein Platz zugeordnet.</Text>}
        {zeilen.map((z, i) => (
          <Paper key={z.key} withBorder p="sm">
            <Stack gap="xs">
              <Select
                label={`Platz ${i + 1}`}
                placeholder="Lagerort oder Ifco wählen"
                searchable
                inputMode="text"
                nothingFoundMessage="Nichts gefunden"
                data={zielOptionen(
                  lagerorte,
                  ifcos,
                  behalten,
                  new Set(gewaehlt.filter((w) => w !== z.ziel)),
                )}
                value={z.ziel}
                onChange={(ziel) => aendern(z.key, { ziel })}
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
                  aria-label={`Platz ${i + 1} entfernen`}
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
          onClick={() => setZeilen((l) => [...l, { key: neuerKey(), ziel: null, anzahl: 1 }])}
        >
          Platz hinzufügen
        </Button>
        <Text size="sm" c={abweichung ? 'orange' : 'dimmed'} role="status">
          Summe {summe.summe} von {gegenstand.anzahl}
          {abweichung && ` · ${abweichung}`}
        </Text>
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
