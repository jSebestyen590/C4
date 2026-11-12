import { Alert, Anchor, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../api';
import { AktionsMenue } from '../AktionsMenue';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { PrivatpartyListe } from '../PrivatpartyAnzeige';
import { PrivatpartyPersonFormular } from '../PrivatpartyPersonFormular';
import { privatpartysInvalidieren, usePrivatpartyPerson } from '../privatpartyDaten';
import { pruefen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/** One person with contact data, notes and their Privatpartys. */
export function PrivatpartyPersonPage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const person = usePrivatpartyPerson(id);
  const [dialog, setDialog] = useState<'bearbeiten' | 'loeschen' | null>(null);

  if (person.isPending) return <Loader m="md" aria-label="Person wird geladen" />;
  if (person.isError) {
    return (
      <Stack>
        <ZurueckLink to="/privatpartys/personen">Personen</ZurueckLink>
        <Alert color="red">Die Person konnte nicht geladen werden.</Alert>
      </Stack>
    );
  }
  const p = person.data;

  return (
    <Stack maw="60rem">
      <ZurueckLink to="/privatpartys/personen">Personen</ZurueckLink>
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Title order={2} style={{ overflowWrap: 'anywhere' }}>
          {p.name}
        </Title>
        <AktionsMenue
          label="Personen-Aktionen"
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconPencil size={18} />,
              onClick: () => setDialog('bearbeiten'),
            },
            {
              text: 'Löschen',
              icon: <IconTrash size={18} />,
              color: 'red',
              trenner: true,
              onClick: () => setDialog('loeschen'),
            },
          ]}
        />
      </Group>
      <Stack gap={4}>
        {p.email && (
          <Text>
            E-Mail:{' '}
            <Anchor href={`mailto:${p.email}`} style={{ overflowWrap: 'anywhere' }}>
              {p.email}
            </Anchor>
          </Text>
        )}
        {p.kontakt && <Text style={{ overflowWrap: 'anywhere' }}>Kontakt: {p.kontakt}</Text>}
        {p.notizen && <Text style={{ whiteSpace: 'pre-wrap' }}>{p.notizen}</Text>}
      </Stack>
      <Group justify="space-between" gap="xs">
        <Title order={3}>Privatpartys</Title>
        <Button
          size="md"
          mih={42}
          component={Link}
          to={`/privatpartys/neu?person=${encodeURIComponent(p.id)}`}
          variant="default"
          leftSection={<IconPlus size={18} />}
        >
          Neue Privatparty
        </Button>
      </Group>
      {p.privatpartys.length === 0 ? (
        <Text c="dimmed">Noch keine Privatpartys.</Text>
      ) : (
        <PrivatpartyListe liste={p.privatpartys} />
      )}
      {dialog === 'bearbeiten' && (
        <PrivatpartyPersonFormular person={p} onClose={() => setDialog(null)} />
      )}
      {dialog === 'loeschen' && (
        <BestaetigenDialog
          titel="Person löschen?"
          bestaetigenText="Löschen"
          onClose={() => setDialog(null)}
          onBestaetigt={async () => {
            await pruefen(await api.privatpartys.personen[':id'].$delete({ param: { id: p.id } }));
            await privatpartysInvalidieren(qc);
            void navigate('/privatpartys/personen', { replace: true });
          }}
        >
          <Text>
            „{p.name}“ wird endgültig gelöscht. Das geht nur, wenn es keine Privatpartys der Person
            gibt.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
