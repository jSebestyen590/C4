import { Route } from 'react-router-dom';
import { PrivatpartyFormularPage } from '../pages/PrivatpartyFormularPage';
import { PrivatpartyPage } from '../pages/PrivatpartyPage';
import { PrivatpartyPersonPage } from '../pages/PrivatpartyPersonPage';
import { PrivatpartyPersonenPage } from '../pages/PrivatpartyPersonenPage';
import { PrivatpartysPage } from '../pages/PrivatpartysPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function privatpartysRouten() {
  return (
    <>
      <Route
        path="/privatpartys"
        element={
          <Protected permission="privatpartys:verwalten">
            <RequireUsername>
              <PrivatpartysPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/privatpartys/neu"
        element={
          <Protected permission="privatpartys:verwalten">
            <RequireUsername>
              <PrivatpartyFormularPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/privatpartys/personen"
        element={
          <Protected permission="privatpartys:verwalten">
            <RequireUsername>
              <PrivatpartyPersonenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/privatpartys/personen/:id"
        element={
          <Protected permission="privatpartys:verwalten">
            <RequireUsername>
              <PrivatpartyPersonPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/privatpartys/:id/bearbeiten"
        element={
          <Protected permission="privatpartys:verwalten">
            <RequireUsername>
              <PrivatpartyFormularPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/privatpartys/:id"
        element={
          <Protected permission="privatpartys:verwalten">
            <RequireUsername>
              <PrivatpartyPage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
