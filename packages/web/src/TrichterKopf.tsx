import { Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCrown } from '@tabler/icons-react';
import type { TrichterUebersichtDto } from '@c4/shared';
import { TRICHTER_KOENIG_EWIG_LABELS, TRICHTER_KOENIG_JAHR_LABELS } from './i18n';
import { TrichterPerson } from './trichterDaten';

/** Kings of the current year and of all time; independent of the ranking filter. */
export function TrichterKopf({ uebersicht }: Readonly<{ uebersicht: TrichterUebersichtDto }>) {
  const { jahreskoenige, ewigeKoenige } = uebersicht;
  return (
    <Paper withBorder p="md" radius="md">
      <Group align="flex-start" wrap="nowrap" gap="md">
        <ThemeIcon size={42} radius="xl" color="yellow" variant="light">
          <IconCrown size={26} />
        </ThemeIcon>
        <Stack gap="xs" style={{ minWidth: 0 }}>
          {jahreskoenige.length === 0 ? (
            <Text>Im laufenden Jahr hat noch niemand getrichtert.</Text>
          ) : (
            jahreskoenige.map((k) => (
              <Text key={`j${k.sub}`}>
                <TrichterPerson mitglied={k} /> {TRICHTER_KOENIG_JAHR_LABELS[k.anrede]}
              </Text>
            ))
          )}
          {ewigeKoenige.length === 0 ? (
            <Text c="dimmed">Es hat noch niemand getrichtert.</Text>
          ) : (
            ewigeKoenige.map((k) => (
              <Text key={`e${k.sub}`}>
                <TrichterPerson mitglied={k} /> {TRICHTER_KOENIG_EWIG_LABELS[k.anrede]}
              </Text>
            ))
          )}
        </Stack>
      </Group>
    </Paper>
  );
}
