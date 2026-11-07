import { Box, Button, Drawer, Text, UnstyledButton, useMantineTheme } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconListTree } from '@tabler/icons-react';
import { useMemo, type ReactNode } from 'react';
import type { MeineErwaehnung } from './erwaehnungLogik';
import {
  dokumentGliederungBauen,
  type DokumentGliederungsKnoten,
  type DokumentUeberschrift,
} from './dokumentUeberschriften';

/** Height of the app header (`AppLayout`). */
const HEADER_HOEHE = 56;
/** Space above a heading that the sticky app header covers when scrolled to. */
const SCROLL_ABSTAND = HEADER_HOEHE + 16;

/** Scrolls the page smoothly to the heading element `id` of the document view. */
export function zuUeberschriftScrollen(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.scrollMarginTop = `${SCROLL_ABSTAND}px`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Ebene({
  knoten,
  onWaehlen,
}: Readonly<{ knoten: DokumentGliederungsKnoten[]; onWaehlen: (id: string) => void }>) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {knoten.map((k) => (
        <li key={k.id}>
          <UnstyledButton
            onClick={() => onWaehlen(k.id)}
            style={{
              width: '100%',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
            }}
          >
            <Text size="sm" fw={k.ebene === 1 ? 700 : 400} truncate style={{ minWidth: 0 }}>
              {k.text}
            </Text>
          </UnstyledButton>
          {k.kinder.length > 0 && (
            <div style={{ paddingLeft: 'var(--mantine-spacing-md)' }}>
              <Ebene knoten={k.kinder} onWaehlen={onWaehlen} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "Meine Erwähnungen": where the viewer is mentioned, each with its heading and an excerpt. */
function MeineErwaehnungenListe({
  erwaehnungen,
  onWaehlen,
}: Readonly<{ erwaehnungen: readonly MeineErwaehnung[]; onWaehlen: (id: string) => void }>) {
  return (
    <section aria-label="Meine Erwähnungen" data-testid="meine-erwaehnungen">
      <Text fw={700} size="sm" mt="md" mb={4}>
        Meine Erwähnungen
      </Text>
      {erwaehnungen.length === 0 ? (
        <Text size="sm" c="dimmed">
          Du wirst in diesem Protokoll nicht erwähnt.
        </Text>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {erwaehnungen.map((e) => (
            <li key={e.id}>
              <UnstyledButton
                onClick={() => onWaehlen(e.id)}
                style={{ width: '100%', minHeight: 44, padding: '6px 0', minWidth: 0 }}
              >
                {e.ueberschrift && (
                  <Text size="xs" c="dimmed" truncate>
                    {e.ueberschrift}
                  </Text>
                )}
                <Text size="sm" lineClamp={3} style={{ overflowWrap: 'anywhere' }}>
                  {e.auszug}
                </Text>
              </UnstyledButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Tree of the headings of the document view; a tap scrolls to the heading. With `erwaehnungen` the
 * "Meine Erwähnungen" overview follows below it.
 */
export function DokumentGliederung({
  eintraege,
  erwaehnungen,
  onGewaehlt,
}: Readonly<{
  eintraege: readonly DokumentUeberschrift[];
  /** The mentions that concern the viewer; undefined = no overview (viewer unknown). */
  erwaehnungen?: readonly MeineErwaehnung[];
  onGewaehlt?: () => void;
}>) {
  const baum = useMemo(() => dokumentGliederungBauen(eintraege), [eintraege]);
  const waehlen = (id: string) => {
    onGewaehlt?.();
    // Wait until the drawer has closed and released the page scroll.
    setTimeout(() => zuUeberschriftScrollen(id), onGewaehlt ? 300 : 0);
  };
  return (
    <>
      {baum.length > 0 && (
        <nav aria-label="Gliederung">
          <Ebene knoten={baum} onWaehlen={waehlen} />
        </nav>
      )}
      {erwaehnungen && <MeineErwaehnungenListe erwaehnungen={erwaehnungen} onWaehlen={waehlen} />}
    </>
  );
}

/**
 * Frame of the document view: the document (at most A4 wide) with the outline in a sticky aside to
 * its right from `lg`, below that a "Gliederung" button opening a drawer. Not printed.
 */
export function DokumentRahmen({
  eintraege,
  erwaehnungen,
  zeigeErwaehnungen = false,
  children,
}: Readonly<{
  eintraege: readonly DokumentUeberschrift[];
  /** The mentions that concern the viewer. */
  erwaehnungen?: readonly MeineErwaehnung[];
  /** Whether to show "Meine Erwähnungen" (the viewer is known), also when there are none. */
  zeigeErwaehnungen?: boolean;
  children: ReactNode;
}>) {
  const theme = useMantineTheme();
  const breit = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`, false);
  const [offen, { open, close }] = useDisclosure(false);
  const mitGliederung = eintraege.length > 0 || zeigeErwaehnungen;
  const titel = eintraege.length > 0 ? 'Gliederung' : 'Meine Erwähnungen';
  const meine = zeigeErwaehnungen ? (erwaehnungen ?? []) : undefined;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: breit ? 'row' : 'column',
        alignItems: breit ? 'flex-start' : 'stretch',
        justifyContent: 'center',
        gap: 'var(--mantine-spacing-md)',
      }}
    >
      {mitGliederung && !breit && (
        <Box data-druck="aus" w="100%" maw="21cm" mx="auto">
          <Button
            variant="default"
            size="md"
            leftSection={<IconListTree size={18} />}
            onClick={open}
          >
            {titel}
          </Button>
        </Box>
      )}
      {children}
      {mitGliederung && breit && (
        <Box
          component="aside"
          data-druck="aus"
          aria-label="Gliederung"
          style={{
            flex: '0 0 clamp(16rem, 22vw, 26rem)',
            position: 'sticky',
            top: `calc(${HEADER_HOEHE}px + env(safe-area-inset-top) + var(--mantine-spacing-xs))`,
            maxHeight: `calc(100dvh - ${HEADER_HOEHE}px - env(safe-area-inset-top) - 2 * var(--mantine-spacing-md))`,
            overflowY: 'auto',
            padding: 'var(--mantine-spacing-xs)',
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <DokumentGliederung eintraege={eintraege} erwaehnungen={meine} />
        </Box>
      )}
      {mitGliederung && !breit && (
        <Drawer
          opened={offen}
          onClose={close}
          position="right"
          size="min(24rem, 100%)"
          title={titel}
        >
          <DokumentGliederung eintraege={eintraege} erwaehnungen={meine} onGewaehlt={close} />
        </Drawer>
      )}
    </div>
  );
}
