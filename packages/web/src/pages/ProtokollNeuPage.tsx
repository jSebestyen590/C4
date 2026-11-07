import { Alert, Anchor, Button, Loader, Paper, Radio, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { tagAnzeigen } from '../kalenderZeit';
import { protokollLink, useProtokollAnlegen, useProtokollSitzungen } from '../protokollDaten';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/** Pick the Sitzung to write minutes for, then create the protocol and open it. */
export function ProtokollNeuPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const sitzungen = useProtokollSitzungen();
  const anlegen = useProtokollAnlegen();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  // The API lists the newest Sitzung first: preselect it until the user picks another.
  const aktiv = gewaehlt ?? sitzungen.data?.[0]?.id ?? null;

  const absenden = async () => {
    if (!aktiv) return;
    try {
      const id = await anlegen.mutateAsync(aktiv);
      void navigate(protokollLink(id), { replace: true });
    } catch {
      // Shown below via anlegen.error.
    }
  };

  return (
    <Stack maw="40rem">
      <ZurueckLink to="/protokolle">Protokolle</ZurueckLink>
      <Title order={2}>Neues Protokoll</Title>
      {sitzungen.isPending && <Loader m="md" aria-label="Sitzungen werden geladen" />}
      {sitzungen.isError && <Alert color="red">Die Sitzungen konnten nicht geladen werden.</Alert>}
      {sitzungen.data && sitzungen.data.length === 0 && (
        <Alert color="yellow">
          <Text>
            Es gibt keine Sitzung ohne Protokoll. Eine Sitzung ist ein Event, dessen Kategorie in
            der Kalender-Einrichtung als „Sitzung mit Protokoll“ markiert ist.
          </Text>
          {can('kalender:einrichten') && (
            <Anchor component={Link} to="/kalender/einrichtung">
              Zur Kalender-Einrichtung
            </Anchor>
          )}
        </Alert>
      )}
      {sitzungen.data && sitzungen.data.length > 0 && (
        <>
          <Text c="dimmed">Für welche Sitzung schreibst du das Protokoll?</Text>
          <Radio.Group value={aktiv} onChange={setGewaehlt} aria-label="Sitzung">
            <Stack gap="sm">
              {sitzungen.data.map((s) => (
                <Paper
                  key={s.id}
                  withBorder
                  p="md"
                  onClick={() => setGewaehlt(s.id)}
                  style={{
                    cursor: 'pointer',
                    borderColor: aktiv === s.id ? 'var(--mantine-primary-color-filled)' : undefined,
                  }}
                >
                  <Radio
                    value={s.id}
                    size="md"
                    label={
                      <Stack gap={0}>
                        <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
                          {s.titel}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {tagAnzeigen(s.beginn)}
                          {s.kategorie ? ` · ${s.kategorie.name}` : ''}
                        </Text>
                      </Stack>
                    }
                    styles={{ body: { alignItems: 'center' }, labelWrapper: { flex: 1 } }}
                  />
                </Paper>
              ))}
            </Stack>
          </Radio.Group>
          {anlegen.isError && <Alert color="red">{fehlerText(anlegen.error)}</Alert>}
          <Button
            size="md"
            disabled={!aktiv}
            loading={anlegen.isPending}
            onClick={() => void absenden()}
          >
            Protokoll anlegen
          </Button>
        </>
      )}
    </Stack>
  );
}
