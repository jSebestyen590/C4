import { Route } from 'react-router-dom';
import { PostenDetailPage } from '../pages/PostenDetailPage';
import { PostenPage } from '../pages/PostenPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function postenRouten() {
  return (
    <>
      <Route
        path="/posten"
        element={
          <Protected permission="posten:lesen">
            <RequireUsername>
              <PostenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/posten/:id"
        element={
          <Protected permission="posten:lesen">
            <RequireUsername>
              <PostenDetailPage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
