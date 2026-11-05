import { Stack, Text } from '@mantine/core';
import { stimmenHinweisText } from '@c4/shared';
import { mitgliedernText } from './anwesenheit';
import { personenAnwesendText } from './bausteinLogik';
import { useProtokollKontext } from './kontext';

/** "Stimmen: 4 von 5" per vote / Wahl round of the Baustein; orange when the count does not match. */
function StimmenZeilen({ id }: Readonly<{ id: string }>) {
  const { stimmen } = useProtokollKontext();
  return (
    <>
      {stimmen
        .filter((p) => p.bausteinId === id)
        .map((p) => (
          <Text
            key={p.runde}
            size={p.ok ? 'xs' : 'sm'}
            fw={p.ok ? undefined : 600}
            c={p.ok ? 'dimmed' : 'orange.8'}
          >
            {stimmenHinweisText(p)}
            {!p.ok && ' – sie müssen zur Anzahl der Anwesenden passen'}
          </Text>
        ))}
    </>
  );
}

/**
 * Under an Abstimmung (or the vote of a Neues EM / Aufnahme) and under a Wahl: who was present at
 * that point, the quorum, and whether the vote count matches the members present (needed to close).
 */
export function BeschlussHinweis({ id }: Readonly<{ id: string }>) {
  const { verlauf } = useProtokollKontext();
  const stand = verlauf.bausteine[id];
  if (!stand) return null;
  return (
    <Stack gap={4}>
      {stand.gesamt > 0 && (
        <Text size="xs" c="dimmed">
          Anwesend: {stand.anwesend} von {mitgliedernText(stand.gesamt)}
        </Text>
      )}
      {stand.gesamt > 0 && !stand.beschlussfaehig && (
        <Text size="sm" fw={600} c="red">
          Nicht beschlussfähig
        </Text>
      )}
      <StimmenZeilen id={id} />
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
