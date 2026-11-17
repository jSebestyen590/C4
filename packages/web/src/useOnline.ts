import { useSyncExternalStore } from 'react';

function abonnieren(aenderung: () => void) {
  window.addEventListener('online', aenderung);
  window.addEventListener('offline', aenderung);
  return () => {
    window.removeEventListener('online', aenderung);
    window.removeEventListener('offline', aenderung);
  };
}

/** Tracks the browser's online state (`online`/`offline` events). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    abonnieren,
    () => navigator.onLine,
    () => true,
  );
}
