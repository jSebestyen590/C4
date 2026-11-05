import { Alert, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { wahlErgebnis, type BausteinBeschlussDaten, type BausteinWahlDaten } from '@c4/shared';

type Stimmen = Pick<BausteinBeschlussDaten, 'ja' | 'nein' | 'enthaltung'>;
import { mitgliedernText } from './anwesenheit';
import { personenAnwesendText, zuvieleWahlStimmen } from './bausteinLogik';
import { useProtokollKontext } from './kontext';

/** Under an Abstimmung (or the vote of a Neues EM / Aufnahme): who was present at that point, and warnings about quorum and vote count. */
export function BeschlussHinweis({ id, daten }: Readonly<{ id: string; daten: Stimmen }>) {
  const { verlauf } = useProtokollKontext();
  const stand = verlauf.bausteine[id];
  if (!stand || stand.gesamt === 0) return null;
  const stimmen = daten.ja + daten.nein + daten.enthaltung;
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">
        Anwesend: {stand.anwesend} von {mitgliedernText(stand.gesamt)}
      </Text>
      {!stand.beschlussfaehig && (
        <Text size="sm" fw={600} c="red">
          Nicht beschlussfähig
        </Text>
      )}
      {stimmen > stand.anwesend && (
        <Alert color="yellow" variant="light" py={6} px="xs" icon={<IconAlertTriangle size={18} />}>
          Mehr Stimmen als anwesende Mitglieder
        </Alert>
      )}
    </Stack>
  );
}

/** Under a Wahl: who was present, the quorum, and a warning when a round has too many votes. */
export function WahlHinweis({ id, daten }: Readonly<{ id: string; daten: BausteinWahlDaten }>) {
  const { verlauf } = useProtokollKontext();
  const stand = verlauf.bausteine[id];
  if (!stand || stand.gesamt === 0) return null;
  const { runden } = wahlErgebnis(daten);
  const summe = (stimmen: number[], enthaltung: number) =>
    stimmen.reduce((a, b) => a + b, 0) + enthaltung;
  const zuviele =
    zuvieleWahlStimmen(
      summe(
        daten.kandidaten.map((k) => k.stimmen),
        daten.enthaltung,
      ),
      stand.anwesend,
      daten.anzahl,
    ) ||
    runden.some((r, i) => {
      const s = daten.stichwahlen[i]!;
      return zuvieleWahlStimmen(
        summe(
          r.kandidaten.map((k) => s.stimmen[k] ?? 0),
          s.enthaltung,
        ),
        stand.anwesend,
        r.plaetze,
      );
    });
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">
        Anwesend: {stand.anwesend} von {mitgliedernText(stand.gesamt)}
      </Text>
      {!stand.beschlussfaehig && (
        <Text size="sm" fw={600} c="red">
          Nicht beschlussfähig
        </Text>
      )}
      {zuviele && (
        <Alert color="yellow" variant="light" py={6} px="xs" icon={<IconAlertTriangle size={18} />}>
          Mehr Stimmen als anwesende Mitglieder
        </Alert>
      )}
    </Stack>
  );
}

/** Under a Meinungsbild: how many people are present at that point (an info only, no quorum). */
export function MeinungsbildHinweis({ id }: Readonly<{ id: string }>) {
  const { verlauf } = useProtokollKontext();
  const n = verlauf.anwesendePersonen[id];
  if (n === undefined) return null;
  return (
    <Text size="xs" c="dimmed">
      {personenAnwesendText(n)}
    </Text>
  );
}
