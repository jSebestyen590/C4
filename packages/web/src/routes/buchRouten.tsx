import { Route } from 'react-router-dom';
import { BuchPage } from '../pages/BuchPage';
import { FinanzenBuchAbrechnenPage } from '../pages/FinanzenBuchAbrechnenPage';
import { FinanzenBuchPage } from '../pages/FinanzenBuchPage';
import { FinanzenBuchSeitePage } from '../pages/FinanzenBuchSeitePage';
import { FinanzenBuchTarifePage } from '../pages/FinanzenBuchTarifePage';
import { Protected, RequireUsername } from './Geschuetzt';

export function buchRouten() {
  return (
    <>
      <Route
        path="/buch"
        element={
          <Protected permission="buch:lesen">
            <RequireUsername>
              <BuchPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/buch"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenBuchPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/buch/abrechnen"
        element={
          <Protected permission="finanzen:buchen">
            <RequireUsername>
              <FinanzenBuchAbrechnenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/buch/tarife"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenBuchTarifePage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/finanzen/buch/seiten/:id"
        element={
          <Protected permission="finanzen:lesen">
            <RequireUsername>
              <FinanzenBuchSeitePage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
