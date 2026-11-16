import { Route } from 'react-router-dom';
import { TrichterDurchgangPage } from '../pages/TrichterDurchgangPage';
import { TrichterPage } from '../pages/TrichterPage';
import { TrichterVerwaltungPage } from '../pages/TrichterVerwaltungPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function trichterRouten() {
  return (
    <>
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
    </>
  );
}
