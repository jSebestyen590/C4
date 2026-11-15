import { Route } from 'react-router-dom';
import { AusleiheDetailPage } from '../pages/AusleiheDetailPage';
import { AusleihePage } from '../pages/AusleihePage';
import { GegenstandDetailPage } from '../pages/GegenstandDetailPage';
import { IfcoDetailPage } from '../pages/IfcoDetailPage';
import { InventarPage } from '../pages/InventarPage';
import { InventarStammdatenPage } from '../pages/InventarStammdatenPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function inventarRouten() {
  return (
    <>
      <Route
        path="/inventar"
        element={
          <Protected permission="inventar:lesen">
            <RequireUsername>
              <InventarPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/inventar/stammdaten"
        element={
          <Protected permission="inventar:lesen">
            <RequireUsername>
              <InventarStammdatenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/inventar/gegenstaende/:id"
        element={
          <Protected permission="inventar:lesen">
            <RequireUsername>
              <GegenstandDetailPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/inventar/ausleihen/neu"
        element={
          <Protected permission="inventar:umraeumen">
            <RequireUsername>
              <AusleihePage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/inventar/ausleihen/:id/bearbeiten"
        element={
          <Protected permission="inventar:umraeumen">
            <RequireUsername>
              <AusleihePage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/inventar/ausleihen/:id"
        element={
          <Protected permission="inventar:lesen">
            <RequireUsername>
              <AusleiheDetailPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/inventar/ifcos/:id"
        element={
          <Protected permission="inventar:lesen">
            <RequireUsername>
              <IfcoDetailPage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
