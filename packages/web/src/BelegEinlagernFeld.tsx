import { Anchor, Group, Stack, Switch, Text, TextInput } from '@mantine/core';
import { buchungsZeitpunktFehler, zeitpunktIso } from './BuchungsFuss';
import { HILFE } from './finanzenHilfe';
import { InfoHinweis } from './InfoHinweis';

/** ISO instant -> `datetime-local` value in the local time zone. */
export function isoZuLokal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Switch "Einlagern": the Ware items are booked into the stock with the Beleg. Lagerort and MHD are
 * asked per item row; here only the Zeitpunkt (empty = Belegdatum 12:00, today: now).
 */
export function BelegEinlagernFeld({
  einlagern,
  zeitpunkt,
  hatWare,
  fehler,
  onEinlagern,
  onZeitpunkt,
}: Readonly<{
  einlagern: boolean;
  zeitpunkt: string | null;
  /** The Beleg has at least one Ware item. */
  hatWare: boolean;
  fehler?: string;
  onEinlagern: (an: boolean) => void;
  onZeitpunkt: (iso: string | null) => void;
}>) {
  const lokal = zeitpunkt ? isoZuLokal(zeitpunkt) : '';
  return (
    <Stack gap="xs">
      <Group gap={2}>
        <Switch
          label="Ware beim Buchen einlagern"
          checked={einlagern}
          onChange={(e) => onEinlagern(e.currentTarget.checked)}
        />
        <InfoHinweis feld="Einlagern" text={HILFE.belege.einlagern} />
      </Group>
      {einlagern && !hatWare && (
        <Text size="sm" c="orange.8">
          Zum Einlagern braucht der Beleg einen Posten der Art „Ware (Lager)“.
        </Text>
      )}
      {einlagern && (
        <Group align="flex-end" gap="xs">
          <TextInput
            label="Zeitpunkt der Einlagerung"
            description="Leer: Belegdatum 12:00 Uhr, bei heute jetzt."
            type="datetime-local"
            value={lokal}
            error={(lokal && buchungsZeitpunktFehler(lokal)) || fehler}
            styles={{ input: { minWidth: 0 } }}
            onChange={(e) => {
              const wert = e.currentTarget.value;
              onZeitpunkt(wert ? zeitpunktIso(wert) : null);
            }}
            data-nav=""
          />
          {zeitpunkt && (
            <Anchor component="button" type="button" size="sm" onClick={() => onZeitpunkt(null)}>
              Standard verwenden
            </Anchor>
          )}
        </Group>
      )}
    </Stack>
  );
}
