import { Alert, Badge, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { unwrap, useApi } from '../api';
import { label, labelFuer, PERMISSION_LABELS, ROLE_LABELS } from '../i18n';

export function HomePage() {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.me.$get()) });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.health.$get()).json(),
  });
  return (
    <Stack>
      <Title order={2}>C4</Title>
      <Paper withBorder p="md">
        <Group justify="space-between">
          <Text fw={500}>Status API / Datenbank</Text>
          {health.data ? (
            <Badge color={health.data.status === 'ok' && health.data.db === 'ok' ? 'green' : 'red'}>
              {health.data.status} / DB {health.data.db}
            </Badge>
          ) : (
            <Skeleton height={22} width={90} />
          )}
        </Group>
      </Paper>
      {me.isError && <Alert color="red">Profil konnte nicht geladen werden.</Alert>}
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text c="dimmed" size="sm">
            Benutzer
          </Text>
          {me.data ? (
            <Text>{me.data.preferredUsername ?? me.data.sub}</Text>
          ) : (
            <Skeleton height={20} />
          )}
          <Text c="dimmed" size="sm" mt="xs">
            Rollen
          </Text>
          <Group gap="xs">
            {me.data?.groups.map((g) => (
              <Badge key={g}>{labelFuer(ROLE_LABELS, g, me.data?.anrede ?? 'neutral')}</Badge>
            ))}
            {me.data && me.data.groups.length === 0 && <Text>—</Text>}
          </Group>
          <Text c="dimmed" size="sm" mt="xs">
            Berechtigungen
          </Text>
          <Group gap="xs">
            {me.data?.permissions.map((p) => (
              <Badge key={p} variant="light">
                {label(PERMISSION_LABELS, p)}
              </Badge>
            ))}
            {me.data && me.data.permissions.length === 0 && <Text>—</Text>}
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
