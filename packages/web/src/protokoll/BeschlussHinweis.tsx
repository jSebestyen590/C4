import { Alert, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { BausteinBeschlussDaten } from '@c4/shared';

type Stimmen = Pick<BausteinBeschlussDaten, 'ja' | 'nein' | 'enthaltung'>;
import { mitgliedernText } from './anwesenheit';
import { personenAnwesendText } from './bausteinLogik';
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
        Anwesend: {stand.anwesend} von {mitgliedernText(stand.gesamt)} (nötig: {stand.mindestens})
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
