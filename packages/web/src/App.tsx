import { Alert, Container, Loader } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { AppConfig, Permission } from '@c4/shared';
import { unwrap, useApi } from './api';
import { AppLayout } from './AppLayout';
import { useAuth } from './auth';
import { AdminPage } from './pages/AdminPage';
import { CallbackPage } from './pages/CallbackPage';
import { HomePage } from './pages/HomePage';
import { MitgliedPage } from './pages/MitgliedPage';
import { MitgliederPage } from './pages/MitgliederPage';
import { ProfilPage } from './pages/ProfilPage';

function Protected({
  children,
  permission,
}: Readonly<{ children: ReactNode; permission?: Permission }>) {
  const { user, can, login } = useAuth();
  if (!user) {
    void login();
    return <Loader m="md" aria-label="Weiterleitung zur Anmeldung" />;
  }
  if (permission && !can(permission))
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
function RequireUsername({ children }: Readonly<{ children: ReactNode }>) {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.me.$get()) });
  const mitglied = useQuery({
    queryKey: ['mitglied'],
    queryFn: async () => {
      const res = await api.me.mitglied.$get();
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Profil konnte nicht geladen werden');
      return res.json();
    },
  });
  if (me.isPending || mitglied.isPending) return null;
  if (me.data && !me.data.preferredUsername) return <Navigate to="/profil" replace />;
  // Invited users already have a row, but with empty names until they filled in their profile.
  if (mitglied.data === null || mitglied.data?.vorname === '')
    return <Navigate to="/profil" replace />;
  return <>{children}</>;
}

export function App({ config }: Readonly<{ config: AppConfig }>) {
  return (
    <AppLayout>
      <Container size="md" p={0}>
        <Routes>
          <Route path="/auth/callback" element={<CallbackPage config={config} />} />
          <Route
            path="/"
            element={
              <Protected>
                <RequireUsername>
                  <HomePage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <Protected permission="users:manage">
                <RequireUsername>
                  <AdminPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/mitglieder"
            element={
              <Protected permission="mitglieder:lesen">
                <RequireUsername>
                  <MitgliederPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/mitglieder/:sub"
            element={
              <Protected permission="mitglieder:lesen">
                <RequireUsername>
                  <MitgliedPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/profil"
            element={
              <Protected permission="profil:bearbeiten">
                <ProfilPage />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
    </AppLayout>
  );
}
