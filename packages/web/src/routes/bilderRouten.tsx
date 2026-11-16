import { Route } from 'react-router-dom';
import { BilderEinrichtungPage } from '../pages/BilderEinrichtungPage';
import { BilderPage } from '../pages/BilderPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function bilderRouten() {
  return (
    <>
      <Route
        path="/bilder"
        element={
          <Protected permission="bilder:lesen">
            <RequireUsername>
              <BilderPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/bilder/einrichtung"
        element={
          <Protected permission="users:manage">
            <RequireUsername>
              <BilderEinrichtungPage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
