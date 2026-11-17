import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Chip,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
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
  rechteZeitraum,
  tagVorher,
  POSTEN_RECHTE,
  postenAktualisierenSchema,
  type Besetzung,
  type Posten,
  type PostenRecht,
} from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { PERMISSION_LABELS } from '../i18n';
import { DatumFeld } from '../DatumFeld';
import { PostenFelder, postenWerte, type PostenWerte } from '../PostenFelder';
import { mitgliedLink } from '../mitglied';
import { mitgliedOptionen } from '../organisator';
import { StatusName } from '../StatusAnzeige';
import { besetzungName } from './PostenPage';
import { mitgliederKeys, postenKeys } from '../queryKeys';

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
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (json: PostenWerte) => {
      const res = await api.posten[':id'].$put({ param: { id: posten.id }, json });
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: postenKeys.alle });
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
  const [ablosung, setAblosung] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  // A new Besetzung may take over open-ended ones that are active today.
  const offene = besetzung ? [] : posten.besetzungen.filter((b) => b.aktuell && b.ende === null);
  const mitglieder = useQuery({
    queryKey: mitgliederKeys.alle,
    queryFn: async () => unwrap(await api.mitglieder.$get()),
    enabled: opened,
  });

  const fertig = async () => {
    await qc.invalidateQueries({ queryKey: postenKeys.alle });
    onClose();
  };
  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (json: {
      mitgliedSub: string;
      start: string;
      ende: string | null;
      ablosung: string[];
    }) => {
      const param = { id: posten.id };
      const res = besetzung
        ? await api.posten[':id'].besetzungen[':bid'].$put({
            param: { ...param, bid: besetzung.id },
            json,
          })
        : await api.posten[':id'].besetzungen.$post({ param, json });
      if (res.status === 400) throw new Error('profil');
      if (res.status === 409) throw new Error('ueberschneidung');
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: fertig,
  });
  const loeschen = useMutation({
    meta: { eigeneFehlermeldung: true },
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
    const eingabe = {
      mitgliedSub: sub ?? '',
      start,
      ende: ende || null,
    };
    const parsed = besetzungEingabeSchema.safeParse(eingabe);
    if (!sub) return setFehler('Bitte wähle ein Mitglied.');
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    const zuBeenden = offene.filter((b) => ablosung.includes(b.id));
    if (zuBeenden.some((b) => b.start >= start))
      return setFehler('Der Start muss nach dem Start der bisherigen Besetzung liegen.');
    setFehler(null);
    speichern.mutate({ ...eingabe, ablosung: zuBeenden.map((b) => b.id) });
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
            data={mitgliedOptionen(mitglieder.data ?? [])}
            value={sub}
            onChange={setSub}
            nothingFoundMessage="Kein Mitglied gefunden"
          />
          <DatumFeld
            label="Start"
            value={start}
            onWert={(neu) => {
              setStart(neu);
              // Setting the start always proposes the end of that year; it can be changed afterwards.
              if (/^\d{4}-\d{2}-\d{2}$/.test(neu)) setEnde(`${neu.slice(0, 4)}-12-31`);
            }}
          />
          <DatumFeld label="Ende (optional)" value={ende} onWert={setEnde} />
          {offene.length > 0 && (
            <Checkbox.Group
              label="Übernimmt die Person den Posten?"
              description={
                start
                  ? `Die gewählten Besetzungen enden am ${datumAnzeigen(tagVorher(start))}.`
                  : 'Die gewählten Besetzungen enden am Tag vor dem Start.'
              }
              value={ablosung}
              onChange={setAblosung}
            >
              <Stack gap="xs" mt="xs">
                {offene.map((b) => (
                  <Checkbox
                    key={b.id}
                    value={b.id}
                    label={
                      <>
                        Von <StatusName status={b.mitglied.status}>{besetzungName(b)}</StatusName>{' '}
                        (seit {datumAnzeigen(b.start)}) übernehmen
                      </>
                    }
                  />
                ))}
              </Stack>
            </Checkbox.Group>
          )}
          {fehler && <Alert color="red">{fehler}</Alert>}
          {(speichern.isError || loeschen.isError) && (
            <Alert color="red">
              {speichern.error?.message === 'profil'
                ? 'Dieses Mitglied hat noch kein Profil und kann keinem Posten zugewiesen werden.'
                : speichern.error?.message === 'ueberschneidung'
                  ? 'Diese Person hat den Posten in diesem Zeitraum bereits. Die Zeiträume dürfen sich nicht überschneiden.'
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
          <Text size="sm" c="dimmed">
            Rechte: {datumAnzeigen(rechteZeitraum(b.start, b.ende).von)} –{' '}
            {rechteZeitraum(b.start, b.ende).bis
              ? datumAnzeigen(rechteZeitraum(b.start, b.ende).bis!)
              : 'unbefristet'}
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
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (rechte: PostenRecht[]) => {
      const res = await api.admin.posten[':id'].rechte.$put({
        param: { id: posten.id },
        json: { rechte },
      });
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: postenKeys.alle }),
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
    queryKey: postenKeys.eins(id),
    queryFn: async () => {
      const res = await api.posten[':id'].$get({ param: { id } });
      if (res.status === 404) return null;
      return unwrap(res);
    },
  });
  const archivieren = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (archiviert: boolean) => {
      const res = await api.posten[':id'].archiv.$put({ param: { id }, json: { archiviert } });
      if (!res.ok) throw new Error('fehler');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: postenKeys.alle }),
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
