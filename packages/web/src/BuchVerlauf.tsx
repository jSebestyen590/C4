import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { type BuchEintragDto } from '@c4/shared';
import { Saldo, saldoText } from './buchDaten';
import { formatDatumZeit } from './datum';
import { mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';

/** What an entry consists of, e.g. `3 Striche à 1,50 €`, `Bar 2,00 €`, `Abzahlung 5,00 €`. */
export function eintragTeile(e: BuchEintragDto): string[] {
  const teile: string[] = [];
  if (e.striche !== 0) {
    const einheit = Math.abs(e.striche) === 1 ? 'Strich' : 'Striche';
    teile.push(
      `${e.striche.toLocaleString('de-DE')} ${einheit} à ${saldoText(e.strichwertCent).replace('−', '')}`,
    );
  }
  if (e.barCent !== 0) teile.push(`Bar ${saldoText(e.barCent)}`);
  if (e.abzahlungCent !== 0) teile.push(`Abzahlung ${saldoText(e.abzahlungCent)}`);
  return teile;
}

/**
 * The entries of a page as cards, newest first. With `onStorno` (Finanzer:in) every entry that can
 * still be reversed offers a button; with `mitAutor` the person who entered it is named.
 */
export function BuchVerlauf({
  eintraege,
  onStorno,
  mitAutor = false,
}: Readonly<{
  eintraege: readonly BuchEintragDto[];
  onStorno?: (e: BuchEintragDto) => void;
  mitAutor?: boolean;
}>) {
  if (eintraege.length === 0) return <Text c="dimmed">Noch keine Einträge.</Text>;
  return (
    <Stack gap="xs">
      {eintraege.map((e) => (
        <Paper key={e.id} withBorder p="sm" radius="md" opacity={e.storniert ? 0.65 : 1}>
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
              <Text size="sm" c="dimmed">
                {formatDatumZeit(e.erstelltAm)}
              </Text>
              <Group gap="xs" wrap="nowrap">
                {e.stornoVon && (
                  <Badge color="gray" variant="light">
                    Storno
                  </Badge>
                )}
                {e.storniert && (
                  <Badge color="gray" variant="light">
                    Storniert
                  </Badge>
                )}
                <Text fw={700} td={e.storniert ? 'line-through' : undefined}>
                  <Saldo cent={e.betragCent} />
                </Text>
              </Group>
            </Group>
            <Text style={{ overflowWrap: 'anywhere' }}>{eintragTeile(e).join(' · ') || '–'}</Text>
            {e.text && (
              <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                Begründung: {e.text}
              </Text>
            )}
            {mitAutor && e.erstelltVon && (
              <Text size="sm" c="dimmed">
                von{' '}
                <StatusName status={e.erstelltVon.status}>{mitgliedName(e.erstelltVon)}</StatusName>
              </Text>
            )}
            {onStorno && !e.storniert && !e.stornoVon && (
              <Group>
                <Button variant="subtle" color="red" size="md" onClick={() => onStorno(e)}>
                  Stornieren
                </Button>
              </Group>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
