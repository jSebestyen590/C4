import { Badge, Group, Paper, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { Link, useNavigate } from 'react-router-dom';
import type {
  PrivatpartyListeDto,
  PrivatpartyStatus,
  PrivatpartyStufe,
  PrivatpartyTerminDto,
} from '@c4/shared';
import { PRIVATPARTY_STATUS_LABELS, PRIVATPARTY_STUFE_LABELS } from './i18n';
import { privatpartyLink, wunschTerminText } from './privatpartyDaten';
import { KartenOderTabelle } from './KartenOderTabelle';

const STATUS_FARBE: Record<PrivatpartyStatus, string> = {
  offen: 'yellow',
  zugesagt: 'green',
  abgesagt: 'gray',
};

const STUFE_FARBE: Record<PrivatpartyStufe, string> = {
  bevorzugt: 'green',
  moeglich: 'blue',
  notfalls: 'orange',
};

export function PrivatpartyStatusBadge({ status }: Readonly<{ status: PrivatpartyStatus }>) {
  return (
    <Badge color={STATUS_FARBE[status]} variant="light">
      {PRIVATPARTY_STATUS_LABELS[status]}
    </Badge>
  );
}

export function StufeBadge({ stufe }: Readonly<{ stufe: PrivatpartyStufe }>) {
  return (
    <Badge color={STUFE_FARBE[stufe]} variant="outline">
      {PRIVATPARTY_STUFE_LABELS[stufe]}
    </Badge>
  );
}

/** The person (an external one, so no member name), else the reply address, else a placeholder. */
export const privatpartyName = (p: Pick<PrivatpartyListeDto, 'person' | 'mailAdresse'>): string =>
  p.person?.name ?? p.mailAdresse ?? 'Neue Anfrage';

/** The dates in the entered order; the accepted one is marked. */
function TerminZeilen({
  termine,
  terminId,
  max,
}: Readonly<{ termine: PrivatpartyTerminDto[]; terminId: string | null; max?: number }>) {
  const sichtbar = max ? termine.slice(0, max) : termine;
  return (
    <Stack gap={2}>
      {sichtbar.map((t) => (
        <Text key={t.id} size="sm" fw={t.id === terminId ? 700 : undefined}>
          {wunschTerminText(t)}
          <Text span c="dimmed">
            {' '}
            · {PRIVATPARTY_STUFE_LABELS[t.stufe]}
          </Text>
        </Text>
      ))}
      {max && termine.length > max && (
        <Text size="sm" c="dimmed">
          + {termine.length - max} weitere
        </Text>
      )}
    </Stack>
  );
}

function Unbeantwortet({ p }: Readonly<{ p: PrivatpartyListeDto }>) {
  return p.unbeantwortet ? (
    <Badge color="red" variant="dot">
      Unbeantwortet
    </Badge>
  ) : null;
}

/** Card on phones; the whole card opens the request. */
function PrivatpartyKarte({ p }: Readonly<{ p: PrivatpartyListeDto }>) {
  return (
    <Paper
      component={Link}
      to={privatpartyLink(p.id)}
      withBorder
      p="md"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
          <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
            {privatpartyName(p)}
          </Text>
          <PrivatpartyStatusBadge status={p.status} />
        </Group>
        {p.anlass && <Text size="sm">{p.anlass}</Text>}
        <TerminZeilen termine={p.termine} terminId={p.terminId} max={3} />
        <Unbeantwortet p={p} />
      </Stack>
    </Paper>
  );
}

/** Requests as cards on phones and as a table from `sm`; the whole row opens the request. */
export function PrivatpartyListe({ liste }: Readonly<{ liste: PrivatpartyListeDto[] }>) {
  const navigate = useNavigate();
  return (
    <KartenOderTabelle
      zeilen={liste}
      zeilenKey={(p) => p.id}
      minWidth={560}
      kartenAbstand="sm"
      tabelle={{ highlightOnHover: true, layout: 'fixed' }}
      spalten={
        <colgroup>
          <col style={{ width: '14rem' }} />
          <col />
          <col style={{ width: '8rem' }} />
          <col style={{ width: '9rem' }} />
        </colgroup>
      }
      karte={(p) => <PrivatpartyKarte p={p} />}
      kopf={
        <Table.Tr>
          <Table.Th>Person</Table.Th>
          <Table.Th>Wunschtermine</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th />
        </Table.Tr>
      }
      zeile={(p) => (
        <Table.Tr style={{ cursor: 'pointer' }} onClick={() => void navigate(privatpartyLink(p.id))}>
          <Table.Td>
            <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
              {privatpartyName(p)}
            </Text>
            {p.anlass && (
              <Text size="sm" c="dimmed">
                {p.anlass}
              </Text>
            )}
          </Table.Td>
          <Table.Td>
            <TerminZeilen termine={p.termine} terminId={p.terminId} max={3} />
          </Table.Td>
          <Table.Td>
            <PrivatpartyStatusBadge status={p.status} />
          </Table.Td>
          <Table.Td>
            <Unbeantwortet p={p} />
          </Table.Td>
        </Table.Tr>
      )}
    />
  );
}
