import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import type { AppConfig } from '@c4/shared';
import { App } from './App';
import { AuthProvider } from './auth';
import { loadAppConfig } from './config';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Root() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadAppConfig().then(setConfig, (e: unknown) => setError(String(e)));
  }, []);
  if (error) return <p>Failed to start: {error}</p>;
  if (!config) return null;
  return (
    <AuthProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename="/app">
          <App config={config} />
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
