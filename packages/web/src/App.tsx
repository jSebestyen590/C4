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
import { UsernamePage } from './pages/UsernamePage';

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

/** First login: users without a chosen username are sent to the username page. */
function RequireUsername({ children }: Readonly<{ children: ReactNode }>) {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.me.$get()) });
  if (me.isPending) return null;
  if (me.data && !me.data.preferredUsername) return <Navigate to="/username" replace />;
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
            path="/username"
            element={
              <Protected>
                <UsernamePage />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
    </AppLayout>
  );
}
