import { Route } from 'react-router-dom';
import { BenachrichtigungenPage } from '../pages/BenachrichtigungenPage';
import { BenachrichtigungsVerlaufPage } from '../pages/BenachrichtigungsVerlaufPage';
import { HomePage } from '../pages/HomePage';
import { ProfilPage } from '../pages/ProfilPage';
import { TodosPage } from '../pages/TodosPage';
import { Protected, RequireUsername } from './Geschuetzt';

export function persoenlichRouten() {
  return (
    <>
      <Route
        path="/"
        element={
          <Protected>
            <RequireUsername>
              <HomePage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/profil"
        element={
          <Protected permission="profil:bearbeiten">
            <ProfilPage />
          </Protected>
        }
      />
      <Route
        path="/todos"
        element={
          <Protected permission="profil:bearbeiten">
            <RequireUsername>
              <TodosPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/benachrichtigungen"
        element={
          <Protected permission="profil:bearbeiten">
            <RequireUsername>
              <BenachrichtigungenPage />
            </RequireUsername>
          </Protected>
        }
      />
      <Route
        path="/benachrichtigungen/verlauf"
        element={
          <Protected permission="profil:bearbeiten">
            <RequireUsername>
              <BenachrichtigungsVerlaufPage />
            </RequireUsername>
          </Protected>
        }
      />
    </>
  );
}
