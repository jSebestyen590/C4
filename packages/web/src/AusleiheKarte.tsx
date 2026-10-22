import { Anchor, Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { positionenGruppieren } from '@c4/shared';
import {
  ausleiheZeitraumText,
  heuteLokal,
  ifcoGruppeTitel,
  ifcoInhaltText,
  positionText,
  startText as startTextVon,
  ueberfaellig,
} from './inventarAnzeige';
import type { AusleiheEintrag, useInventar } from './inventarDaten';
import { StatusName } from './StatusAnzeige';
import { mitgliedLink, mitgliedName } from './mitglied';

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

/** `Seit 20.10.2026 10:00` or, for one that has not started, `Ab 25.10.2026 10:00`. */
export const startText = (a: Pick<AusleiheEintrag, 'ausgeliehenAm'>): string =>
  startTextVon(a.ausgeliehenAm);

/** The period `Zeitraum: 20.10.–27.10.2026`; red and bold when the open Ausleihe is overdue. */
export function RueckgabeGeplant({ a }: Readonly<{ a: AusleiheEintrag }>) {
  const zeitraum = ausleiheZeitraumText(a);
  if (zeitraum === null) return null;
  const rot = ueberfaellig(a, heuteLokal());
  return (
    <Text size="sm" c={rot ? 'red' : 'dimmed'} fw={rot ? 600 : 400}>
      Zeitraum: {zeitraum}
      {rot && ' (überfällig)'}
    </Text>
  );
}

/** Warning badges for a not yet started Ausleihe that an overdue one endangers. */
export function GefaehrdetBadges({ a }: Readonly<{ a: Pick<AusleiheEintrag, 'gefaehrdetDurch'> }>) {
  if (a.gefaehrdetDurch.length === 0) return null;
  return (
    <Group gap={4}>
      {a.gefaehrdetDurch.map((d) => (
        <Badge key={d.id} color="orange" variant="light" style={{ maxWidth: '100%' }}>
          Gefährdet: {d.an} ist überfällig
        </Badge>
      ))}
    </Group>
  );
}

/**
 * `Organisiert von <username>` (full name without a username) in bold and the color of the member's
 * status; nothing if unknown. `verlinkt` links to the member page (not inside another link).
 */
export function OrganisatorZeile({
  a,
  verlinkt = false,
}: Readonly<{ a: Pick<AusleiheEintrag, 'organisator'>; verlinkt?: boolean }>) {
  const o = a.organisator;
  if (!o) return null;
  const name = (
    <StatusName status={o.status}>
      {mitgliedName(o)}
    </StatusName>
  );
  return (
    <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
      Organisiert von{' '}
      {verlinkt ? (
        <Anchor
          component={Link}
          to={mitgliedLink({ username: o.username, sub: o.sub })}
          underline="never"
          inherit
        >
          {name}
        </Anchor>
      ) : (
        name
      )}
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
        <GefaehrdetBadges a={a} />
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
