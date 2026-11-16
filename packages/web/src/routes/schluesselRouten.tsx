import { Route } from 'react-router-dom';
import { SchluesselAnfragePage } from '../pages/SchluesselAnfragePage';
import { SchluesselDetailPage } from '../pages/SchluesselDetailPage';
import { SchluesselPage } from '../pages/SchluesselPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function schluesselRouten() {
  return (
    <>
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
        path="/schluessel/anfragen/:id"
        element={
          <Protected permission="schluessel:lesen">
            <RequireUsername>
              <SchluesselAnfragePage />
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
    </>
  );
}
