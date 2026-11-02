import { Alert, Button, Container, Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { AppConfig, Permission } from '@c4/shared';
import { unwrap, useApi } from './api';
import { AppLayout } from './AppLayout';
import { useAuth } from './auth';
import { CallbackPage } from './pages/CallbackPage';
import { GegenstandDetailPage } from './pages/GegenstandDetailPage';
import { HomePage } from './pages/HomePage';
import { IfcoDetailPage } from './pages/IfcoDetailPage';
import { AusleiheDetailPage } from './pages/AusleiheDetailPage';
import { AusleihePage } from './pages/AusleihePage';
import { InventarPage } from './pages/InventarPage';
import { InventarStammdatenPage } from './pages/InventarStammdatenPage';
import { EinlagerungPage } from './pages/EinlagerungPage';
import { EntnahmePage } from './pages/EntnahmePage';
import { UmlagerungPage } from './pages/UmlagerungPage';
import { InventurPage } from './pages/InventurPage';
import { LagerPage } from './pages/LagerPage';
import { MitgliedPage } from './pages/MitgliedPage';
import { MitgliederPage } from './pages/MitgliederPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventFormularPage } from './pages/EventFormularPage';
import { KalenderEinrichtungPage } from './pages/KalenderEinrichtungPage';
import { KalenderMeinKalenderPage } from './pages/KalenderMeinKalenderPage';
import { KalenderPage } from './pages/KalenderPage';
import { KalenderStatistikPage } from './pages/KalenderStatistikPage';
import { PostenDetailPage } from './pages/PostenDetailPage';
import { PostenPage } from './pages/PostenPage';
import { BenachrichtigungenPage } from './pages/BenachrichtigungenPage';
import { SchluesselDetailPage } from './pages/SchluesselDetailPage';
import { SchluesselPage } from './pages/SchluesselPage';
import { UmfrageFormularPage } from './pages/UmfrageFormularPage';
import { UmfragePage } from './pages/UmfragePage';
import { TrichterDurchgangPage } from './pages/TrichterDurchgangPage';
import { TrichterPage } from './pages/TrichterPage';
import { TrichterVerwaltungPage } from './pages/TrichterVerwaltungPage';
import { HistoriePage } from './pages/HistoriePage';
import { UmfragenPage } from './pages/UmfragenPage';
import { ProfilPage } from './pages/ProfilPage';
import { PushAbfrage } from './PushAbfrage';
import { StammdatenPage } from './pages/StammdatenPage';
import { WareDetailPage } from './pages/WareDetailPage';
import { WarenPage } from './pages/WarenPage';

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
            mih={44}
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

export function App({ config }: Readonly<{ config: AppConfig }>) {
  return (
    <AppLayout>
      {/* Full width: the member list uses all space; other pages limit their own content width. */}
      <Container fluid p={0}>
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
            path="/historie"
            element={
              <Protected permission="mitglieder:lesen">
                <RequireUsername>
                  <HistoriePage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/mitglieder/:kennung"
            element={
              <Protected permission="mitglieder:lesen">
                <RequireUsername>
                  <MitgliedPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/posten"
            element={
              <Protected permission="posten:lesen">
                <RequireUsername>
                  <PostenPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/posten/:id"
            element={
              <Protected permission="posten:lesen">
                <RequireUsername>
                  <PostenDetailPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/schluessel"
            element={
              <Protected permission="schluessel:lesen">
                <RequireUsername>
                  <SchluesselPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/schluessel/:id"
            element={
              <Protected permission="schluessel:lesen">
                <RequireUsername>
                  <SchluesselDetailPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/trichter"
            element={
              <Protected permission="trichter:lesen">
                <RequireUsername>
                  <TrichterPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/trichter/neu"
            element={
              <Protected permission="trichter:lesen">
                <RequireUsername>
                  <TrichterDurchgangPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/trichter/verwaltung"
            element={
              <Protected permission="trichter:verwalten">
                <RequireUsername>
                  <TrichterVerwaltungPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/umfragen"
            element={
              <Protected permission="umfragen:lesen">
                <RequireUsername>
                  <UmfragenPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/umfragen/neu"
            element={
              <Protected permission="umfragen:lesen">
                <RequireUsername>
                  <UmfrageFormularPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/umfragen/:id"
            element={
              <Protected permission="umfragen:lesen">
                <RequireUsername>
                  <UmfragePage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/umfragen/:id/bearbeiten"
            element={
              <Protected permission="umfragen:lesen">
                <RequireUsername>
                  <UmfrageFormularPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/waren"
            element={
              <Protected permission="waren:lesen">
                <RequireUsername>
                  <WarenPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/waren/:id"
            element={
              <Protected permission="waren:lesen">
                <RequireUsername>
                  <WareDetailPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/inventar"
            element={
              <Protected permission="inventar:lesen">
                <RequireUsername>
                  <InventarPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/inventar/stammdaten"
            element={
              <Protected permission="inventar:lesen">
                <RequireUsername>
                  <InventarStammdatenPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/inventar/gegenstaende/:id"
            element={
              <Protected permission="inventar:lesen">
                <RequireUsername>
                  <GegenstandDetailPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/inventar/ausleihen/neu"
            element={
              <Protected permission="inventar:umraeumen">
                <RequireUsername>
                  <AusleihePage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/inventar/ausleihen/:id/bearbeiten"
            element={
              <Protected permission="inventar:umraeumen">
                <RequireUsername>
                  <AusleihePage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/inventar/ausleihen/:id"
            element={
              <Protected permission="inventar:lesen">
                <RequireUsername>
                  <AusleiheDetailPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/inventar/ifcos/:id"
            element={
              <Protected permission="inventar:lesen">
                <RequireUsername>
                  <IfcoDetailPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/lager"
            element={
              <Protected permission="waren:lesen">
                <RequireUsername>
                  <LagerPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/lager/inventur/:id"
            element={
              <Protected permission="bestand:buchen">
                <RequireUsername>
                  <InventurPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/lager/:id/entnehmen"
            element={
              <Protected permission="bestand:buchen">
                <RequireUsername>
                  <EntnahmePage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/lager/:id/einlagern"
            element={
              <Protected permission="bestand:buchen">
                <RequireUsername>
                  <EinlagerungPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/lager/:id/umlagern"
            element={
              <Protected permission="bestand:buchen">
                <RequireUsername>
                  <UmlagerungPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/lager/stammdaten"
            element={
              <Protected permission="waren:lesen">
                <RequireUsername>
                  <StammdatenPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/kalender"
            element={
              <Protected permission="kalender:lesen">
                <RequireUsername>
                  <KalenderPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/kalender/statistik"
            element={
              <Protected permission="kalender:lesen">
                <RequireUsername>
                  <KalenderStatistikPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/kalender/mein-kalender"
            element={
              <Protected permission="kalender:lesen">
                <RequireUsername>
                  <KalenderMeinKalenderPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/kalender/einrichtung"
            element={
              <Protected permission="kalender:einrichten">
                <RequireUsername>
                  <KalenderEinrichtungPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/kalender/events/neu"
            element={
              <Protected permission="events:verwalten">
                <RequireUsername>
                  <EventFormularPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/kalender/events/:id"
            element={
              <Protected permission="kalender:lesen">
                <RequireUsername>
                  <EventDetailPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route
            path="/kalender/events/:id/bearbeiten"
            element={
              <Protected permission="events:verwalten">
                <RequireUsername>
                  <EventFormularPage />
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
          <Route
            path="/benachrichtigungen"
            element={
              <Protected permission="profil:bearbeiten">
                <RequireUsername>
                  <BenachrichtigungenPage />
                </RequireUsername>
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
      <PushAbfrage />
    </AppLayout>
  );
}
