import { MantineProvider, Text } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
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
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-center" />
      {error ? (
        <Text p="md">Start fehlgeschlagen: {error}</Text>
      ) : config ? (
        <AuthProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter basename="/app">
              <App config={config} />
            </BrowserRouter>
          </QueryClientProvider>
        </AuthProvider>
      ) : null}
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
