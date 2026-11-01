import { MantineProvider, Text } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import 'dayjs/locale/de';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import type { AppConfig } from '@c4/shared';
import { App } from './App';
import { AuthProvider } from './auth';
import { loadAppConfig } from './config';
import { theme } from './theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Root() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadAppConfig().then(setConfig, (e: unknown) => setError(String(e)));
  }, []);
  // A data router is required for `useBlocker` (unsaved changes in the profile).
  const router = useMemo(
    () =>
      config
        ? createBrowserRouter([{ path: '*', element: <App config={config} /> }], {
            basename: '/app',
          })
        : null,
    [config],
  );
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <DatesProvider settings={{ locale: 'de', firstDayOfWeek: 1 }}>
        <Notifications position="top-center" />
        {error ? (
          <Text p="md">Start fehlgeschlagen: {error}</Text>
        ) : config && router ? (
          <AuthProvider config={config}>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </AuthProvider>
        ) : null}
      </DatesProvider>
    </MantineProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// Service worker for Web Push (scope /app/). Skipped in `vite dev`, where /app/sw.js is not a stable file.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register('/app/sw.js', { scope: '/app/' })
    .catch((err: unknown) => console.warn('Service worker registration failed', err));
}
