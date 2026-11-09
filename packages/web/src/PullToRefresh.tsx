import { Loader, Paper } from '@mantine/core';
import { IconArrowDown } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

/** Pull distance (px) after which letting go reloads the page. */
const SCHWELLE = 80;

const istHomescreenApp = () =>
  globalThis.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** A touch that starts inside a dialog, drawer or menu scrolls that layer, not the page. */
const inEbene = (ziel: EventTarget | null) =>
  ziel instanceof Element &&
  ziel.closest(
    'nav, [role="dialog"], [role="menu"], [role="listbox"], [data-rfd-drag-handle-draggable-id]',
  );

/**
 * Pull-to-refresh for the app started from the iOS home screen, where Safari offers none: pulling
 * down at the top of the page shows an indicator and letting go past the threshold reloads.
 */
export function PullToRefresh() {
  const [zug, setZug] = useState(0);
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    if (!istHomescreenApp()) return;
    let start: number | null = null;
    let weite = 0;
    const beginn = (e: TouchEvent) => {
      start =
        e.touches.length === 1 && window.scrollY <= 0 && !inEbene(e.target)
          ? e.touches[0]!.clientY
          : null;
      weite = 0;
    };
    const bewegung = (e: TouchEvent) => {
      if (start === null) return;
      if (window.scrollY > 0) {
        start = null;
        setZug(0);
        return;
      }
      weite = Math.max(0, e.touches[0]!.clientY - start);
      setZug(weite);
    };
    const ende = () => {
      if (start !== null && weite >= SCHWELLE) {
        setLaedt(true);
        window.location.reload();
      } else setZug(0);
      start = null;
      weite = 0;
    };
    window.addEventListener('touchstart', beginn, { passive: true });
    window.addEventListener('touchmove', bewegung, { passive: true });
    window.addEventListener('touchend', ende);
    window.addEventListener('touchcancel', ende);
    return () => {
      window.removeEventListener('touchstart', beginn);
      window.removeEventListener('touchmove', bewegung);
      window.removeEventListener('touchend', ende);
      window.removeEventListener('touchcancel', ende);
    };
  }, []);

  if (zug < 10 && !laedt) return null;
  const bereit = zug >= SCHWELLE;
  return (
    <Paper
      shadow="md"
      radius="xl"
      p={8}
      aria-live="polite"
      aria-label={
        laedt ? 'Wird neu geladen' : bereit ? 'Loslassen zum Neuladen' : 'Zum Neuladen ziehen'
      }
      style={{
        position: 'fixed',
        left: '50%',
        top: `calc(env(safe-area-inset-top) + ${Math.min(zug, SCHWELLE * 1.5) / 2}px)`,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        lineHeight: 0,
      }}
    >
      {laedt ? (
        <Loader size={24} />
      ) : (
        <IconArrowDown
          size={24}
          style={{
            transform: `rotate(${bereit ? 180 : (zug / SCHWELLE) * 180}deg)`,
            opacity: Math.min(1, zug / SCHWELLE),
          }}
        />
      )}
    </Paper>
  );
}
