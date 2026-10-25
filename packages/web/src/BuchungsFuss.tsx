import { Stack, Textarea, TextInput } from '@mantine/core';

/** ISO timestamp of a `datetime-local` value, or null when it is not a valid date. */
export const zeitpunktIso = (lokal: string): string | null => {
  const d = new Date(lokal);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
        error={zeitpunktIso(zeitpunkt) === null ? 'Ungültiger Zeitpunkt.' : undefined}
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
