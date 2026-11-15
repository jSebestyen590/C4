import { Stack, Textarea, TextInput } from '@mantine/core';
import { inZukunft } from '@c4/shared';
import { jetztLokal } from './inventurDaten';

/** ISO timestamp of a `datetime-local` value, or null when it is not a valid date. */
export const zeitpunktIso = (lokal: string): string | null => {
  const d = new Date(lokal);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Error text for a booking `datetime-local` value (invalid or in the future), or undefined when fine. */
export const buchungsZeitpunktFehler = (lokal: string): string | undefined => {
  if (zeitpunktIso(lokal) === null) return 'Ungültiger Zeitpunkt.';
  return inZukunft(lokal) ? 'Der Zeitpunkt darf nicht in der Zukunft liegen.' : undefined;
};

/** Zeitpunkt and optional Kommentar below the tables of Einlagerung, Entnahme and Umlagerung. */
export function BuchungsFuss({
  zeitpunkt,
  kommentar,
  onZeitpunkt,
  onKommentar,
}: Readonly<{
  zeitpunkt: string;
  kommentar: string;
  onZeitpunkt: (wert: string) => void;
  onKommentar: (wert: string) => void;
}>) {
  return (
    <Stack gap="sm" py="md">
      <TextInput
        label="Zeitpunkt"
        type="datetime-local"
        value={zeitpunkt}
        max={jetztLokal()}
        error={buchungsZeitpunktFehler(zeitpunkt)}
        styles={{ input: { fontSize: 16, minWidth: 0 } }}
        onChange={(e) => onZeitpunkt(e.currentTarget.value)}
      />
      <Textarea
        label="Kommentar (optional)"
        autosize
        minRows={2}
        maxLength={500}
        value={kommentar}
        styles={{ input: { fontSize: 16 } }}
        onChange={(e) => onKommentar(e.currentTarget.value)}
      />
    </Stack>
  );
}
