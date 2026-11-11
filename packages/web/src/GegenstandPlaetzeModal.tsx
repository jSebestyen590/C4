import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { PfadSelect } from './PfadSelect';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  abweichungText,
  gegenstandPlaetzeSchema,
  inventarAbweichung,
  zuVielVerteiltFehler,
} from '@c4/shared';
import { useApi } from './api';
import { zielAusWert, zielOptionen, zielWert } from './inventarAnzeige';
import { INVENTAR_KEY, type GegenstandEintrag, type IfcoEintrag } from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { fehlerText, pruefen } from './warenApi';
import { ZahlFeld } from './ZahlFeld';

let keyZaehler = 0;
const neuerKey = () => keyZaehler++;

interface Zeile {
  key: number;
  ziel: string | null;
  anzahl: number | string;
}

interface VerbautZeile {
  key: number;
  ort: string;
  anzahl: number | string;
}

const zahl = (v: number | string) => (typeof v === 'number' ? v : Number.NaN);
const summeVon = (l: { anzahl: number | string }[]) =>
  l.reduce((s, z) => s + (typeof z.anzahl === 'number' ? z.anzahl : 0), 0);

/**
 * Edits all Plätze of a Gegenstand at once: target (Lagerort or IFCO) and amount per row, plus the
 * pieces built in for good at a free-text Ort, with the live sum against the target. Mount it only
 * while it should be open.
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
  const [verbaut, setVerbaut] = useState<VerbautZeile[]>(() =>
    gegenstand.verbaut.map((v) => ({ key: neuerKey(), ort: v.ort, anzahl: v.anzahl })),
  );
  const [fehler, setFehler] = useState<string | null>(null);

  // Archived targets stay selectable only where the Gegenstand already is.
  const behalten = useMemo(() => new Set(gegenstand.plaetze.map(zielWert)), [gegenstand]);
  const gewaehlt = zeilen.flatMap((z) => (z.ziel ? [z.ziel] : []));

  const summePlaetze = summeVon(zeilen);
  const summeVerbaut = summeVon(verbaut);
  const abweichung = abweichungText(
    inventarAbweichung(gegenstand.anzahl, [{ anzahl: summePlaetze + summeVerbaut }]).differenz,
  );

  // A Gegenstand that exists only once is at one Platz or built in, chosen without an amount.
  const einzel =
    gegenstand.anzahl === 1 && gegenstand.plaetze.length <= 1 && gegenstand.verbaut.length <= 1;
  const [einzelVerbaut, setEinzelVerbaut] = useState(gegenstand.verbaut.length > 0);

  const aendern = (key: number, teil: Partial<Zeile>) =>
    setZeilen((l) => l.map((z) => (z.key === key ? { ...z, ...teil } : z)));
  const verbautAendern = (key: number, teil: Partial<VerbautZeile>) =>
    setVerbaut((l) => l.map((v) => (v.key === key ? { ...v, ...teil } : v)));

  const speichern = useMutation({
    mutationFn: async (json: {
      plaetze: { lagerortId: string | null; ifcoId: string | null; anzahl: number }[];
      verbaut: { ort: string; anzahl: number }[];
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

  const absenden = (eingabe: {
    plaetze: { lagerortId: string | null; ifcoId: string | null; anzahl: number }[];
    verbaut: { ort: string; anzahl: number }[];
  }) => {
    const parsed = gegenstandPlaetzeSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    const zuViel = zuVielVerteiltFehler(
      gegenstand.name,
      gegenstand.anzahl,
      summeVon(eingabe.verbaut),
      summeVon(gegenstand.plaetze),
      summeVon(eingabe.plaetze),
      summeVon(gegenstand.verbaut),
    );
    if (zuViel) return setFehler(zuViel);
    setFehler(null);
    speichern.mutate(eingabe);
  };

  const onSpeichern = () => {
    if (einzel) {
      const ziel = zeilen[0]?.ziel ?? null;
      const ort = verbaut[0]?.ort ?? '';
      return absenden(
        einzelVerbaut
          ? { plaetze: [], verbaut: [{ ort, anzahl: 1 }] }
          : { plaetze: ziel ? [{ ...zielAusWert(ziel), anzahl: 1 }] : [], verbaut: [] },
      );
    }
    if (zeilen.some((z) => !z.ziel)) return setFehler('Bitte wähle für jede Zeile einen Platz.');
    absenden({
      plaetze: zeilen.map((z) => ({ ...zielAusWert(z.ziel!), anzahl: zahl(z.anzahl) })),
      verbaut: verbaut.map((v) => ({ ort: v.ort, anzahl: zahl(v.anzahl) })),
    });
  };

  const meldungen = (
    <>
      {fehler && <Alert color="red">{fehler}</Alert>}
      {speichern.isError && (
        <Alert color="red">{fehlerText(speichern.error, 'Speichern fehlgeschlagen.')}</Alert>
      )}
      <Button loading={speichern.isPending} onClick={onSpeichern}>
        Speichern
      </Button>
    </>
  );

  if (einzel)
    return (
      <Modal opened onClose={onClose} title={`Platz von ${gegenstand.name}`}>
        <Stack>
          <Checkbox
            size="md"
            label="Fest verbaut"
            description="Liegt an keinem Platz, sondern ist dauerhaft eingebaut."
            checked={einzelVerbaut}
            onChange={(e) => setEinzelVerbaut(e.currentTarget.checked)}
          />
          {einzelVerbaut ? (
            <TextInput
              label="Ort"
              placeholder="z. B. unter der Bar"
              value={verbaut[0]?.ort ?? ''}
              onChange={(e) =>
                setVerbaut([
                  { key: verbaut[0]?.key ?? neuerKey(), ort: e.currentTarget.value, anzahl: 1 },
                ])
              }
            />
          ) : (
            <PfadSelect
              label="Platz"
              placeholder="Kein Platz"
              searchable
              clearable
              inputMode="text"
              nothingFoundMessage="Nichts gefunden"
              data={zielOptionen(lagerorte, ifcos, behalten, new Set())}
              value={zeilen[0]?.ziel ?? null}
              onChange={(ziel) =>
                setZeilen(ziel ? [{ key: zeilen[0]?.key ?? neuerKey(), ziel, anzahl: 1 }] : [])
              }
            />
          )}
          {meldungen}
        </Stack>
      </Modal>
    );

  return (
    <Modal opened onClose={onClose} title={`Plätze von ${gegenstand.name}`}>
      <Stack>
        {zeilen.length === 0 && <Text c="dimmed">Noch kein Platz zugeordnet.</Text>}
        {zeilen.map((z, i) => (
          <Paper key={z.key} withBorder p="sm">
            <Stack gap="xs">
              <PfadSelect
                label={`Platz ${i + 1}`}
                placeholder="Lagerort oder IFCO wählen"
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
                <ZahlFeld
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
                  size={42}
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

        <Title order={4}>Fest verbaut</Title>
        {verbaut.length === 0 && (
          <Text size="sm" c="dimmed">
            Dauerhaft eingebaute Stück (z. B. „unter der Bar“) zählen nicht zu den Plätzen.
          </Text>
        )}
        {verbaut.map((v, i) => (
          <Paper key={v.key} withBorder p="sm">
            <Stack gap="xs">
              <TextInput
                label={`Ort ${i + 1}`}
                placeholder="z. B. am Drucker"
                value={v.ort}
                onChange={(e) => verbautAendern(v.key, { ort: e.currentTarget.value })}
              />
              <Group align="flex-end" wrap="nowrap" gap="xs">
                <ZahlFeld
                  label="Anzahl"
                  style={{ flex: 1 }}
                  allowDecimal={false}
                  allowNegative={false}
                  min={1}
                  inputMode="numeric"
                  value={v.anzahl}
                  onChange={(anzahl) => verbautAendern(v.key, { anzahl })}
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={42}
                  aria-label={`Ort ${i + 1} entfernen`}
                  onClick={() => setVerbaut((l) => l.filter((x) => x.key !== v.key))}
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
          onClick={() => setVerbaut((l) => [...l, { key: neuerKey(), ort: '', anzahl: 1 }])}
        >
          Fest verbaut hinzufügen
        </Button>

        <Text size="sm" c={abweichung ? 'orange' : 'dimmed'} role="status">
          Summe {summePlaetze + summeVerbaut} von {gegenstand.anzahl}
          {summeVerbaut > 0 && ` (${summeVerbaut} fest verbaut)`}
          {abweichung && ` · ${abweichung}`}
        </Text>
        {meldungen}
      </Stack>
    </Modal>
  );
}
