import { Alert, Button, Group, Loader, Stack, Title } from '@mantine/core';
import { IconBeer, IconSettings } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { TrichterDurchgangListe } from '../TrichterDurchgangListe';
import { TrichterKopf } from '../TrichterKopf';
import { TrichterRangliste } from '../TrichterRangliste';
import { useTrichterUebersicht } from '../trichterDaten';

/** Trichterkönig:in header, ranking and the latest Durchgänge. */
export function TrichterPage() {
  const darfVerwalten = useAuth().can('trichter:verwalten');
  const [jahr, setJahr] = useState('alle');
  // The header comes from the unfiltered overview and never depends on the ranking filter.
  const kopf = useTrichterUebersicht('alle');

  return (
    <Stack maw={900}>
      <Title order={2}>Trichter</Title>
      {kopf.isPending && <Loader m="md" aria-label="Trichter wird geladen" />}
      {kopf.isError && <Alert color="red">Der Trichter konnte nicht geladen werden.</Alert>}
      {kopf.data && (
        <>
          <TrichterKopf uebersicht={kopf.data} />
          <Group gap="sm">
            <Button
              component={Link}
              to="/trichter/neu"
              size="md"
              leftSection={<IconBeer size={20} />}
            >
              Trichtern eintragen
            </Button>
            {darfVerwalten && (
              <Button
                component={Link}
                to="/trichter/verwaltung"
                size="md"
                variant="default"
                leftSection={<IconSettings size={20} />}
              >
                Trichter verwalten
              </Button>
            )}
          </Group>
          <TrichterRangliste
            aktuellesJahr={kopf.data.aktuellesJahr}
            jahre={kopf.data.jahre}
            jahr={jahr}
            onJahr={setJahr}
          />
          <TrichterDurchgangListe />
        </>
      )}
    </Stack>
  );
}
