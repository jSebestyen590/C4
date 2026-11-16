import { Route } from 'react-router-dom';
import { HistoriePage } from '../pages/HistoriePage';
import { MitgliedPage } from '../pages/MitgliedPage';
import { MitgliederPage } from '../pages/MitgliederPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function mitgliederRouten() {
  return (
    <>
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
    </>
  );
}
