import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  bezeichnungFuer,
  datumAnzeigen,
  postenAktualisierenSchema,
  type Besetzung,
  type Posten,
} from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { leerePostenWerte, PostenFelder, type PostenWerte } from '../PostenFelder';

/** Username of a holder, falling back to the full name while they have none. */
export const besetzungName = (b: Besetzung) =>
  mitgliedName(b.mitglied);

const postenLink = (id: string) => `/posten/${encodeURIComponent(id)}`;

/** Names of the current holders, each in the color of their status; "–" when nobody holds it. */
function Besetzer({ posten }: Readonly<{ posten: Posten }>) {
  // A member never holds a Posten twice at once, so every current Besetzung is its own line.
  const aktuell = posten.besetzungen.filter((b) => b.aktuell);
  if (aktuell.length === 0) return <Text c="dimmed">Aktuell nicht besetzt</Text>;
  return (
    <Stack gap={2}>
      {aktuell.map((b) => (
        <Text key={b.id}>
          <StatusName status={b.mitglied.status}>{besetzungName(b)}</StatusName> ist seit{' '}
          {datumAnzeigen(b.start)} {bezeichnungFuer(posten, b.mitglied.anrede)}
        </Text>
      ))}
    </Stack>
  );
}

/** Button plus dialog to create a Posten; leads to its detail page afterwards. */
function PostenAnlegen() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [offen, { open, close }] = useDisclosure(false);
  const [werte, setWerte] = useState(leerePostenWerte);
  const [fehler, setFehler] = useState<string | null>(null);

  const anlegen = useMutation({
    mutationFn: async (json: PostenWerte) => unwrap(await api.posten.$post({ json })),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ['posten'] });
      close();
      setWerte(leerePostenWerte);
      navigate(`/posten/${encodeURIComponent(id)}`);
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = postenAktualisierenSchema.safeParse(werte);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    anlegen.mutate(werte);
  };

  return (
    <>
      <Button leftSection={<IconPlus size={18} />} onClick={open}>
        Posten anlegen
      </Button>
      <Modal opened={offen} onClose={close} title="Posten anlegen" fullScreen={false}>
        <form onSubmit={onSubmit}>
          <Stack>
            <PostenFelder werte={werte} onChange={setWerte} fehler={fehler} />
            {anlegen.isError && <Alert color="red">Der Posten konnte nicht angelegt werden.</Alert>}
            <Button type="submit" loading={anlegen.isPending}>
              Anlegen
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}

/** Overview of all Posten as tiles; editors may also see archived ones and create new ones. */
export function PostenPage() {
  const navigate = useNavigate();
  const api = useApi();
  const darfBearbeiten = useAuth().can('posten:bearbeiten');
  const [archiv, setArchiv] = useState(false);
  const mitArchiv = darfBearbeiten && archiv;
  const posten = useQuery({
    queryKey: ['posten', { archiv: mitArchiv }],
    queryFn: async () => unwrap(await api.posten.$get({ query: mitArchiv ? { archiv: '1' } : {} })),
  });

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap">
        <Title order={2}>Posten</Title>
        {darfBearbeiten && <PostenAnlegen />}
      </Group>
      {darfBearbeiten && (
        <Switch
          label="Archivierte Posten anzeigen"
          checked={archiv}
          onChange={(e) => setArchiv(e.currentTarget.checked)}
        />
      )}
      {posten.isPending && <Loader m="md" aria-label="Posten werden geladen" />}
      {posten.isError && <Alert color="red">Die Posten konnten nicht geladen werden.</Alert>}
      {posten.data && posten.data.length === 0 && <Text c="dimmed">Keine Posten vorhanden.</Text>}
      <SimpleGrid cols={1} hiddenFrom="sm">
        {posten.data?.map((p) => {
          return (
            <Paper
              key={p.id}
              withBorder
              p="md"
              component={Link}
              to={`/posten/${encodeURIComponent(p.id)}`}
              style={{
                color: 'inherit',
                textDecoration: 'none',
                opacity: p.archiviert ? 0.6 : 1,
              }}
            >
              <Stack gap="xs">
                <Group gap="xs" justify="space-between" wrap="nowrap" align="flex-start">
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {p.name}
                  </Text>
                  {p.archiviert && (
                    <Badge color="gray" variant="light">
                      Archiviert
                    </Badge>
                  )}
                </Group>
                <Besetzer posten={p} />
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
      {posten.data && posten.data.length > 0 && (
        <Table.ScrollContainer minWidth={760} visibleFrom="sm">
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Posten</Table.Th>
                <Table.Th>Besetzung</Table.Th>
                <Table.Th>Beschreibung</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {posten.data.map((p) => {
                return (
                  <Table.Tr
                    key={p.id}
                    opacity={p.archiviert ? 0.6 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      // The name is a real link (keyboard, middle click); it navigates on its own.
                      if (!(e.target as HTMLElement).closest('a')) navigate(postenLink(p.id));
                    }}
                  >
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        {/* A real link for keyboard use, but plain text; the whole row is clickable. */}
                        <Link
                          to={postenLink(p.id)}
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          <Text component="span" style={{ overflowWrap: 'anywhere' }}>
                            {p.name}
                          </Text>
                        </Link>
                        {p.archiviert && (
                          <Badge color="gray" variant="light">
                            Archiviert
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Besetzer posten={p} />
                    </Table.Td>
                    <Table.Td>
                      <Text lineClamp={2} style={{ whiteSpace: 'pre-line' }}>
                        {p.beschreibung}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
