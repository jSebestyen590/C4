import { ZeitFeld } from '../ZeitFeld';
import { ActionIcon, Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { VorlageSchicht } from '@c4/shared';
import { anzahlSetzen, bedarfSetzen, schichtKurz, schichtZeitSetzen } from './bausteinLogik';
import { LokalZahl } from './LokalFelder';

const ART_TITEL = { betrieb: 'Betrieb', aufbau: 'Aufbau', putzen: 'Putzen' } as const;

/** Dienste of an Event Baustein: shows the Schichten and adjusts times and head counts (all values stay valid). */
export function SchichtEditor({
  schichten,
  dienstformName,
  onChange,
}: Readonly<{
  schichten: readonly VorlageSchicht[];
  dienstformName: (id: string) => string;
  onChange: (schichten: VorlageSchicht[]) => void;
}>) {
  const ersetzen = (index: number, neu: VorlageSchicht) =>
    onChange(schichten.map((s, i) => (i === index ? neu : s)));
  return (
    <Stack gap="xs">
      {schichten.map((s, i) => (
        <Paper key={i} withBorder p="xs" radius="md">
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Badge variant="light" size="lg">
                {ART_TITEL[s.art]}
              </Badge>
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                aria-label={`${ART_TITEL[s.art]} entfernen`}
                onClick={() => onChange(schichten.filter((_, j) => j !== i))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
            <Group grow gap="xs" preventGrowOverflow={false} align="flex-start">
              <ZeitFeld
                label="Beginn"
                value={s.beginnZeit}
                onWert={(w) => ersetzen(i, schichtZeitSetzen(s, 'beginnZeit', w))}
                style={{ minWidth: 0 }}
              />
              <ZeitFeld
                label="Ende"
                value={s.endeZeit}
                onWert={(w) => ersetzen(i, schichtZeitSetzen(s, 'endeZeit', w))}
                style={{ minWidth: 0 }}
              />
            </Group>
            {s.art === 'betrieb' ? (
              s.bedarfe.map((b, j) => (
                <Stack key={b.dienstformId} gap={4}>
                  <Text size="sm" fw={600}>
                    {dienstformName(b.dienstformId)}
                  </Text>
                  <Group grow gap="xs" preventGrowOverflow={false} align="flex-start">
                    <LokalZahl
                      label="Minimum"
                      min={1}
                      wert={b.minimum}
                      onWert={(minimum) => ersetzen(i, bedarfSetzen(s, j, { minimum }))}
                    />
                    <LokalZahl
                      label="Wunsch"
                      min={b.minimum}
                      wert={b.wunsch}
                      onWert={(wunsch) => ersetzen(i, bedarfSetzen(s, j, { wunsch }))}
                    />
                  </Group>
                </Stack>
              ))
            ) : (
              <Group grow gap="xs" preventGrowOverflow={false} align="flex-start">
                <LokalZahl
                  label="Minimum"
                  min={0}
                  wert={s.minimum}
                  onWert={(minimum) => ersetzen(i, anzahlSetzen(s, { minimum }))}
                />
                <LokalZahl
                  label="Wunsch"
                  min={Math.max(1, s.minimum)}
                  wert={s.wunsch}
                  onWert={(wunsch) => ersetzen(i, anzahlSetzen(s, { wunsch }))}
                />
              </Group>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

/** Read-only list of the Schichten, one line each. */
export function SchichtListe({
  schichten,
  dienstformName,
}: Readonly<{ schichten: readonly VorlageSchicht[]; dienstformName: (id: string) => string }>) {
  return (
    <Stack gap={2}>
      {schichten.map((s, i) => (
        <Text key={i} size="sm">
          {schichtKurz(s, dienstformName)}
        </Text>
      ))}
    </Stack>
  );
}
