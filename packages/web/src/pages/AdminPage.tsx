import {
  Alert,
  Badge,
  Button,
  Chip,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { createUserSchema, ROLES, type Role } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { label, ROLE_LABELS, USER_STATUS_LABELS } from '../i18n';

export function AdminPage() {
  const api = useApi();
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => unwrap(await api.admin.users.$get()),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const create = useMutation({
    mutationFn: async (input: { email: string; groups: Role[] }) =>
      unwrap(await api.admin.users.$post({ json: input })),
    onSuccess: refresh,
  });
  const setGroups = useMutation({
    mutationFn: async (input: { username: string; groups: Role[] }) =>
      unwrap(
        await api.admin.users[':username'].groups.$put({
          param: { username: input.username },
          json: { groups: input.groups },
        }),
      ),
    onSuccess: refresh,
  });

  const [email, setEmail] = useState('');
  const [newGroups, setNewGroups] = useState<Role[]>(['reader']);
  const [emailError, setEmailError] = useState<string | null>(null);

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return setEmailError('Bitte gib eine E-Mail-Adresse ein.');
    if (!createUserSchema.shape.email.safeParse(trimmed).success)
      return setEmailError('Das ist keine gültige E-Mail-Adresse.');
    setEmailError(null);
    create.mutate({ email: trimmed, groups: newGroups }, { onSuccess: () => setEmail('') });
  };

  return (
    <Stack>
      <Title order={2}>Benutzer</Title>
      <Paper withBorder p="md">
        <form onSubmit={onSubmit} noValidate>
          <Stack>
            <TextInput
              type="email"
              required
              label="Per E-Mail einladen"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              error={emailError}
            />
            <Chip.Group multiple value={newGroups} onChange={(v) => setNewGroups(v as Role[])}>
              <Group gap="xs">
                {ROLES.map((role) => (
                  <Chip key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            <Button type="submit" loading={create.isPending} fullWidth>
              Einladen
            </Button>
          </Stack>
        </form>
      </Paper>
      {create.isError && <Alert color="red">Benutzer konnte nicht angelegt werden.</Alert>}
      {users.isError && <Alert color="red">Benutzer konnten nicht geladen werden.</Alert>}
      {users.data?.map((u) => (
        <Paper key={u.username} withBorder p="md">
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <div style={{ minWidth: 0 }}>
                <Text fw={500} truncate>
                  {u.email}
                </Text>
                <Text size="sm" c="dimmed">
                  {u.preferredUsername ?? '(Benutzername noch nicht gewählt)'}
                </Text>
              </div>
              <Badge variant="light">{label(USER_STATUS_LABELS, u.status)}</Badge>
            </Group>
            <Chip.Group
              multiple
              value={u.groups.filter((g) => (ROLES as readonly string[]).includes(g))}
              onChange={(v) => setGroups.mutate({ username: u.username, groups: v as Role[] })}
            >
              <Group gap="xs">
                {ROLES.map((role) => (
                  <Chip key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
