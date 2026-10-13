import {
  Alert,
  Anchor,
  Badge,
  Button,
  Chip,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  besetzungEingabeSchema,
  datumAnzeigen,
  POSTEN_RECHTE,
  postenAktualisierenSchema,
  type Besetzung,
  type Posten,
  type PostenRecht,
} from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { PERMISSION_LABELS } from '../i18n';
import { PostenFelder, postenWerte, type PostenWerte } from '../PostenFelder';
import { anzeigename, mitgliedLink } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { besetzungName } from './PostenPage';

const zeitraum = (b: Besetzung) =>
  `${datumAnzeigen(b.start)} – ${b.ende ? datumAnzeigen(b.ende) : 'unbefristet'}`;

/** Edit name and description. */
function PostenBearbeiten({ posten }: Readonly<{ posten: Posten }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [offen, { open, close }] = useDisclosure(false);
  const [werte, setWerte] = useState(postenWerte(posten));
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: async (json: PostenWerte) => {
      const res = await api.posten[':id'].$put({ param: { id: posten.id }, json });
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['posten'] });
      close();
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = postenAktualisierenSchema.safeParse(werte);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(werte);
  };

  return (
    <>
      <Button
        variant="default"
        onClick={() => {
          setWerte(postenWerte(posten));
          open();
        }}
      >
        Bearbeiten
      </Button>
      <Modal opened={offen} onClose={close} title="Posten bearbeiten">
        <form onSubmit={onSubmit}>
          <Stack>
            <PostenFelder werte={werte} onChange={setWerte} fehler={fehler} />
            {speichern.isError && <Alert color="red">Das Speichern ist fehlgeschlagen.</Alert>}
            <Button type="submit" loading={speichern.isPending}>
              Speichern
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}

/** Dialog to add a Besetzung or, with `besetzung`, to change or delete one. */
function BesetzungDialog({
  posten,
  besetzung,
  opened,
  onClose,
}: Readonly<{ posten: Posten; besetzung?: Besetzung; opened: boolean; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [sub, setSub] = useState<string | null>(besetzung?.mitgliedSub ?? null);
  const [start, setStart] = useState(besetzung?.start ?? '');
  const [ende, setEnde] = useState(besetzung?.ende ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const mitglieder = useQuery({
    queryKey: ['mitglieder'],
    queryFn: async () => unwrap(await api.mitglieder.$get()),
    enabled: opened,
  });

  const fertig = async () => {
    await qc.invalidateQueries({ queryKey: ['posten'] });
    onClose();
  };
  const speichern = useMutation({
    mutationFn: async (json: { mitgliedSub: string; start: string; ende: string | null }) => {
      const param = { id: posten.id };
      const res = besetzung
        ? await api.posten[':id'].besetzungen[':bid'].$put({
            param: { ...param, bid: besetzung.id },
            json,
          })
        : await api.posten[':id'].besetzungen.$post({ param, json });
      if (res.status === 400) throw new Error('profil');
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: fertig,
  });
  const loeschen = useMutation({
    mutationFn: async () => {
      if (!besetzung) return;
      const res = await api.posten[':id'].besetzungen[':bid'].$delete({
        param: { id: posten.id, bid: besetzung.id },
      });
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: fertig,
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe = { mitgliedSub: sub ?? '', start, ende: ende || null };
    const parsed = besetzungEingabeSchema.safeParse(eingabe);
    if (!sub) return setFehler('Bitte wähle ein Mitglied.');
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    speichern.mutate(eingabe);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={besetzung ? 'Besetzung ändern' : 'Mitglied zuweisen'}
    >
      <form onSubmit={onSubmit}>
        <Stack>
          <Select
            label="Mitglied"
            searchable
            placeholder="Mitglied wählen"
            data={(mitglieder.data ?? []).map((m) => ({ value: m.sub, label: anzeigename(m) }))}
            value={sub}
            onChange={setSub}
            nothingFoundMessage="Kein Mitglied gefunden"
          />
          <TextInput
            type="date"
            label="Start"
            value={start}
            onChange={(e) => setStart(e.currentTarget.value)}
          />
          <TextInput
            type="date"
            label="Ende (optional)"
            value={ende}
            onChange={(e) => setEnde(e.currentTarget.value)}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          {(speichern.isError || loeschen.isError) && (
            <Alert color="red">
              {speichern.error?.message === 'profil'
                ? 'Dieses Mitglied hat noch kein Profil und kann keinem Posten zugewiesen werden.'
                : 'Das Speichern ist fehlgeschlagen.'}
            </Alert>
          )}
          <Button type="submit" loading={speichern.isPending}>
            Speichern
          </Button>
          {besetzung && (
            <Button
              color="red"
              variant="light"
              loading={loeschen.isPending}
              onClick={() => loeschen.mutate()}
            >
              Besetzung löschen
            </Button>
          )}
        </Stack>
      </form>
    </Modal>
  );
}

function BesetzungZeile({
  posten,
  besetzung: b,
  darfBearbeiten,
}: Readonly<{ posten: Posten; besetzung: Besetzung; darfBearbeiten: boolean }>) {
  const [offen, { open, close }] = useDisclosure(false);
  return (
    <Paper withBorder p="sm" opacity={b.aktuell ? 1 : 0.6}>
      <Group justify="space-between" wrap="nowrap" align="center">
        <div style={{ minWidth: 0 }}>
          <Link
            to={mitgliedLink({ username: b.mitglied.username, sub: b.mitgliedSub })}
            style={{ textDecoration: 'none' }}
          >
            <StatusName status={b.mitglied.status}>{besetzungName(b)}</StatusName>
          </Link>
          <Text size="sm" c="dimmed">
            {zeitraum(b)}
          </Text>
        </div>
        {darfBearbeiten && (
          <Button variant="default" onClick={open}>
            Ändern
          </Button>
        )}
      </Group>
      {offen && <BesetzungDialog posten={posten} besetzung={b} opened onClose={close} />}
    </Paper>
  );
}

/** Admins decide which permissions come with the Posten. */
function RechteFeld({ posten }: Readonly<{ posten: Posten }>) {
  const api = useApi();
  const qc = useQueryClient();
  const setzen = useMutation({
    mutationFn: async (rechte: PostenRecht[]) => {
      const res = await api.admin.posten[':id'].rechte.$put({
        param: { id: posten.id },
        json: { rechte },
      });
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posten'] }),
    onError: () =>
      notifications.show({ color: 'red', message: 'Die Rechte konnten nicht gespeichert werden.' }),
  });
  return (
    <Stack gap={4}>
      <Text size="sm" c="dimmed">
        Rechte der aktuellen Besetzung
      </Text>
      <Chip.Group
        multiple
        value={posten.rechte}
        onChange={(v) => !setzen.isPending && setzen.mutate(v as PostenRecht[])}
      >
        <Group gap="xs">
          {POSTEN_RECHTE.map((r) => (
            <Chip key={r} value={r} disabled={setzen.isPending}>
              {PERMISSION_LABELS[r]}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </Stack>
  );
}

/** Detail page of one Posten: description and holders; editors manage them here. */
export function PostenDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const darfBearbeiten = can('posten:bearbeiten');
  const [zuweisen, { open, close }] = useDisclosure(false);
  const posten = useQuery({
    queryKey: ['posten', id],
    queryFn: async () => {
      const res = await api.posten[':id'].$get({ param: { id } });
      if (res.status === 404) return null;
      return unwrap(res);
    },
  });
  const archivieren = useMutation({
    mutationFn: async (archiviert: boolean) => {
      const res = await api.posten[':id'].archiv.$put({ param: { id }, json: { archiviert } });
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posten'] }),
    onError: () =>
      notifications.show({ color: 'red', message: 'Der Posten konnte nicht geändert werden.' }),
  });

  if (posten.isPending) return <Loader m="md" aria-label="Posten wird geladen" />;
  if (posten.isError) return <Alert color="red">Der Posten konnte nicht geladen werden.</Alert>;
  const p = posten.data;

  return (
    <Stack maw={520}>
      <Anchor component={Link} to="/posten" size="sm">
        ← Zurück zur Übersicht
      </Anchor>
      {!p && <Alert color="yellow">Dieser Posten wurde nicht gefunden.</Alert>}
      {p && (
        <>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Title order={2} style={{ overflowWrap: 'anywhere' }}>
              {p.name}
            </Title>
            {p.archiviert && (
              <Badge color="gray" variant="light">
                Archiviert
              </Badge>
            )}
          </Group>
          {p.beschreibung && (
            <Text style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              {p.beschreibung}
            </Text>
          )}
          {darfBearbeiten && (
            <Group>
              <PostenBearbeiten
                key={`${p.name}|${p.beschreibung}|${p.bezeichnungNeutral}`}
                posten={p}
              />
              <Button
                variant="default"
                loading={archivieren.isPending}
                onClick={() => archivieren.mutate(!p.archiviert)}
              >
                {p.archiviert ? 'Reaktivieren' : 'Archivieren'}
              </Button>
            </Group>
          )}
          {p.bezeichnungNeutral && (
            <div>
              <Text size="sm" c="dimmed">
                Bezeichnung der Besetzung
              </Text>
              <Text>
                {p.bezeichnungMaennlich} / {p.bezeichnungWeiblich} / {p.bezeichnungNeutral}
              </Text>
            </div>
          )}
          {can('users:manage') && <RechteFeld posten={p} />}
          <Group justify="space-between">
            <Title order={4}>Besetzung</Title>
            {darfBearbeiten && (
              <Button leftSection={<IconPlus size={18} />} onClick={open}>
                Zuweisen
              </Button>
            )}
          </Group>
          {p.besetzungen.length === 0 && <Text c="dimmed">Noch niemandem zugewiesen.</Text>}
          {p.besetzungen.map((b) => (
            <BesetzungZeile key={b.id} posten={p} besetzung={b} darfBearbeiten={darfBearbeiten} />
          ))}
          {zuweisen && <BesetzungDialog posten={p} opened onClose={close} />}
        </>
      )}
    </Stack>
  );
}
