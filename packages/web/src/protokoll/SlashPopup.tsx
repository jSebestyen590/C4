import { Paper, Portal, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { SlashListe } from './SlashListe';
import type { SlashEintrag } from './slashLogik';

/** What the suggestion plugin reports to the React side. */
export interface SlashZustand {
  eintraege: SlashEintrag[];
  query: string;
  waehlen: (eintrag: SlashEintrag) => void;
  /** Rectangle of the typed "/query" in the viewport. */
  rect: (() => DOMRect | null) | null | undefined;
}

/** Height of the on-screen keyboard (iOS keeps fixed elements behind it), 0 when there is none. */
function useTastaturHoehe(): number {
  const [hoehe, setHoehe] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const lesen = () =>
      setHoehe(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    lesen();
    vv.addEventListener('resize', lesen);
    vv.addEventListener('scroll', lesen);
    return () => {
      vv.removeEventListener('resize', lesen);
      vv.removeEventListener('scroll', lesen);
    };
  }, []);
  return hoehe;
}

const BREITE = 360;
const MAX_HOEHE = 320;

/**
 * Popup of the slash menu. On phones a full-width panel above the keyboard, otherwise a popover next
 * to the typed "/" (below it, or above when there is no room), clamped to the viewport.
 */
export function SlashPopup({
  zustand,
  auswahl,
  onZeiger,
}: Readonly<{
  zustand: SlashZustand | null;
  auswahl: number;
  onZeiger: (index: number) => void;
}>) {
  const telefon = useMediaQuery('(max-width: 48em)');
  const tastatur = useTastaturHoehe();
  if (!zustand) return null;

  const stil: React.CSSProperties = telefon
    ? {
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: `calc(${tastatur}px + env(safe-area-inset-bottom) + 8px)`,
        maxHeight: `min(${MAX_HOEHE}px, 45dvh)`,
      }
    : desktopStil(zustand.rect?.() ?? null);

  return (
    <Portal>
      <Paper
        withBorder
        shadow="md"
        radius="md"
        p={4}
        className="protokoll-slash-popup protokoll-nicht-drucken"
        style={{ ...stil, zIndex: 400, overflowY: 'auto', background: 'var(--mantine-color-body)' }}
      >
        {zustand.eintraege.length > 0 ? (
          <SlashListe
            eintraege={zustand.eintraege}
            auswahl={auswahl}
            onWaehlen={zustand.waehlen}
            onZeiger={onZeiger}
          />
        ) : (
          <Text size="sm" c="dimmed" p="sm">
            Nichts gefunden
          </Text>
        )}
      </Paper>
    </Portal>
  );
}

function desktopStil(rect: DOMRect | null): React.CSSProperties {
  const breite = Math.min(BREITE, window.innerWidth - 16);
  if (!rect) return { position: 'fixed', left: 8, top: 80, width: breite, maxHeight: MAX_HOEHE };
  const links = Math.min(Math.max(8, rect.left), window.innerWidth - breite - 8);
  const platzUnten = window.innerHeight - rect.bottom - 12;
  const platzOben = rect.top - 12;
  if (platzUnten >= 160 || platzUnten >= platzOben) {
    return {
      position: 'fixed',
      left: links,
      top: rect.bottom + 4,
      width: breite,
      maxHeight: Math.min(MAX_HOEHE, platzUnten),
    };
  }
  return {
    position: 'fixed',
    left: links,
    bottom: window.innerHeight - rect.top + 4,
    width: breite,
    maxHeight: Math.min(MAX_HOEHE, platzOben),
  };
}
