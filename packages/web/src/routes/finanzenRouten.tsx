import { Route } from 'react-router-dom';
import { FinanzenBargeldPage } from '../pages/FinanzenBargeldPage';
import { FinanzenBargeldUmbuchenPage } from '../pages/FinanzenBargeldUmbuchenPage';
import { FinanzenBargeldWechselnPage } from '../pages/FinanzenBargeldWechselnPage';
import { FinanzenBargeldZaehlenPage } from '../pages/FinanzenBargeldZaehlenPage';
import { FinanzenBuchenPage } from '../pages/FinanzenBuchenPage';
import { FinanzenBuchungPage } from '../pages/FinanzenBuchungPage';
import { FinanzenJournalPage } from '../pages/FinanzenJournalPage';
import { FinanzenKettePage } from '../pages/FinanzenKettePage';
import { FinanzenKontenPage } from '../pages/FinanzenKontenPage';
import { FinanzenPage } from '../pages/FinanzenPage';
import { FinanzenZaehlungPage } from '../pages/FinanzenZaehlungPage';
import { FinanzenZaehlungenPage } from '../pages/FinanzenZaehlungenPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function finanzenRouten() {
  return (
    <>
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
