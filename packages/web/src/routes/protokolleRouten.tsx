import { Route } from 'react-router-dom';
import { ProtokollNeuPage } from '../pages/ProtokollNeuPage';
import { ProtokollPage } from '../pages/ProtokollPage';
import { ProtokollePage } from '../pages/ProtokollePage';
import { Protected, RequireUsername } from './Geschuetzt';

export function protokolleRouten() {
  return (
    <>
      <Route
        path="/protokolle"
        element={
          <Protected permission="protokolle:lesen">
            <RequireUsername>
              <ProtokollePage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/protokolle/neu"
        element={
          <Protected permission="protokolle:schreiben">
            <RequireUsername>
              <ProtokollNeuPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/protokolle/:id"
        element={
          <Protected permission="protokolle:lesen">
            <RequireUsername>
              <ProtokollPage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
