import { Route } from 'react-router-dom';
import { FinanzenAuslagenPage } from '../pages/FinanzenAuslagenPage';
import { FinanzenBelegDetailPage } from '../pages/FinanzenBelegDetailPage';
import { FinanzenBelegePage } from '../pages/FinanzenBelegePage';
import { FinanzenBelegPage } from '../pages/FinanzenBelegPage';
import { FinanzenWarengruppenKategorienPage } from '../pages/FinanzenWarengruppenKategorienPage';
import { FinanzenRechnungsstellerPage } from '../pages/FinanzenRechnungsstellerPage';
import { FinanzenBargeldPage } from '../pages/FinanzenBargeldPage';
import { FinanzenBargeldUmbuchenPage } from '../pages/FinanzenBargeldUmbuchenPage';
import { FinanzenBargeldWechselnPage } from '../pages/FinanzenBargeldWechselnPage';
import { FinanzenBargeldZaehlenPage } from '../pages/FinanzenBargeldZaehlenPage';
import { FinanzenBuchenPage } from '../pages/FinanzenBuchenPage';
import { FinanzenBuchungPage } from '../pages/FinanzenBuchungPage';
import { FinanzenJournalPage } from '../pages/FinanzenJournalPage';
import { FinanzenKasseAbrechnenPage } from '../pages/FinanzenKasseAbrechnenPage';
import { FinanzenKassenabrechnungPage } from '../pages/FinanzenKassenabrechnungPage';
import { FinanzenKassenabrechnungenPage } from '../pages/FinanzenKassenabrechnungenPage';
import { FinanzenKassenPage } from '../pages/FinanzenKassenPage';
import { FinanzenKettePage } from '../pages/FinanzenKettePage';
import { FinanzenKontenPage } from '../pages/FinanzenKontenPage';
import { FinanzenPage } from '../pages/FinanzenPage';
import { LagerAbgleichPage } from '../pages/LagerAbgleichPage';
import { LagerAbgleichWarePage } from '../pages/LagerAbgleichWarePage';
import { FinanzenZaehlungPage } from '../pages/FinanzenZaehlungPage';
import { FinanzenZaehlungenPage } from '../pages/FinanzenZaehlungenPage';
import { BelegEinreichenPage } from '../pages/BelegEinreichenPage';
import { MeineBelegePage } from '../pages/MeineBelegePage';
import { MeinBelegPage } from '../pages/MeinBelegPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function finanzenRouten() {
  return (
    <>
      <Route
        path="/belege"
        element={
          <Protected permission="belege:einreichen">
            <RequireUsername>
              <MeineBelegePage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/belege/einreichen"
        element={
          <Protected permission="belege:einreichen">
            <RequireUsername>
              <BelegEinreichenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/belege/:id"
        element={
          <Protected permission="belege:einreichen">
            <RequireUsername>
              <MeinBelegPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/konten"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenKontenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/journal"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenJournalPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/journal/:id"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenBuchungPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/buchen"
        element={
          <Protected permission="finanzen:buchen">
            <RequireUsername>
              <FinanzenBuchenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/bargeld"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenBargeldPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/bargeld/umbuchen"
        element={
          <Protected permission="finanzen:buchen">
            <RequireUsername>
              <FinanzenBargeldUmbuchenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/bargeld/wechseln"
        element={
          <Protected permission="finanzen:buchen">
            <RequireUsername>
              <FinanzenBargeldWechselnPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/bargeld/zaehlen"
        element={
          <Protected permission="finanzen:buchen">
            <RequireUsername>
              <FinanzenBargeldZaehlenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/bargeld/zaehlungen"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenZaehlungenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/bargeld/zaehlungen/:id"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenZaehlungPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/kassen"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenKassenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/kassen/abrechnungen"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenKassenabrechnungenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/kassen/abrechnungen/:id"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenKassenabrechnungPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/kassen/:kontoId/abrechnen"
        element={
          <Protected permission="finanzen:buchen">
            <RequireUsername>
              <FinanzenKasseAbrechnenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/belege"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenBelegePage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/lager-abgleich"
        element={
          <Protected anyOf={['finanzen:lesen', 'waren:verwalten']}>
            <RequireUsername>
              <LagerAbgleichPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/lager-abgleich/:wareId"
        element={
          <Protected anyOf={['finanzen:lesen', 'waren:verwalten']}>
            <RequireUsername>
              <LagerAbgleichWarePage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/belege/neu"
        element={
          <Protected permission="finanzen:buchen">
            <RequireUsername>
              <FinanzenBelegPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/belege/entwurf/:id"
        element={
          <Protected permission="finanzen:buchen">
            <RequireUsername>
              <FinanzenBelegPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/belege/:id"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenBelegDetailPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/auslagen"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenAuslagenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/rechnungssteller"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenRechnungsstellerPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/warengruppen-kategorien"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenWarengruppenKategorienPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/kette"
        element={
          <Protected permission="finanzen:pruefen">
            <RequireUsername>
              <FinanzenKettePage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
