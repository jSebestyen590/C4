import { Route } from 'react-router-dom';
import { EventDetailPage } from '../pages/EventDetailPage';
import { EventFormularPage } from '../pages/EventFormularPage';
import { KalenderEinrichtungPage } from '../pages/KalenderEinrichtungPage';
import { KalenderMeinKalenderPage } from '../pages/KalenderMeinKalenderPage';
import { KalenderPage } from '../pages/KalenderPage';
import { KalenderStatistikPage } from '../pages/KalenderStatistikPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function kalenderRouten() {
  return (
    <>
      <Route
        path="/kalender"
        element={
          <Protected permission="kalender:lesen">
            <RequireUsername>
              <KalenderPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/kalender/statistik"
        element={
          <Protected permission="kalender:lesen">
            <RequireUsername>
              <KalenderStatistikPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/kalender/mein-kalender"
        element={
          <Protected permission="kalender:lesen">
            <RequireUsername>
              <KalenderMeinKalenderPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/kalender/einrichtung"
        element={
          <Protected permission="kalender:einrichten">
            <RequireUsername>
              <KalenderEinrichtungPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/kalender/events/neu"
        element={
          <Protected permission="events:verwalten">
            <RequireUsername>
              <EventFormularPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/kalender/events/:id"
        element={
          <Protected permission="kalender:lesen">
            <RequireUsername>
              <EventDetailPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/kalender/events/:id/bearbeiten"
        element={
          <Protected permission="events:verwalten">
            <RequireUsername>
              <EventFormularPage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
