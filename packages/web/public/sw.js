/* global self, URL */
// Service worker of C4: shows Web Push notifications and opens the app when one is clicked.
// Payload (JSON): { titel, text, url } with an app-relative url like /app/kalender/events/<id>.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let nachricht = { titel: 'C4', text: '', url: '/app/' };
  try {
    nachricht = { ...nachricht, ...event.data.json() };
  } catch {
    // Not JSON: keep the defaults.
  }
  event.waitUntil(
    self.registration.showNotification(nachricht.titel, {
      body: nachricht.text,
      icon: '/app/icon-180.png',
      data: { url: nachricht.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only paths inside the app are served by the SPA; anything else would hit S3 directly.
  const pfad = event.notification.data?.url ?? '/app/';
  const ziel = new URL(
    pfad.startsWith('/app/') ? pfad : `/app${pfad.startsWith('/') ? '' : '/'}${pfad}`,
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenster) => {
      const offen = fenster.find((c) => c.url.startsWith(self.location.origin + '/app/'));
      if (offen) {
        return offen.focus().then((c) => ('navigate' in c ? c.navigate(ziel) : undefined));
      }
      return self.clients.openWindow(ziel);
    }),
  );
});
