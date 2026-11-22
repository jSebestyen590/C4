import { ZeitFeld } from '../ZeitFeld';
import { ActionIcon, Badge, Button, Group, Menu, Paper, Stack, Text } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { VorlageSchicht } from '@c4/shared';
import {
  anzahlSetzen,
  bedarfEntfernen,
  bedarfHinzufuegen,
  bedarfSetzen,
  MAX_SCHICHTEN,
  schichtKurz,
  schichtNeu,
  schichtZeitSetzen,
} from './bausteinLogik';
import { LokalZahl } from './LokalFelder';

const ART_TITEL = { betrieb: 'Betrieb', aufbau: 'Aufbau', putzen: 'Putzen' } as const;

/**
 * Dienste of an Event Baustein: shows the Schichten, adjusts times and head counts (all values stay
 * valid) and adds / removes Schichten and Bedarfe (with or without a Vorlage).
 */
export function SchichtEditor({
  schichten,
  dienstformName,
  dienstformen,
  zeiten,
  onChange,
}: Readonly<{
  schichten: readonly VorlageSchicht[];
  dienstformName: (id: string) => string;
  /** Active Dienstformen that can be added (id and name). */
  dienstformen: readonly { id: string; name: string }[];
  /** Times of the event: the default of a new Schicht. */
  zeiten: { beginnZeit: string | null; endeZeit: string | null };
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
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="sm" fw={600}>
                      {dienstformName(b.dienstformId)}
                    </Text>
                    {s.bedarfe.length > 1 && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size={42}
                        aria-label={`${dienstformName(b.dienstformId)} entfernen`}
                        onClick={() => ersetzen(i, bedarfEntfernen(s, j))}
                      >
                        <IconTrash size={18} />
                      </ActionIcon>
                    )}
                  </Group>
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
            {s.art === 'betrieb' && (
              <DienstformMenue
                dienstformen={dienstformen.filter(
                  (d) => !s.bedarfe.some((b) => b.dienstformId === d.id),
                )}
                onWahl={(id) => ersetzen(i, bedarfHinzufuegen(s, id))}
              />
            )}
          </Stack>
        </Paper>
      ))}
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <Button
            variant="light"
            leftSection={<IconPlus size={18} />}
            disabled={schichten.length >= MAX_SCHICHTEN || dienstformen.length === 0}
          >
            Dienst hinzufügen
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {(['aufbau', 'betrieb', 'putzen'] as const).map((art) => (
            <Menu.Item
              key={art}
              onClick={() => {
                const form = dienstformen[0];
                if (form) onChange([...schichten, schichtNeu(art, zeiten, form.id)]);
              }}
            >
              {ART_TITEL[art]}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      {dienstformen.length === 0 && (
        <Text size="xs" c="dimmed">
          Lege zuerst eine Dienstform an, um Dienste hinzuzufügen.
        </Text>
      )}
    </Stack>
  );
}

/** "Dienstform hinzufügen" for a Betrieb: the Dienstformen it does not have yet; hidden when none is left. */
function DienstformMenue({
  dienstformen,
  onWahl,
}: Readonly<{
  dienstformen: readonly { id: string; name: string }[];
  onWahl: (id: string) => void;
}>) {
  if (dienstformen.length === 0) return null;
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <Button variant="subtle" leftSection={<IconPlus size={18} />}>
          Dienstform hinzufügen
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {dienstformen.map((d) => (
          <Menu.Item key={d.id} onClick={() => onWahl(d.id)}>
            {d.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
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
