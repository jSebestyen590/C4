import { defineConfig } from '@playwright/test';

// Passwort und Benutzer stehen nur in `.env.e2e` (gitignored). Fehlt die Datei, meldet das Setup es.
try {
  process.loadEnvFile('.env.e2e');
} catch {
  // Wird im Setup mit einer klaren Meldung behandelt.
}

// Navigation immer relativ ohne führenden Slash (`page.goto('finanzen/konten')`), damit `/app/` erhalten bleibt.
const basis = process.env.E2E_BASE_URL || 'https://dev.c4-leipzig.de/app/';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  workers: 4,
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: basis.endsWith('/') ? basis : `${basis}/`,
    serviceWorkers: 'block',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // Das Passwort würde im Trace mitgeschrieben (`fill`), deshalb hier kein Trace.
    { name: 'setup', testMatch: /.*\.setup\.ts/, use: { trace: 'off', screenshot: 'off' } },
    {
      name: 'phone',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /routen-vollstaendig\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        storageState: '.auth/state.json',
      },
    },
    {
      name: 'desktop',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        storageState: '.auth/state.json',
      },
    },
  ],
});
