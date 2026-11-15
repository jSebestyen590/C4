import { Badge, Chip, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ROLES, type Anrede, type Role } from '@c4/shared';
import { useApi } from './api';
import { labelFuer, ROLE_LABELS } from './i18n';
import { mitgliederKeys } from './queryKeys';

/** Role badges of a member; renders nothing without roles. */
export function RollenBadges({
  rollen,
  anrede,
}: Readonly<{ rollen: readonly string[]; anrede: Anrede }>) {
  if (rollen.length === 0) return null;
  return (
    <Group gap={4}>
      {rollen.map((rolle) => (
        <Badge key={rolle} variant="outline" color="blue">
          {labelFuer(ROLE_LABELS, rolle, anrede)}
        </Badge>
      ))}
    </Group>
  );
}

/** Admins add and remove roles of a member here. */
export function RollenFeld({
  sub,
  rollen,
  anrede,
}: Readonly<{ sub: string; rollen: readonly string[]; anrede: Anrede }>) {
  const api = useApi();
  const qc = useQueryClient();
  const setzen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (groups: Role[]) => {
      const res = await api.admin.mitglieder[':sub'].rollen.$put({
        param: { sub },
        json: { groups },
      });
      if (res.status === 400) throw new Error('selbst');
      if (res.status === 404) throw new Error('kein-konto');
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: mitgliederKeys.alle });
      notifications.show({ color: 'green', message: 'Die Rollen wurden gespeichert.' });
    },
    onError: (err) =>
      notifications.show({
        color: 'red',
        message:
          err.message === 'selbst'
            ? 'Du kannst dir die Administrator-Rolle nicht selbst entziehen.'
            : 'Die Rollen konnten nicht gespeichert werden.',
      }),
  });

  return (
    <Stack gap={4}>
      <Text size="sm" c="dimmed">
        Rollen
      </Text>
      <Chip.Group
        multiple
        value={rollen.filter((r) => (ROLES as readonly string[]).includes(r))}
        onChange={(v) => !setzen.isPending && setzen.mutate(v as Role[])}
      >
        <Group gap="xs">
          {ROLES.map((role) => (
            <Chip key={role} value={role} disabled={setzen.isPending}>
              {ROLE_LABELS[role][anrede]}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </Stack>
  );
}
