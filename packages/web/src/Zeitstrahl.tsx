import { Box, Tooltip } from '@mantine/core';
import { Fragment, type ReactNode } from 'react';
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

const ZEILE_HOEHE = 28;
const BALKEN_HOEHE = 20;
const ACHSE_HOEHE = 18;

/** Layout and print rules shared by all timelines; render once per page. */
export const ZEITSTRAHL_CSS = `
.zs-inner {
  display: grid;
  /* The label column is only as wide as its longest label, capped so long names wrap. */
  grid-template-columns: fit-content(96px) minmax(var(--zs-min), 1fr);
}
@media (min-width: 36em) {
  .zs-inner { grid-template-columns: fit-content(200px) minmax(var(--zs-min), 1fr); }
}
/* No margin: browsers then leave out their own header and footer (URL, date, page number). */
@page { size: A4 landscape; margin: 0; }
@media print {
  body { padding: 10mm; }
  .mantine-AppShell-header, .mantine-AppShell-navbar, [data-druck="aus"] { display: none !important; }
  .mantine-AppShell-main { padding: 0 !important; }
  .zs-scroll { overflow: visible !important; padding-bottom: 0 !important; }
  .zs-inner { --zs-min: 0px !important; }
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
          top: `calc(50% - ${BALKEN_HOEHE / 2}px)`,
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
  const linie = '1px solid var(--mantine-color-default-border)';
  const labelStil = {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    boxSizing: 'border-box',
    paddingRight: 8,
    background: 'var(--mantine-color-body)',
    display: 'flex',
    alignItems: 'center',
    fontSize: 'var(--mantine-font-size-sm)',
    lineHeight: 1.2,
    minWidth: 0,
  } as const;
  // Lines above the first and below the last row frame the chart.
  const rand = (i: number) => ({
    borderTop: linie,
    ...(i === zeilen.length - 1 ? { borderBottom: linie } : {}),
  });
  return (
    <Box
      className="zs-scroll"
      // Room for overlay scrollbars, so they do not cover the last row.
      style={{ overflowX: 'auto', paddingBottom: 12 }}
      role="group"
      aria-label={beschriftung}
    >
      <Box
        className="zs-inner"
        style={{
          width: '100%',
          // Needs a definite px value; set per instance.
          ['--zs-min' as string]: `${mindestBreite(bereich)}px`,
        }}
      >
        <div style={{ ...labelStil, zIndex: 3 }} />
        <div style={{ position: 'relative', height: ACHSE_HOEHE }}>
          {ticks(bereich).map((t) => (
            <Box
              key={t.prozent}
              style={{
                position: 'absolute',
                left: `${t.prozent}%`,
                bottom: 2,
                paddingLeft: 3,
                fontSize: 'var(--mantine-font-size-xs)',
                lineHeight: 1,
                color: 'var(--mantine-color-dimmed)',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </Box>
          ))}
        </div>
        {zeilen.map((z, i) => (
          <Fragment key={z.key}>
            <div style={{ ...labelStil, ...rand(i) }}>
              <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{z.label}</div>
            </div>
            <div style={{ position: 'relative', minHeight: ZEILE_HOEHE, ...rand(i) }}>
              <Gitter bereich={bereich} />
              {z.balken.map((b) => (
                <Balken key={`${b.von}-${b.bis}-${b.farbe}`} b={b} bereich={bereich} />
              ))}
            </div>
          </Fragment>
        ))}
      </Box>
    </Box>
  );
}
