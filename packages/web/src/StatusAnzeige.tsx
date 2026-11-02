import { Badge, Select, Stack, Text, Title, useComputedColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MITGLIED_STATI, type Anrede, type MitgliedStatus } from '@c4/shared';
import { useApi } from './api';
import { useAuth } from './auth';
import { labelFuer, MITGLIED_STATUS_LABELS } from './i18n';

const BADGE_FARBE: Record<MitgliedStatus, string> = {
  anwaerter: 'orange',
  mitglied: 'green',
  em: 'gray',
  extern: 'blue',
};

/** [light, dark] shade of the username per status; both keep enough contrast on their background. */
const NAME_FARBE: Record<MitgliedStatus, [string, string]> = {
  anwaerter: ['orange.9', 'orange.4'],
  mitglied: ['green.9', 'green.4'],
  em: ['gray.7', 'gray.5'],
  extern: ['blue.9', 'blue.4'],
};

/** Text color for a member's username, matching the active light/dark mode. */
export function useStatusFarbe(status: MitgliedStatus): string {
  const dunkel = useComputedColorScheme('light') === 'dark';
  return NAME_FARBE[status][dunkel ? 1 : 0];
}

export function StatusBadge({
  status,
  anrede,
}: Readonly<{ status: MitgliedStatus; anrede: Anrede }>) {
  return (
    <Badge color={BADGE_FARBE[status]} variant="light">
      {labelFuer(MITGLIED_STATUS_LABELS, status, anrede)}
    </Badge>
  );
}

/** A member's primary label (username or name): always bold, in the color of their status. */
export function StatusName({
  status,
  children,
}: Readonly<{ status: MitgliedStatus; children: string }>) {
  const farbe = useStatusFarbe(status);
  return (
    <Text component="span" fw={700} c={farbe} style={{ overflowWrap: 'anywhere' }}>
      {children}
    </Text>
  );
}

/** Page heading in the color of the member's status. */
export function StatusTitel({
  status,
  children,
}: Readonly<{ status: MitgliedStatus; children: string }>) {
  const farbe = useStatusFarbe(status);
  return (
    <Title order={2} c={farbe} style={{ overflowWrap: 'anywhere' }}>
      {children}
    </Title>
  );
}

/** Admins pick the status; everyone else sees it read-only. */
export function StatusFeld({
  sub,
  status,
  anrede,
}: Readonly<{ sub: string; status: MitgliedStatus; anrede: Anrede }>) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const setzen = useMutation({
    mutationFn: async (neu: MitgliedStatus) => {
      const res = await api.admin.mitglieder[':sub'].status.$put({
        param: { sub },
        json: { status: neu },
      });
      if (res.status === 404) throw new Error('kein-profil');
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: async () => {
      await Promise.all(
        ['mitglieder', 'mitglied'].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
      notifications.show({ color: 'green', message: 'Der Status wurde gespeichert.' });
    },
    onError: (err) =>
      notifications.show({
        color: 'red',
        message:
          err.message === 'kein-profil'
            ? 'Der Status kann erst geändert werden, wenn das Mitglied sein Profil angelegt hat.'
            : 'Der Status konnte nicht gespeichert werden.',
      }),
  });

  if (!can('users:manage'))
    return (
      <Stack gap={4}>
        <Text size="sm" c="dimmed">
          Status
        </Text>
        <div>
          <StatusBadge status={status} anrede={anrede} />
        </div>
      </Stack>
    );
  return (
    <Select
      label="Status"
      data={MITGLIED_STATI.map((s) => ({
        value: s,
        label: labelFuer(MITGLIED_STATUS_LABELS, s, anrede),
      }))}
      value={status}
      allowDeselect={false}
      disabled={setzen.isPending}
      onChange={(v) => v && setzen.mutate(v as MitgliedStatus)}
    />
  );
}
