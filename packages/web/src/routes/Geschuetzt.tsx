import { Alert, Button, Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Permission } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { mitgliederKeys } from '../queryKeys';

export function Protected({
  children,
  permission,
  anyOf,
}: Readonly<{
  children: ReactNode;
  permission?: Permission;
  /** Alternative to `permission`: one of these is enough. */
  anyOf?: readonly Permission[];
}>) {
  const { user, can, login } = useAuth();
  if (!user) {
    void login();
    return <Loader m="md" aria-label="Weiterleitung zur Anmeldung" />;
  }
  if ((permission && !can(permission)) || (anyOf && !anyOf.some((p) => can(p))))
    return (
      <Alert color="red" title="Kein Zugriff">
        Du darfst diese Seite nicht ansehen.
      </Alert>
    );
  return <>{children}</>;
}

/**
 * First login: users without a username or a profile are sent to the profile page, where they
 * choose both at once.
 */
export function RequireUsername({ children }: Readonly<{ children: ReactNode }>) {
  const api = useApi();
  const me = useQuery({
    queryKey: mitgliederKeys.me,
    queryFn: async () => unwrap(await api.me.$get()),
  });
  const mitglied = useQuery({
    queryKey: mitgliederKeys.mitglied,
    queryFn: async () => {
      const res = await api.me.mitglied.$get();
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Profil konnte nicht geladen werden');
      return res.json();
    },
  });
  // Pages query ['me'] themselves; mounting them for an errored query would refetch it, flip it
  // back to pending, unmount them here and loop endlessly. So stop at the error.
  if (me.isError || mitglied.isError)
    return (
      <Alert color="red" title="Verbindung fehlgeschlagen" m="md">
        <Stack gap="sm" align="flex-start">
          <Text size="sm">
            Dein Profil konnte nicht geladen werden. Versuch es gleich noch einmal.
          </Text>
          <Button
            size="md"
            mih={42}
            variant="light"
            color="red"
            loading={me.isFetching || mitglied.isFetching}
            onClick={() => {
              if (me.isError) void me.refetch();
              if (mitglied.isError) void mitglied.refetch();
            }}
          >
            Erneut versuchen
          </Button>
        </Stack>
      </Alert>
    );
  if (me.isPending || mitglied.isPending) return null;
  if (me.data && !me.data.preferredUsername) return <Navigate to="/profil" replace />;
  // Invited users already have a row, but with empty names until they filled in their profile.
  if (mitglied.data === null || mitglied.data?.vorname === '')
    return <Navigate to="/profil" replace />;
  return <>{children}</>;
}
