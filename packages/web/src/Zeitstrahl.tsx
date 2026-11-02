import { Box, Tooltip } from '@mantine/core';
import type { ReactNode } from 'react';
import {
  balkenPosition,
  mantineFarbe,
  mindestBreite,
  ticks,
  type Bereich,
} from './zeitstrahlLogik';

export interface ZeitBalken {
  von: string;
  bis: string;
  /** Mantine color as `name.shade`, e.g. `blue.6`. */
  farbe: string;
  /** Tooltip and accessible label. */
  titel: string;
  /** Hatched instead of filled (unknown data). */
  gestrichelt?: boolean;
}

export interface ZeitZeile {
  key: string;
  label: ReactNode;
  balken: ZeitBalken[];
}

const LABEL_BREITE = 140;
const ZEILE_HOEHE = 28;
const BALKEN_HOEHE = 20;

/** Layout and print rules shared by all timelines; render once per page. */
export const ZEITSTRAHL_CSS = `
.zs-chart { min-width: var(--zs-min); }
@page { size: A4 landscape; margin: 10mm; }
@media print {
  .mantine-AppShell-header, .mantine-AppShell-navbar, [data-druck="aus"] { display: none !important; }
  .mantine-AppShell-main { padding: 0 !important; }
  .zs-scroll { overflow: visible !important; }
  .zs-chart, .zs-inner { min-width: 0 !important; }
  .zs-block { break-inside: avoid; }
  .mantine-Tooltip-tooltip { display: none !important; }
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;

export function ZeitstrahlStyle() {
  return <style>{ZEITSTRAHL_CSS}</style>;
}

function Gitter({ bereich }: Readonly<{ bereich: Bereich }>) {
  return (
    <>
      {ticks(bereich).map((t) => (
        <Box
          key={t.prozent}
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${t.prozent}%`,
            width: 1,
            background: 'var(--mantine-color-default-border)',
          }}
        />
      ))}
    </>
  );
}

function Balken({ b, bereich }: Readonly<{ b: ZeitBalken; bereich: Bereich }>) {
  const { links, breite } = balkenPosition(bereich, b.von, b.bis);
  const farbe = mantineFarbe(b.farbe);
  return (
    <Tooltip label={b.titel} events={{ hover: true, focus: true, touch: true }} withinPortal>
      <Box
        tabIndex={0}
        role="img"
        aria-label={b.titel}
        style={{
          position: 'absolute',
          top: (ZEILE_HOEHE - BALKEN_HOEHE) / 2,
          height: BALKEN_HOEHE,
          left: `${links}%`,
          width: `${breite}%`,
          minWidth: 2,
          borderRadius: 3,
          boxSizing: 'border-box',
          ...(b.gestrichelt
            ? {
                border: `1px dashed ${farbe}`,
                backgroundImage: `repeating-linear-gradient(45deg, ${farbe} 0 2px, transparent 2px 6px)`,
                opacity: 0.7,
              }
            : { background: farbe, borderRight: '1px solid var(--mantine-color-body)' }),
        }}
      />
    </Tooltip>
  );
}

/**
 * Gantt-like chart: one row per entry, bars positioned in percent of the range. The label column
 * stays put while the chart scrolls sideways inside its own container (not the page).
 */
export function Zeitstrahl({
  bereich,
  zeilen,
  beschriftung,
}: Readonly<{ bereich: Bereich; zeilen: ZeitZeile[]; beschriftung: string }>) {
  const zeilenStil = { display: 'flex', alignItems: 'stretch', minHeight: ZEILE_HOEHE } as const;
  const labelStil = {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    flex: `0 0 ${LABEL_BREITE}px`,
    width: LABEL_BREITE,
    boxSizing: 'border-box',
    paddingRight: 8,
    background: 'var(--mantine-color-body)',
    display: 'flex',
    alignItems: 'center',
    fontSize: 'var(--mantine-font-size-sm)',
    lineHeight: 1.2,
    minWidth: 0,
  } as const;
  return (
    <Box className="zs-scroll" style={{ overflowX: 'auto' }} role="group" aria-label={beschriftung}>
      <Box
        className="zs-inner"
        style={{
          width: '100%',
          minWidth: `calc(${LABEL_BREITE}px + var(--zs-min))`,
          // Needs a definite px value in calc(); set per instance.
          ['--zs-min' as string]: `${mindestBreite(bereich)}px`,
        }}
      >
        <div style={zeilenStil}>
          <div style={{ ...labelStil, zIndex: 3 }} />
          <div className="zs-chart" style={{ flex: 1, position: 'relative', height: 22 }}>
            {ticks(bereich).map((t) => (
              <Box
                key={t.prozent}
                style={{
                  position: 'absolute',
                  left: `${t.prozent}%`,
                  paddingLeft: 3,
                  fontSize: 'var(--mantine-font-size-xs)',
                  color: 'var(--mantine-color-dimmed)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </Box>
            ))}
          </div>
        </div>
        {zeilen.map((z) => (
          <div
            key={z.key}
            style={{
              ...zeilenStil,
              borderTop: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <div style={labelStil}>
              <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{z.label}</div>
            </div>
            <div className="zs-chart" style={{ flex: 1, position: 'relative' }}>
              <Gitter bereich={bereich} />
              {z.balken.map((b) => (
                <Balken key={`${b.von}-${b.bis}-${b.farbe}`} b={b} bereich={bereich} />
              ))}
            </div>
          </div>
        ))}
      </Box>
    </Box>
  );
}
