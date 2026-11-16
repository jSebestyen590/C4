import { Container } from '@mantine/core';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '@c4/shared';
import { AppLayout } from './AppLayout';
import { CallbackPage } from './pages/CallbackPage';
import { PushAbfrage } from './PushAbfrage';
import { bilderRouten } from './routes/bilderRouten';
import { finanzenRouten } from './routes/finanzenRouten';
import { inventarRouten } from './routes/inventarRouten';
import { kalenderRouten } from './routes/kalenderRouten';
import { lagerRouten } from './routes/lagerRouten';
import { mitgliederRouten } from './routes/mitgliederRouten';
import { persoenlichRouten } from './routes/persoenlichRouten';
import { postenRouten } from './routes/postenRouten';
import { privatpartysRouten } from './routes/privatpartysRouten';
import { protokolleRouten } from './routes/protokolleRouten';
import { schluesselRouten } from './routes/schluesselRouten';
import { trichterRouten } from './routes/trichterRouten';
import { umfragenRouten } from './routes/umfragenRouten';

/**
 * Composes the per-feature route modules in `routes/`. `<Routes>` accepts only `<Route>` or
 * fragments as children, so the modules are plain functions called inline, not components.
 */
export function App({ config }: Readonly<{ config: AppConfig }>) {
  return (
    <AppLayout>
      {/* Full width: the member list uses all space; other pages limit their own content width. */}
      <Container fluid p={0}>
        <Routes>
          <Route path="/auth/callback" element={<CallbackPage config={config} />} />
          {persoenlichRouten()}
          {mitgliederRouten()}
          {postenRouten()}
          {finanzenRouten()}
          {schluesselRouten()}
          {trichterRouten()}
          {bilderRouten()}
          {privatpartysRouten()}
          {protokolleRouten()}
          {umfragenRouten()}
          {lagerRouten()}
          {inventarRouten()}
          {kalenderRouten()}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
      <PushAbfrage />
    </AppLayout>
  );
}
