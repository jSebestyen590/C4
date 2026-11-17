import { Route } from 'react-router-dom';
import { EinlagerungPage } from '../pages/EinlagerungPage';
import { EntnahmePage } from '../pages/EntnahmePage';
import { InventurPage } from '../pages/InventurPage';
import { LagerPage } from '../pages/LagerPage';
import { StammdatenPage } from '../pages/StammdatenPage';
import { UmlagerungPage } from '../pages/UmlagerungPage';
import { WareDetailPage } from '../pages/WareDetailPage';
import { WarenPage } from '../pages/WarenPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function lagerRouten() {
  return (
    <>
      <Route
        path="/waren"
        element={
          <Protected permission="waren:lesen">
            <RequireUsername>
              <WarenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/waren/:id"
        element={
          <Protected permission="waren:lesen">
            <RequireUsername>
              <WareDetailPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/lager"
        element={
          <Protected permission="waren:lesen">
            <RequireUsername>
              <LagerPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/lager/inventur/:id"
        element={
          <Protected permission="bestand:buchen">
            <RequireUsername>
              <InventurPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/lager/:id/entnehmen"
        element={
          <Protected permission="bestand:buchen">
            <RequireUsername>
              <EntnahmePage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/lager/:id/einlagern"
        element={
          <Protected permission="bestand:buchen">
            <RequireUsername>
              <EinlagerungPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/lager/:id/umlagern"
        element={
          <Protected permission="bestand:buchen">
            <RequireUsername>
              <UmlagerungPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/lager/stammdaten"
        element={
          <Protected permission="waren:lesen">
            <RequireUsername>
              <StammdatenPage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
