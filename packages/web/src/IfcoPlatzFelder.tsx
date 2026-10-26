import { SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import {
  ifcoPlatzMasseSchema,
  MAX_IFCO_HOEHE_CM,
  MAX_STELLFLAECHEN,
  type IfcoPlatzMasse,
} from '@c4/shared';
import { bodenMasse, reihenHoehen } from './ifcoPlatz';
import { ZahlFeld } from './ZahlFeld';

/** Input of the IFCO-Lagerplatz fields; the number fields hold '' while empty. */
export interface IfcoPlatzWert {
  aktiv: boolean;
  hoeheCm: number | string;
  stellflaechen: number | string;
  /** Heights of Reihe 2, 3, … (by row number) that differ from the first; only for new Regalböden. */
  reihenHoehen?: Record<number, number | string>;
}

/** Initial fields; pass the dimensions of an existing IFCO-Lagerplatz to edit it. */
export const ifcoPlatzStandard = (masse?: IfcoPlatzMasse | null): IfcoPlatzWert => ({
  aktiv: masse != null,
  hoeheCm: masse?.hoeheCm ?? '',
  stellflaechen: masse?.stellflaechen ?? 1,
  reihenHoehen: {},
});

/**
 * The dimensions to send: null when the switch is off, an error text when the fields are invalid,
 * otherwise the dimensions.
 */
export function ifcoPlatzErgebnis(w: IfcoPlatzWert): IfcoPlatzMasse | null | string {
  if (!w.aktiv) return null;
  const parsed = ifcoPlatzMasseSchema.safeParse({
    hoeheCm: typeof w.hoeheCm === 'number' ? w.hoeheCm : undefined,
    stellflaechen: typeof w.stellflaechen === 'number' ? w.stellflaechen : undefined,
  });
  if (parsed.success) return parsed.data;
  return parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.';
}

/**
 * Dimensions for the new Böden of a Regal with `reihen` Reihen of `plaetze` Böden: null when the
 * switch is off, an error text, one object for a single Reihe, otherwise one entry per Boden
 * (every Reihe with its own height, the Stellflächen shared).
 */
export function boedenPlatzErgebnis(
  w: IfcoPlatzWert,
  reihen: number,
  plaetze: number,
): IfcoPlatzMasse | IfcoPlatzMasse[] | null | string {
  if (!w.aktiv || reihen <= 1) return ifcoPlatzErgebnis(w);
  const proReihe: IfcoPlatzMasse[] = [];
  for (const hoeheCm of reihenHoehen(w.hoeheCm, w.reihenHoehen, reihen)) {
    const e = ifcoPlatzErgebnis({ ...w, hoeheCm });
    if (e === null || typeof e === 'string') return e;
    proReihe.push(e);
  }
  return bodenMasse(proReihe, plaetze);
}

/** Switch "IFCO-Lagerplatz" with the height (cm) and the number of Stellflächen. */
export function IfcoPlatzFelder({
  wert,
  onChange,
  label = 'IFCO-Lagerplatz',
  beschreibung = 'Hier können IFCOs stehen; Höhe und Stellflächen bestimmen, was passt.',
  gesperrt,
  reihen = 1,
}: Readonly<{
  wert: IfcoPlatzWert;
  onChange: (w: IfcoPlatzWert) => void;
  label?: string;
  beschreibung?: string;
  /** Why the switch cannot be turned on (shown instead of the fields); null/undefined = it can. */
  gesperrt?: string | null;
  /** Number of Reihen of new Regalböden: with more than one, every Reihe gets its own height field. */
  reihen?: number;
}>) {
  const hoehen = reihenHoehen(wert.hoeheCm, wert.reihenHoehen, reihen);
  return (
    <Stack gap="xs">
      <Switch
        label={label}
        description={gesperrt ?? beschreibung}
        checked={wert.aktiv && !gesperrt}
        disabled={!!gesperrt}
        onChange={(e) => onChange({ ...wert, aktiv: e.currentTarget.checked })}
      />
      {wert.aktiv && !gesperrt && (
        <>
          <SimpleGrid cols={2} spacing="sm">
            <ZahlFeld
              label={reihen > 1 ? 'Höhe Reihe 1 (cm)' : 'Höhe (cm)'}
              value={wert.hoeheCm}
              onChange={(hoeheCm) => onChange({ ...wert, hoeheCm })}
              min={0.5}
              max={MAX_IFCO_HOEHE_CM}
              step={0.5}
              decimalScale={1}
              decimalSeparator=","
              allowNegative={false}
              inputMode="decimal"
            />
            <ZahlFeld
              label="Stellflächen"
              value={wert.stellflaechen}
              onChange={(stellflaechen) => onChange({ ...wert, stellflaechen })}
              min={0.5}
              max={MAX_STELLFLAECHEN}
              step={0.5}
              decimalScale={1}
              decimalSeparator=","
              allowNegative={false}
              inputMode="decimal"
            />
          </SimpleGrid>
          {reihen > 1 && (
            <SimpleGrid cols={2} spacing="sm">
              {hoehen.slice(1).map((h, i) => (
                <ZahlFeld
                  key={i}
                  label={`Höhe Reihe ${i + 2} (cm)`}
                  value={h}
                  onChange={(neu) =>
                    onChange({ ...wert, reihenHoehen: { ...wert.reihenHoehen, [i + 2]: neu } })
                  }
                  min={0.5}
                  max={MAX_IFCO_HOEHE_CM}
                  step={0.5}
                  decimalScale={1}
                  decimalSeparator=","
                  allowNegative={false}
                  inputMode="decimal"
                />
              ))}
            </SimpleGrid>
          )}
          <Text size="sm" c="dimmed">
            1 Stellfläche = eine IFCO 60×40; 1,5 = eine große und eine kleine (40×30) nebeneinander.
            Die Höhe gilt je Stellfläche.
          </Text>
        </>
      )}
    </Stack>
  );
}
