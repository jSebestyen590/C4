import { Alert, Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { datumAnzeigen } from '@c4/shared';
import { ZeilenUebersicht, type UebersichtZeile } from './ZeilenUebersicht';

/**
 * Summary shown before a booking is made: date, text, every line, plus plausibility warnings that
 * must be ticked off (they do not block). Mount it only while it should be open.
 */
export function BuchungsZusammenfassung({
  datum,
  text,
  zeilen,
  extra,
  warnungen,
  laeuft,
  fehler,
  onBuchen,
  onClose,
}: Readonly<{
  datum: string;
  text: string;
  zeilen: readonly UebersichtZeile[];
  /** Shown below the lines, e.g. the denominations. */
  extra?: ReactNode;
  warnungen: readonly string[];
  laeuft: boolean;
  fehler: string | null;
  onBuchen: () => void;
  onClose: () => void;
}>) {
  const [bestaetigt, setBestaetigt] = useState<ReadonlySet<string>>(new Set());
  const offen = warnungen.some((w) => !bestaetigt.has(w));
  const umschalten = (w: string, an: boolean) =>
    setBestaetigt((alt) => {
      const neu = new Set(alt);
      if (an) neu.add(w);
      else neu.delete(w);
      return neu;
    });
  return (
    <Modal
      opened
      onClose={laeuft ? () => undefined : onClose}
      title="Buchung prüfen"
      size="lg"
      closeOnClickOutside={!laeuft}
    >
      <Stack>
        <Stack gap={2}>
          <Text>
            <Text span fw={600}>
              Datum:
            </Text>{' '}
            {datumAnzeigen(datum)}
          </Text>
          <Text style={{ overflowWrap: 'anywhere' }}>
            <Text span fw={600}>
              Text:
            </Text>{' '}
            {text}
          </Text>
        </Stack>
        <ZeilenUebersicht zeilen={zeilen} />
        {extra}
        {warnungen.length > 0 && (
          <Alert color="orange" title="Bitte prüfen">
            <Stack gap="xs">
              {warnungen.map((w) => (
                <Checkbox
                  key={w}
                  label={`${w} Das ist richtig so.`}
                  checked={bestaetigt.has(w)}
                  onChange={(e) => umschalten(w, e.currentTarget.checked)}
                />
              ))}
            </Stack>
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Gebuchtes lässt sich nicht mehr ändern, nur per Storno rückgängig machen.
        </Text>
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose} disabled={laeuft}>
            Zurück zur Eingabe
          </Button>
          <Button onClick={onBuchen} loading={laeuft} disabled={offen || laeuft}>
            Jetzt buchen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
