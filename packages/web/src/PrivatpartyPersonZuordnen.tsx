import { Alert, Button, Group, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PrivatpartyDetailDto } from '@c4/shared';
import { PrivatpartyPersonFormular } from './PrivatpartyPersonFormular';
import { usePrivatpartyPersonen } from './privatpartyDaten';

/**
 * Shown for an entry created from a mail that has no person yet: the sender, and picking or creating
 * the person. Then the form opens to add the Wunschtermine.
 */
export function PrivatpartyPersonZuordnen({ p }: Readonly<{ p: PrivatpartyDetailDto }>) {
  const navigate = useNavigate();
  const personen = usePrivatpartyPersonen();
  const absender = p.nachrichten.find((n) => n.richtung === 'ein');
  const [wahl, setWahl] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  const vorschlag = (personen.data ?? []).find(
    (x) => x.email && p.mailAdresse && x.email.toLowerCase() === p.mailAdresse.toLowerCase(),
  );
  const weiter = (id: string) =>
    void navigate(`/privatpartys/${p.id}/bearbeiten?person=${encodeURIComponent(id)}`);
  return (
    <Stack gap="xs">
      <Title order={3}>Person zuordnen</Title>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text>
            Anfrage von{' '}
            <Text span fw={700} style={{ overflowWrap: 'anywhere' }}>
              {absender?.vonName || p.mailAdresse || 'Unbekannt'}
            </Text>
            {absender?.vonName && p.mailAdresse && (
              <Text span c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                {' '}
                ({p.mailAdresse})
              </Text>
            )}
          </Text>
          {vorschlag && (
            <Alert color="blue">
              Die Adresse gehört zu <b>{vorschlag.name}</b>.{' '}
              <Button size="md" mih={44} variant="light" onClick={() => weiter(vorschlag.id)}>
                Diese Person nehmen
              </Button>
            </Alert>
          )}
          <Select
            size="md"
            label="Vorhandene Person"
            placeholder="Person wählen"
            searchable
            nothingFoundMessage="Keine Person gefunden"
            data={(personen.data ?? []).map((x) => ({
              value: x.id,
              label: x.email ? `${x.name} (${x.email})` : x.name,
            }))}
            value={wahl}
            onChange={setWahl}
          />
          <Group grow preventGrowOverflow={false}>
            <Button size="md" mih={44} disabled={!wahl} onClick={() => wahl && weiter(wahl)}>
              Zuordnen
            </Button>
            <Button size="md" mih={44} variant="default" onClick={() => setNeu(true)}>
              Neue Person
            </Button>
          </Group>
        </Stack>
      </Paper>
      {neu && (
        <PrivatpartyPersonFormular
          vorgabe={{ name: absender?.vonName, email: p.mailAdresse }}
          onClose={() => setNeu(false)}
          onGespeichert={weiter}
        />
      )}
    </Stack>
  );
}
