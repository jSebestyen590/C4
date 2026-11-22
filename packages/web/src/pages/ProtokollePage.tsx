import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { datumBerlin, type ProtokollListeEintragDto } from '@c4/shared';
import { useAuth } from '../auth';
import { tagAnzeigen } from '../kalenderZeit';
import { mitgliedName } from '../mitglied';
import { protokollLink, useProtokolle } from '../protokollDaten';
import { StatusName } from '../StatusAnzeige';
import { KartenOderTabelle } from '../KartenOderTabelle';

function EntwurfBadge({ p }: Readonly<{ p: ProtokollListeEintragDto }>) {
  if (p.status !== 'entwurf' && !p.offiziellVon) return null;
  return (
    <Group gap={4} wrap="nowrap">
      {p.offiziellVon && (
        <Badge color="indigo" variant="light">
          Offiziell
        </Badge>
      )}
      {p.status === 'entwurf' && (
        <Badge color="yellow" variant="light">
          Entwurf
        </Badge>
      )}
    </Group>
  );
}

function GeaendertVon({ p }: Readonly<{ p: ProtokollListeEintragDto }>) {
  return p.geaendertVon ? (
    <StatusName status={p.geaendertVon.status}>{mitgliedName(p.geaendertVon)}</StatusName>
  ) : (
    <Text span>–</Text>
  );
}

/** Card on phones; the whole card opens the protocol. */
function ProtokollKarte({ p }: Readonly<{ p: ProtokollListeEintragDto }>) {
  return (
    <Paper
      component={Link}
      to={protokollLink(p.id)}
      withBorder
      p="md"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
          <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
            {p.titel}
          </Text>
          <EntwurfBadge p={p} />
        </Group>
        <Text size="sm" c="dimmed">
          {tagAnzeigen(p.beginn)}
        </Text>
        <Text size="sm" c="dimmed">
          zuletzt geändert von <GeaendertVon p={p} />
        </Text>
      </Stack>
    </Paper>
  );
}

/** Cards on phones, a table from `sm` upward (same column widths in every year); the whole row opens the protocol. */
function ProtokollListe({ liste }: Readonly<{ liste: ProtokollListeEintragDto[] }>) {
  const navigate = useNavigate();
  return (
    <KartenOderTabelle
      zeilen={liste}
      zeilenKey={(p) => p.id}
      minWidth={520}
      kartenAbstand="sm"
      tabelle={{ highlightOnHover: true, layout: 'fixed' }}
      spalten={
        <colgroup>
          <col style={{ width: '10rem' }} />
          <col />
          <col style={{ width: '7rem' }} />
          <col style={{ width: '12rem' }} />
        </colgroup>
      }
      karte={(p) => <ProtokollKarte p={p} />}
      kopf={
        <Table.Tr>
          <Table.Th>Datum</Table.Th>
          <Table.Th>Sitzung</Table.Th>
          <Table.Th />
          <Table.Th>Zuletzt geändert von</Table.Th>
        </Table.Tr>
      }
      zeile={(p) => (
        <Table.Tr style={{ cursor: 'pointer' }} onClick={() => void navigate(protokollLink(p.id))}>
          <Table.Td style={{ whiteSpace: 'nowrap' }}>{tagAnzeigen(p.beginn)}</Table.Td>
          <Table.Td>
            <Text component="span" fw={700} style={{ overflowWrap: 'anywhere' }}>
              {p.titel}
            </Text>
          </Table.Td>
          <Table.Td>
            <EntwurfBadge p={p} />
          </Table.Td>
          <Table.Td>
            <GeaendertVon p={p} />
          </Table.Td>
        </Table.Tr>
      )}
    />
  );
}

/** The minutes of all Sitzungen, newest first, grouped by year. */
export function ProtokollePage() {
  const { can } = useAuth();
  const liste = useProtokolle();
  const gruppen = useMemo(() => {
    const nachJahr = new Map<string, ProtokollListeEintragDto[]>();
    for (const p of liste.data ?? []) {
      const jahr = datumBerlin(p.beginn).slice(0, 4);
      nachJahr.set(jahr, [...(nachJahr.get(jahr) ?? []), p]);
    }
    return [...nachJahr.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [liste.data]);

  return (
    <Stack maw="60rem">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Title order={2}>Protokolle</Title>
        {can('protokolle:schreiben') && (
          <Button component={Link} to="/protokolle/neu" leftSection={<IconPlus size={18} />}>
            Neues Protokoll
          </Button>
        )}
      </Group>
      {liste.isPending && <Loader m="md" aria-label="Protokolle werden geladen" />}
      {liste.isError && <Alert color="red">Die Protokolle konnten nicht geladen werden.</Alert>}
      {liste.data && gruppen.length === 0 && (
        <Text c="dimmed">
          Noch keine Protokolle.
          {can('protokolle:schreiben') ? ' Lege das erste mit „Neues Protokoll“ an.' : ''}
        </Text>
      )}
      {gruppen.map(([jahr, eintraege]) => (
        <Stack key={jahr} gap="xs">
          <Title order={3}>{jahr}</Title>
          <ProtokollListe liste={eintraege} />
        </Stack>
      ))}
    </Stack>
  );
}
