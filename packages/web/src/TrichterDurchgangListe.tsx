import { Alert, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { datumAnzeigen, datumBerlin, zeitBerlin, type DurchgangDto } from '@c4/shared';
import { useApi } from './api';
import { AktionsMenue } from './AktionsMenue';
import { BestaetigenDialog } from './BestaetigenDialog';
import { jePersonMl, literAnzeigen } from './trichterAnzeige';
import { TrichterPerson, trichterInvalidieren, useDurchgaenge } from './trichterDaten';
import { pruefen } from './warenApi';

const zeitAnzeigen = (iso: string) => `${datumAnzeigen(datumBerlin(iso))} ${zeitBerlin(iso)} Uhr`;

function DurchgangKarte({
  d,
  onLoeschen,
}: Readonly<{ d: DurchgangDto; onLoeschen: (d: DurchgangDto) => void }>) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text fw={600}>{zeitAnzeigen(d.zeitpunkt)}</Text>
          <AktionsMenue
            label="Aktionen"
            aktionen={[
              {
                text: 'Löschen',
                icon: <IconTrash size={18} />,
                color: 'red',
                sichtbar: d.darfLoeschen,
                onClick: () => onLoeschen(d),
              },
            ]}
          />
        </Group>
        <Text>
          {d.trichter.name} · {literAnzeigen(d.volumenMl)}
          <Text span c="dimmed">
            {' '}
            (je Person {literAnzeigen(jePersonMl(d.volumenMl, d.teilnehmende.length))})
          </Text>
        </Text>
        <Text>
          {d.teilnehmende.map((m, i) => (
            <span key={m.sub}>
              {i > 0 && ', '}
              <TrichterPerson mitglied={m} />
            </span>
          ))}
        </Text>
        <Text size="sm" c="dimmed">
          eingetragen von <TrichterPerson mitglied={d.eingetragenVon} />
        </Text>
      </Stack>
    </Paper>
  );
}

/** The latest Durchgänge, newest first, with "Mehr laden". */
export function TrichterDurchgangListe() {
  const api = useApi();
  const qc = useQueryClient();
  const liste = useDurchgaenge();
  const [loeschen, setLoeschen] = useState<DurchgangDto | null>(null);
  const durchgaenge = liste.data?.pages.flatMap((s) => s.durchgaenge) ?? [];

  return (
    <Stack>
      <Title order={3}>Letzte Durchgänge</Title>
      {liste.isPending && <Loader m="md" aria-label="Durchgänge werden geladen" />}
      {liste.isError && <Alert color="red">Die Durchgänge konnten nicht geladen werden.</Alert>}
      {liste.data && durchgaenge.length === 0 && (
        <Text c="dimmed">Noch keine Durchgänge eingetragen.</Text>
      )}
      <Stack gap="sm" maw={700}>
        {durchgaenge.map((d) => (
          <DurchgangKarte key={d.id} d={d} onLoeschen={setLoeschen} />
        ))}
      </Stack>
      {liste.hasNextPage && (
        <Button
          variant="default"
          loading={liste.isFetchingNextPage}
          onClick={() => void liste.fetchNextPage()}
          maw={700}
        >
          Mehr laden
        </Button>
      )}
      {loeschen && (
        <BestaetigenDialog
          titel="Durchgang löschen"
          bestaetigenText="Löschen"
          onClose={() => setLoeschen(null)}
          onBestaetigt={async () => {
            await pruefen(
              await api.trichter.durchgaenge[':id'].$delete({ param: { id: loeschen.id } }),
            );
            await trichterInvalidieren(qc);
            notifications.show({ color: 'green', message: 'Der Durchgang wurde gelöscht.' });
          }}
        >
          <Text>
            Willst du den Durchgang mit {loeschen.trichter.name} vom{' '}
            {zeitAnzeigen(loeschen.zeitpunkt)} wirklich löschen?
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
