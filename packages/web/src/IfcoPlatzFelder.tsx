import { NumberInput, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import {
  ifcoPlatzMasseSchema,
  MAX_IFCO_HOEHE_CM,
  MAX_STELLFLAECHEN,
  type IfcoPlatzMasse,
} from '@c4/shared';

/** Input of the Ifco-Lagerplatz fields; the number fields hold '' while empty. */
export interface IfcoPlatzWert {
  aktiv: boolean;
  hoeheCm: number | string;
  stellflaechen: number | string;
}

/** Initial fields; pass the dimensions of an existing Ifco-Lagerplatz to edit it. */
export const ifcoPlatzStandard = (masse?: IfcoPlatzMasse | null): IfcoPlatzWert => ({
  aktiv: masse != null,
  hoeheCm: masse?.hoeheCm ?? '',
  stellflaechen: masse?.stellflaechen ?? 1,
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

/** Switch "Ifco-Lagerplatz" with the height (cm) and the number of Stellflächen. */
export function IfcoPlatzFelder({
  wert,
  onChange,
  label = 'Ifco-Lagerplatz',
  beschreibung = 'Hier stehen Ifcos; Ware lässt sich dort nicht lagern.',
  gesperrt,
}: Readonly<{
  wert: IfcoPlatzWert;
  onChange: (w: IfcoPlatzWert) => void;
  label?: string;
  beschreibung?: string;
  /** Why the switch cannot be turned on (shown instead of the fields); null/undefined = it can. */
  gesperrt?: string | null;
}>) {
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
            <NumberInput
              label="Höhe (cm)"
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
            <NumberInput
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
          <Text size="sm" c="dimmed">
            1 Stellfläche = eine Ifco 60×40; 1,5 = eine große und eine kleine (40×30) nebeneinander.
            Die Höhe gilt je Stellfläche.
          </Text>
        </>
      )}
    </Stack>
  );
}
