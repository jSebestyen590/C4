import { Box, Group, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

/** Horizontal distance (share of the width) after which a swipe counts. */
const SCHWELLE = 0.35;
/** Movement up to this many pixels still counts as a click. */
const KLICK_TOLERANZ = 10;

/**
 * Wraps a card: a click (or Enter) calls `onKlick`; a swipe left or right of more than 35% of the
 * width calls `onGelesen` (only when `aktiv`). Shorter swipes spring back. Vertical scrolling stays
 * with the browser (`touch-action: pan-y`).
 */
export function WischZumGelesen({
  aktiv,
  onGelesen,
  onKlick,
  children,
}: Readonly<{
  aktiv: boolean;
  onGelesen: () => void;
  onKlick: () => void;
  children: ReactNode;
}>) {
  const [dx, setDx] = useState(0);
  const [zieht, setZieht] = useState(false);
  const start = useRef<{ x: number; y: number; breite: number; id: number } | null>(null);
  const bewegt = useRef(false);

  const ende = (abbruch: boolean) => {
    const s = start.current;
    start.current = null;
    setZieht(false);
    if (s && !abbruch && bewegt.current && Math.abs(dx) >= s.breite * SCHWELLE) {
      // Let the card fly out, then report it.
      setDx(Math.sign(dx) * s.breite);
      onGelesen();
    } else {
      setDx(0);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!aktiv || (e.pointerType === 'mouse' && e.button !== 0)) return;
    bewegt.current = false;
    start.current = {
      x: e.clientX,
      y: e.clientY,
      breite: e.currentTarget.getBoundingClientRect().width,
      id: e.pointerId,
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const x = e.clientX - s.x;
    if (!bewegt.current) {
      if (Math.abs(x) <= KLICK_TOLERANZ || Math.abs(e.clientY - s.y) > Math.abs(x)) return;
      bewegt.current = true;
      setZieht(true);
      // Capture only now, so clicks on inner buttons keep working.
      e.currentTarget.setPointerCapture(s.id);
    }
    setDx(x);
  };
  const onClick = () => {
    // A swipe ends with a click event as well: ignore it.
    if (bewegt.current) {
      bewegt.current = false;
      return;
    }
    onKlick();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onKlick();
    }
  };

  return (
    <Box pos="relative" style={{ overflow: 'hidden', borderRadius: 'var(--mantine-radius-md)' }}>
      {aktiv && dx !== 0 && (
        <Group
          pos="absolute"
          inset={0}
          px="md"
          gap="xs"
          justify={dx > 0 ? 'flex-start' : 'flex-end'}
          bg="green.7"
          c="white"
          aria-hidden
        >
          <IconCheck size={20} />
          <Text fw={600}>Gelesen</Text>
        </Group>
      )}
      <Box
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => ende(false)}
        onPointerCancel={() => ende(true)}
        onClick={onClick}
        onKeyDown={onKeyDown}
        style={{
          transform: `translateX(${dx}px)`,
          transition: zieht ? 'none' : 'transform 200ms ease',
          touchAction: aktiv ? 'pan-y' : undefined,
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
