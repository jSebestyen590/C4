import { Box, Tooltip } from '@mantine/core';
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  /* As wide as the longest label; inside a ZeitstrahlGruppe the widest label of all charts. */
  grid-template-columns: var(--zs-label, max-content) minmax(var(--zs-min), 1fr);
}
/* A fling that hits the start or end must not chain to the page (pull-to-refresh, swipe back). */
.zs-scroll { overscroll-behavior: contain; }
/* Caps a label so long names wrap instead of widening the column. */
.zs-label-text { display: inline-block; max-width: 88px; }
@media (min-width: 36em) {
  .zs-label-text { max-width: 192px; }
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

/** Collects the natural label width of each chart in a group. */
const GruppenContext = createContext<((id: string, breite: number) => void) | null>(null);

/** Gives all charts inside the same label column width, so their time axes line up. */
export function ZeitstrahlGruppe({ children }: Readonly<{ children: ReactNode }>) {
  const [breiten, setBreiten] = useState<Record<string, number>>({});
  const melden = useCallback(
    (id: string, breite: number) =>
      setBreiten((alt) => (alt[id] === breite ? alt : { ...alt, [id]: breite })),
    [],
  );
  const max = Math.max(0, ...Object.values(breiten));
  return (
    <GruppenContext.Provider value={melden}>
      <div style={max > 0 ? { ['--zs-label' as string]: `${max}px` } : undefined}>{children}</div>
    </GruppenContext.Provider>
  );
}

/**
 * Reports the widest label of this chart to the surrounding group. Labels are inline blocks, so
 * their width does not depend on the column width and the measurement cannot feed back on itself.
 */
function useLabelBreite(zeilen: readonly ZeitZeile[]) {
  const melden = useContext(GruppenContext);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!melden || !grid) return;
    const messen = () => {
      const texte = [...grid.querySelectorAll<HTMLElement>('.zs-label-text')];
      // + 8px right padding of the label cell.
      melden(id, Math.ceil(Math.max(0, ...texte.map((t) => t.getBoundingClientRect().width))) + 8);
    };
    messen();
    const beobachter = new ResizeObserver(messen);
    grid.querySelectorAll('.zs-label-text').forEach((t) => beobachter.observe(t));
    return () => {
      beobachter.disconnect();
      melden(id, 0);
    };
  }, [melden, id, zeilen]);
  return ref;
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
  const gridRef = useLabelBreite(zeilen);
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
        ref={gridRef}
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
              <div
                className="zs-label-text"
                style={{ minWidth: 0, overflowWrap: 'break-word', hyphens: 'auto' }}
              >
                {z.label}
              </div>
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
