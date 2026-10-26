/** Browser side of Web Push: capability checks and (un)subscribing this device. */

export type PushStatus =
  | 'laedt'
  /** The browser has no Push API (or no service worker, e.g. in a dev build). */
  | 'nicht-unterstuetzt'
  /** iPhone/iPad: Push works only in the app added to the home screen. */
  | 'ios-installieren'
  | 'verweigert'
  | 'aus'
  | 'an';

export const istIos = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const istStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const apisVorhanden = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * The registration of `/app/sw.js` (scope `/app/`). It is registered at app start, so on the very
 * first visit wait for it, but not forever: without a service worker (dev server) `ready` never settles.
 */
async function registrierung(): Promise<ServiceWorkerRegistration | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), 4000);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function pushStatus(): Promise<PushStatus> {
  if (istIos() && !istStandalone()) return 'ios-installieren';
  if (!apisVorhanden()) return 'nicht-unterstuetzt';
  if (Notification.permission === 'denied') return 'verweigert';
  const reg = await registrierung();
  if (!reg) return 'nicht-unterstuetzt';
  const abo = await reg.pushManager.getSubscription();
  return abo && Notification.permission === 'granted' ? 'an' : 'aus';
}

/** The server's VAPID key (base64url) as the byte array `subscribe` wants. */
function schluesselBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  const roh = atob(base64);
  return Uint8Array.from(roh, (c) => c.charCodeAt(0));
}

export interface GeraeteAbo {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Subscribes this device. The permission must already be granted; asking for it has to happen
 * directly in the click handler (iOS needs the user gesture), see `usePushGeraet`.
 */
export async function geraetAbonnieren(publicKey: string): Promise<GeraeteAbo> {
  const reg = await registrierung();
  if (!reg) throw new Error('Kein Service Worker');
  const abo =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: schluesselBytes(publicKey),
    }));
  const json = abo.toJSON();
  const { p256dh, auth } = json.keys ?? {};
  if (!json.endpoint || !p256dh || !auth) throw new Error('Unvollständiges Abo');
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

/** Unsubscribes this device; returns the endpoint to remove on the server, if there was one. */
export async function geraetDeaktivieren(): Promise<string | null> {
  const abo = await (await registrierung())?.pushManager.getSubscription();
  if (!abo) return null;
  const endpoint = abo.endpoint;
  await abo.unsubscribe();
  return endpoint;
}
