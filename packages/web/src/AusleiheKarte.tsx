import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { datumText, heuteLokal, positionText, ueberfaellig } from './inventarAnzeige';
import type { AusleiheEintrag, useInventar } from './inventarDaten';
import { zeitAnzeigen } from './warenAnzeige';

const MAX_POSITIONEN = 4;

/** Status badge of an Ausleihe: Überfällig / Offen / Erledigt. */
export function AusleiheStatus({ a }: Readonly<{ a: AusleiheEintrag }>) {
  if (a.erledigt)
    return (
      <Badge color="green" variant="light">
        Erledigt
      </Badge>
    );
  if (ueberfaellig(a, heuteLokal()))
    return (
      <Badge color="red" variant="light">
        Überfällig
      </Badge>
    );
  return (
    <Badge color="grape" variant="light">
      Verliehen
    </Badge>
  );
}

/** Planned return date as text; red when the open Ausleihe is overdue. */
export function RueckgabeGeplant({ a }: Readonly<{ a: AusleiheEintrag }>) {
  if (a.rueckgabeGeplant === null) return null;
  const rot = ueberfaellig(a, heuteLokal());
  return (
    <Text size="sm" c={rot ? 'red' : 'dimmed'} fw={rot ? 600 : 400}>
      Rückgabe geplant: {datumText(a.rueckgabeGeplant)}
    </Text>
  );
}

/** Card of one Ausleihe: to whom, since when, planned return and the Positionen. */
export function AusleiheKarte({
  a,
  inv,
}: Readonly<{ a: AusleiheEintrag; inv: ReturnType<typeof useInventar> }>) {
  return (
    <Paper
      component={Link}
      to={`/inventar/ausleihen/${encodeURIComponent(a.id)}`}
      withBorder
      p="md"
      opacity={a.erledigt ? 0.7 : 1}
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
          <Text fw={600} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
            {a.an}
          </Text>
          <AusleiheStatus a={a} />
        </Group>
        <Text size="sm" c="dimmed">
          Seit {zeitAnzeigen(a.ausgeliehenAm)}
        </Text>
        <RueckgabeGeplant a={a} />
        {a.positionen.slice(0, MAX_POSITIONEN).map((p) => (
          <Text
            key={p.id}
            size="sm"
            c={p.zurueckAm ? 'dimmed' : undefined}
            style={{ overflowWrap: 'anywhere' }}
          >
            {positionText(p, inv.gegenstaende, inv.lagerorte, inv.ifcos)}
            {p.zurueckAm && ' (zurück)'}
          </Text>
        ))}
        {a.positionen.length > MAX_POSITIONEN && (
          <Text size="sm" c="dimmed">
            + {a.positionen.length - MAX_POSITIONEN} weitere
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
