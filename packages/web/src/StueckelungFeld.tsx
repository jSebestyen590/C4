import { ActionIcon, Box, Text, TextInput } from '@mantine/core';
import { IconPlusMinus } from '@tabler/icons-react';
import type { CSSProperties, ReactNode } from 'react';
import { ANZAHL_MAX, centAnzeigen, NENNWERTE_CENT, type StueckelungDto } from '@c4/shared';
import { bestandFehler, mengeVon, mengenSumme, type Mengen } from './bargeldFormular';
import { BETRAG_STIL } from './finanzenDaten';
import { feldReihenfolge, type FeldReihenfolge } from './feldReihenfolge';

const ZAHL = new Intl.NumberFormat('de-DE');
const istNegativ = (w: number | null | undefined) =>
  w !== null && w !== undefined && (w < 0 || Object.is(w, -0));
const zeigeWert = (w: number | null | undefined) =>
  w === null || w === undefined ? '' : Object.is(w, -0) ? '-' : String(w);
const vorzeichenText = (n: number) => (n > 0 ? `+${ZAHL.format(n)}` : ZAHL.format(n));

/** One count column of a `StueckelungFeld` with several columns. */
export interface StueckelungSpalte {
  id: string;
  label: string;
  value: Mengen;
  onChange: (m: Mengen) => void;
  /** `ab` takes from the stock (can be capped), `zu` adds to it. */
  richtung: 'ab' | 'zu';
  /** Counts above the stock are errors (needs `bestand`). */
  begrenzen?: boolean;
}

const ZELLE: CSSProperties = {
  padding: '4px var(--mantine-spacing-xs)',
  borderBottom: '1px solid var(--mantine-color-default-border)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
};
const KOPF: CSSProperties = { ...ZELLE, fontWeight: 600, fontSize: 'var(--mantine-font-size-sm)' };
const FUSS: CSSProperties = { ...ZELLE, borderBottom: 'none', fontWeight: 600 };

/**
 * Typed counts per denomination (1 ct up to 100 EUR), one integer field per row and count column.
 * Single column (`value`/`onChange`): optional stock column (`bestand`, `bestandLabel`) and the
 * difference to it, `begrenzen` makes a count above the stock a field error. Several columns
 * (`spalten`, e.g. Abgang and Zugang when changing money): stock, one column each and the stock
 * afterwards. It looks like a table (CSS grid with explicit cell positions), but the fields are
 * emitted in the walking order (`reihenfolge`: row by row or column by column), so Tab, the iOS
 * keyboard arrows, Enter (`data-nav`) and screen readers all follow it. The footer sums live.
 */
export function StueckelungFeld({
  value,
  onChange,
  spalten,
  reihenfolge = 'zeilen',
  label,
  bestand,
  bestandLabel = 'Bestand',
  differenz = false,
  begrenzen = false,
  vorzeichen: mitVorzeichen = false,
  fehler: fehlerVorgabe,
  disabled = false,
}: Readonly<{
  value?: Mengen;
  onChange?: (m: Mengen) => void;
  spalten?: readonly StueckelungSpalte[];
  reihenfolge?: FeldReihenfolge;
  /** Accessible name of the whole table. */
  label: string;
  bestand?: readonly StueckelungDto[];
  bestandLabel?: string;
  /** Show `value - bestand` per row (single column, needs `bestand`). */
  differenz?: boolean;
  /** Single column: counts above the stock are errors (needs `bestand`). */
  begrenzen?: boolean;
  /**
   * Single column: counts may be negative (change coming back). Typing `-` works on a keyboard, a ±
   * button flips the sign on touch (the numeric keypad has no minus). Negative counts show red.
   */
  vorzeichen?: boolean;
  /** Single column: field errors per denomination, replacing the `begrenzen` check. */
  fehler?: ReadonlyMap<number, string>;
  disabled?: boolean;
}>) {
  const mehrere = !!spalten;
  const cols: readonly StueckelungSpalte[] = spalten ?? [
    {
      id: 'anzahl',
      label: 'Anzahl',
      value: value ?? {},
      onChange: onChange ?? (() => undefined),
      richtung: 'ab',
      begrenzen,
    },
  ];
  const vorrat = new Map((bestand ?? []).map((s) => [s.nennwertCent, s.anzahl]));
  const fehler = cols.map((c) =>
    !mehrere && fehlerVorgabe
      ? fehlerVorgabe
      : c.begrenzen && bestand
        ? bestandFehler(c.value, bestand)
        : new Map<number, string>(),
  );
  const bestandSumme = [...vorrat].reduce((s, [n, a]) => s + n * a, 0);
  const summen = cols.map((c) => mengenSumme(c.value));
  const einzel = cols[0]!;
  const diffSumme = summen[0]! - bestandSumme;
  const danach = (n: number) =>
    (vorrat.get(n) ?? 0) +
    cols.reduce((s, c) => s + (c.richtung === 'zu' ? 1 : -1) * mengeVon(c.value, n), 0);
  const danachSumme = NENNWERTE_CENT.reduce((s, n) => s + n * danach(n), 0);

  // Grid columns: Wert, [Bestand], count columns, then Differenz / Bestand danach / Betrag.
  let spalte = 1;
  const wertSp = spalte++;
  const bestandSp = bestand ? spalte++ : 0;
  const ersteZaehlSp = spalte;
  spalte += cols.length;
  const diffSp = !mehrere && differenz && bestand ? spalte++ : 0;
  const danachSp = mehrere && bestand ? spalte++ : 0;
  const betragSp = !mehrere ? spalte : 0;
  const template = [
    'max-content',
    ...(bestand ? ['max-content'] : []),
    ...cols.map(() => `minmax(${mitVorzeichen ? 130 : 76}px, 200px)`),
    ...(diffSp ? ['max-content'] : []),
    ...(danachSp ? ['max-content'] : []),
    ...(betragSp ? ['max-content'] : []),
  ].join(' ');
  const FUSS_ZEILE = NENNWERTE_CENT.length + 2;

  const zelle = (
    key: string,
    zeile: number,
    sp: number,
    inhalt: ReactNode,
    stil: CSSProperties = ZELLE,
    farbe?: string,
  ) => (
    <Box
      key={key}
      c={farbe}
      style={{
        ...stil,
        ...BETRAG_STIL,
        gridRow: zeile,
        gridColumn: sp,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {inhalt}
    </Box>
  );

  const statisch: ReactNode[] = [
    zelle('k-wert', 1, wertSp, 'Wert', KOPF),
    ...(bestand ? [zelle('k-bestand', 1, bestandSp, bestandLabel, KOPF)] : []),
    ...cols.map((c, s) => zelle(`k-${c.id}`, 1, ersteZaehlSp + s, c.label, KOPF)),
    ...(diffSp ? [zelle('k-diff', 1, diffSp, 'Differenz', KOPF)] : []),
    ...(danachSp ? [zelle('k-danach', 1, danachSp, 'Bestand danach', KOPF)] : []),
    ...(betragSp ? [zelle('k-betrag', 1, betragSp, 'Betrag', KOPF)] : []),
  ];
  NENNWERTE_CENT.forEach((n, z) => {
    const r = z + 2;
    const d = mengeVon(einzel.value, n) - (vorrat.get(n) ?? 0);
    const nach = danach(n);
    statisch.push(zelle(`w-${n}`, r, wertSp, centAnzeigen(n)));
    if (bestand)
      statisch.push(
        zelle(`b-${n}`, r, bestandSp, ZAHL.format(vorrat.get(n) ?? 0), ZELLE, 'dimmed'),
      );
    if (diffSp)
      statisch.push(
        zelle(
          `d-${n}`,
          r,
          diffSp,
          d === 0 ? '–' : vorzeichenText(d),
          { ...ZELLE, fontWeight: d === 0 ? 400 : 600 },
          d === 0 ? 'dimmed' : d > 0 ? 'teal' : 'red',
        ),
      );
    if (danachSp)
      statisch.push(
        zelle(`n-${n}`, r, danachSp, ZAHL.format(nach), ZELLE, nach < 0 ? 'red' : 'dimmed'),
      );
    if (betragSp) {
      const a = mengeVon(einzel.value, n);
      statisch.push(
        zelle(
          `t-${n}`,
          r,
          betragSp,
          a === 0 ? '–' : a < 0 ? `${centAnzeigen(n * a)} zurück` : centAnzeigen(n * a),
          ZELLE,
          a === 0 ? 'dimmed' : a < 0 ? 'red' : undefined,
        ),
      );
    }
  });
  statisch.push(zelle('f-wert', FUSS_ZEILE, wertSp, 'Summe', FUSS));
  if (bestand)
    statisch.push(zelle('f-bestand', FUSS_ZEILE, bestandSp, centAnzeigen(bestandSumme), FUSS));
  cols.forEach((c, s) =>
    mehrere
      ? statisch.push(
          zelle(`f-${c.id}`, FUSS_ZEILE, ersteZaehlSp + s, centAnzeigen(summen[s]!), FUSS),
        )
      : null,
  );
  if (diffSp)
    statisch.push(
      zelle(
        'f-diff',
        FUSS_ZEILE,
        diffSp,
        diffSumme === 0 ? '–' : `${diffSumme > 0 ? '+' : '−'}${centAnzeigen(Math.abs(diffSumme))}`,
        FUSS,
        diffSumme === 0 ? undefined : diffSumme > 0 ? 'teal' : 'red',
      ),
    );
  if (danachSp)
    statisch.push(zelle('f-danach', FUSS_ZEILE, danachSp, centAnzeigen(danachSumme), FUSS));
  if (betragSp)
    statisch.push(zelle('f-betrag', FUSS_ZEILE, betragSp, centAnzeigen(summen[0]!), FUSS));

  // The fields come last and in walking order, so the DOM order is the order of Tab and Enter.
  const felder = feldReihenfolge(NENNWERTE_CENT.length, cols.length, reihenfolge).map(([z, s]) => {
    const n = NENNWERTE_CENT[z]!;
    const c = cols[s]!;
    const wert = c.value[n];
    const meldung = fehler[s]!.get(n);
    return (
      <Box key={`${c.id}-${n}`} style={{ ...ZELLE, gridRow: z + 2, gridColumn: ersteZaehlSp + s }}>
        <Box style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
          <TextInput
            style={{ flex: 1, minWidth: 0 }}
            aria-label={`${c.label} ${centAnzeigen(n)}`}
            value={zeigeWert(wert)}
            inputMode="numeric"
            enterKeyHint="next"
            autoComplete="off"
            maxLength={mitVorzeichen ? 8 : 7}
            placeholder="0"
            disabled={disabled}
            data-nav=""
            error={!!meldung || Math.abs(mengeVon(c.value, n)) > ANZAHL_MAX}
            onChange={(e) => {
              const roh = e.currentTarget.value;
              const ziffern = roh.replace(/\D/g, '');
              const minus = mitVorzeichen && /^\s*[-−]/.test(roh);
              // `-0` keeps a lone minus sign visible while the digits are still to come.
              c.onChange({
                ...c.value,
                [n]: ziffern === '' ? (minus ? -0 : null) : (minus ? -1 : 1) * Number(ziffern),
              });
            }}
            onFocus={(e) => e.currentTarget.select()}
            styles={{
              input: {
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 'max(16px, 1rem)',
                color: istNegativ(wert) ? 'var(--mantine-color-red-7)' : undefined,
              },
            }}
          />
          {mitVorzeichen && !disabled && (
            <ActionIcon
              type="button"
              variant="default"
              size={42}
              tabIndex={-1}
              aria-label={`Vorzeichen umkehren für ${centAnzeigen(n)}`}
              onClick={() =>
                c.onChange({ ...c.value, [n]: wert ? -wert : istNegativ(wert) ? null : -0 })
              }
            >
              <IconPlusMinus size={18} />
            </ActionIcon>
          )}
        </Box>
        {meldung && (
          <Text size="xs" c="red" ta="right" role="alert">
            {meldung}
          </Text>
        )}
      </Box>
    );
  });

  return (
    <Box style={{ overflowX: 'auto', maxWidth: mehrere ? 760 : 640 }}>
      <Box
        role="group"
        aria-label={label}
        data-stueckelung=""
        style={{ display: 'grid', gridTemplateColumns: template }}
      >
        {statisch}
        {felder}
      </Box>
    </Box>
  );
}
