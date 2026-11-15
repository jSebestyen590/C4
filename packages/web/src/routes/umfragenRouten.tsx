import { Route } from 'react-router-dom';
import { UmfrageFormularPage } from '../pages/UmfrageFormularPage';
import { UmfragePage } from '../pages/UmfragePage';
import { UmfragenPage } from '../pages/UmfragenPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function umfragenRouten() {
  return (
    <>
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
    </>
  );
}
