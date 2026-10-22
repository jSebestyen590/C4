import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { positionenGruppieren } from '@c4/shared';
import {
  datumText,
  heuteLokal,
  ifcoGruppeTitel,
  ifcoInhaltText,
  positionText,
  ueberfaellig,
} from './inventarAnzeige';
import type { AusleiheEintrag, useInventar } from './inventarDaten';
import { StatusName } from './StatusAnzeige';
import { zeitAnzeigen } from './warenAnzeige';

const MAX_POSITIONEN = 4;

/** Status badge of an Ausleihe: Erledigt / Vorgemerkt / Überfällig / Verliehen. */
export function AusleiheStatus({ a }: Readonly<{ a: AusleiheEintrag }>) {
  if (a.erledigt)
    return (
      <Badge color="green" variant="light">
        Erledigt
      </Badge>
    );
  if (a.status === 'geplant')
    return (
      <Badge color="cyan" variant="light">
        Vorgemerkt
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

/** `Seit 20.10.2026 10:00` or, for a Vorgemerkt one, `Ab 25.10.2026 10:00`. */
export const startText = (a: Pick<AusleiheEintrag, 'status' | 'ausgeliehenAm'>): string =>
  `${a.status === 'geplant' ? 'Ab' : 'Seit'} ${zeitAnzeigen(a.ausgeliehenAm)}`;

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

/** `Organisiert von <Name>` with the name in bold and the color of the member's status; nothing if unknown. */
export function OrganisatorZeile({ a }: Readonly<{ a: Pick<AusleiheEintrag, 'organisator'> }>) {
  if (!a.organisator) return null;
  return (
    <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
      Organisiert von{' '}
      <StatusName status={a.organisator.status}>
        {`${a.organisator.vorname} ${a.organisator.nachname}`.trim()}
      </StatusName>
    </Text>
  );
}

/** Card of one Ausleihe: to whom, since when, planned return and the Positionen. */
export function AusleiheKarte({
  a,
  inv,
}: Readonly<{ a: AusleiheEintrag; inv: ReturnType<typeof useInventar> }>) {
  const eintraege = positionenGruppieren(a.positionen);
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
          {startText(a)}
        </Text>
        <OrganisatorZeile a={a} />
        <RueckgabeGeplant a={a} />
        {eintraege.slice(0, MAX_POSITIONEN).map((e) =>
          e.art === 'einzeln' ? (
            <Text
              key={e.position.id}
              size="sm"
              c={e.position.zurueckAm ? 'dimmed' : undefined}
              style={{ overflowWrap: 'anywhere' }}
            >
              {positionText(e.position, inv.gegenstaende, inv.lagerorte, inv.ifcos)}
              {e.position.zurueckAm && ' (zurück)'}
            </Text>
          ) : (
            <Stack key={`i-${e.ifcoId}`} gap={0}>
              <Text
                size="sm"
                c={e.positionen.every((p) => p.zurueckAm) ? 'dimmed' : undefined}
                style={{ overflowWrap: 'anywhere' }}
              >
                {ifcoGruppeTitel(e.ifcoId, inv.ifcos)}
                {e.positionen.every((p) => p.zurueckAm) && ' (zurück)'}
              </Text>
              <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                {ifcoInhaltText(e.positionen, inv.gegenstaende)}
              </Text>
            </Stack>
          ),
        )}
        {eintraege.length > MAX_POSITIONEN && (
          <Text size="sm" c="dimmed">
            + {eintraege.length - MAX_POSITIONEN} weitere
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
