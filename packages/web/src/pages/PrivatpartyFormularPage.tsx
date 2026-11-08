import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  PRIVATPARTY_STUFEN,
  privatpartyEingabeSchema,
  type PrivatpartyDetailDto,
  type PrivatpartyEingabe,
  type PrivatpartyStufe,
} from '@c4/shared';
import { useApi } from '../api';
import { DatumFeld } from '../DatumFeld';
import { PRIVATPARTY_STUFE_LABELS } from '../i18n';
import { PrivatpartyPersonFormular } from '../PrivatpartyPersonFormular';
import {
  privatpartyLink,
  privatpartysInvalidieren,
  usePrivatparty,
  usePrivatpartyPersonen,
} from '../privatpartyDaten';
import { fehlerText, pruefen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

interface TerminFeld {
  /** Local key of the row; `id` is the stored one of an existing date. */
  key: number;
  id?: string;
  datum: string;
  beginn: string;
  ende: string;
  stufe: PrivatpartyStufe;
}

let zaehler = 0;
const leererTermin = (): TerminFeld => ({
  key: ++zaehler,
  datum: '',
  beginn: '19:00',
  ende: '02:00',
  stufe: 'bevorzugt',
});

interface FormularStart {
  personId: string;
  anlass: string;
  notizen: string;
  termine: TerminFeld[];
}

function Formular({
  start,
  bearbeiten,
}: Readonly<{ start: FormularStart; bearbeiten?: PrivatpartyDetailDto }>) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const personen = usePrivatpartyPersonen();
  const [personId, setPersonId] = useState<string | null>(start.personId || null);
  const [anlass, setAnlass] = useState(start.anlass);
  const [notizen, setNotizen] = useState(start.notizen);
  const [termine, setTermine] = useState<TerminFeld[]>(start.termine);
  const [neuePerson, setNeuePerson] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const aendern = (key: number, werte: Partial<TerminFeld>) =>
    setTermine((liste) => liste.map((t) => (t.key === key ? { ...t, ...werte } : t)));

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eingabe: PrivatpartyEingabe = {
      personId: personId ?? '',
      anlass,
      notizen,
      termine: termine.map(({ id, datum, beginn, ende, stufe }) => ({
        ...(id && { id }),
        datum,
        beginn,
        ende,
        stufe,
      })),
    };
    const parsed = privatpartyEingabeSchema.safeParse(eingabe);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    setLaeuft(true);
    try {
      let id = bearbeiten?.id ?? '';
      if (bearbeiten) {
        await pruefen(
          await api.privatpartys[':id'].$put({ param: { id }, json: parsed.data as never }),
        );
      } else {
        const res = await api.privatpartys.$post({ json: parsed.data as never });
        await pruefen(res);
        id = ((await res.json()) as { id: string }).id;
      }
      await privatpartysInvalidieren(qc);
      void navigate(privatpartyLink(id), { replace: true });
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <Stack maw="40rem">
        <Group align="flex-end" wrap="nowrap" gap="xs">
          <Select
            size="md"
            label="Person"
            placeholder="Person wählen"
            required
            searchable
            nothingFoundMessage="Keine Person gefunden"
            style={{ flex: 1, minWidth: 0 }}
            data={(personen.data ?? []).map((p) => ({
              value: p.id,
              label: p.email ? `${p.name} (${p.email})` : p.name,
            }))}
            value={personId}
            onChange={setPersonId}
          />
          <Button variant="default" onClick={() => setNeuePerson(true)}>
            Neue Person
          </Button>
        </Group>
        <TextInput
          size="md"
          label="Anlass"
          placeholder="z. B. 30. Geburtstag"
          value={anlass}
          onChange={(e) => setAnlass(e.currentTarget.value)}
        />
        <Stack gap="xs">
          <Text fw={500}>Wunschtermine</Text>
          {termine.map((t, i) => (
            <Paper key={t.key} withBorder p="sm">
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="sm" fw={500}>
                    Termin {i + 1}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size={44}
                    aria-label={`Termin ${i + 1} entfernen`}
                    onClick={() => setTermine((l) => l.filter((x) => x.key !== t.key))}
                  >
                    <IconTrash size={18} />
                  </ActionIcon>
                </Group>
                <DatumFeld
                  size="md"
                  label="Datum"
                  loeschbar={false}
                  value={t.datum}
                  onWert={(datum) => aendern(t.key, { datum })}
                />
                <SimpleGrid cols={2} spacing="xs">
                  <TextInput
                    size="md"
                    type="time"
                    label="Von"
                    value={t.beginn}
                    onChange={(e) => aendern(t.key, { beginn: e.currentTarget.value })}
                  />
                  <TextInput
                    size="md"
                    type="time"
                    label="Bis"
                    description="Vor „Von“: am Folgetag"
                    value={t.ende}
                    onChange={(e) => aendern(t.key, { ende: e.currentTarget.value })}
                  />
                </SimpleGrid>
                <SegmentedControl
                  fullWidth
                  size="md"
                  aria-label="Stufe"
                  value={t.stufe}
                  onChange={(stufe) => aendern(t.key, { stufe: stufe as PrivatpartyStufe })}
                  data={PRIVATPARTY_STUFEN.map((s) => ({
                    value: s,
                    label: PRIVATPARTY_STUFE_LABELS[s],
                  }))}
                />
              </Stack>
            </Paper>
          ))}
          <Button
            variant="default"
            leftSection={<IconPlus size={18} />}
            onClick={() => setTermine((l) => [...l, leererTermin()])}
          >
            Termin hinzufügen
          </Button>
        </Stack>
        <Textarea
          size="md"
          label="Notizen"
          autosize
          minRows={3}
          value={notizen}
          onChange={(e) => setNotizen(e.currentTarget.value)}
        />
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button
            variant="default"
            onClick={() =>
              void navigate(bearbeiten ? privatpartyLink(bearbeiten.id) : '/privatpartys')
            }
          >
            Abbrechen
          </Button>
          <Button type="submit" loading={laeuft}>
            {bearbeiten ? 'Speichern' : 'Anlegen'}
          </Button>
        </Group>
      </Stack>
      {neuePerson && (
        <PrivatpartyPersonFormular
          onClose={() => setNeuePerson(false)}
          onGespeichert={(id) => setPersonId(id)}
        />
      )}
    </form>
  );
}

/** Creates a request (`/privatpartys/neu`, optionally `?person=<id>`) or edits one. */
export function PrivatpartyFormularPage() {
  const { id } = useParams();
  const [suche] = useSearchParams();
  const privatparty = usePrivatparty(id);

  if (id && privatparty.isPending) return <Loader m="md" aria-label="Privatparty wird geladen" />;
  if (id && privatparty.isError) {
    return (
      <Stack>
        <ZurueckLink to="/privatpartys">Privatpartys</ZurueckLink>
        <Alert color="red">Die Privatparty konnte nicht geladen werden.</Alert>
      </Stack>
    );
  }
  const p = privatparty.data;
  const start: FormularStart = p
    ? {
        personId: p.person?.id ?? suche.get('person') ?? '',
        anlass: p.anlass ?? '',
        notizen: p.notizen ?? '',
        termine:
          p.termine.length > 0
            ? p.termine.map((t) => ({ ...t, key: ++zaehler }))
            : [leererTermin()],
      }
    : {
        personId: suche.get('person') ?? '',
        anlass: '',
        notizen: '',
        termine: [leererTermin()],
      };

  return (
    <Stack>
      <ZurueckLink to={p ? privatpartyLink(p.id) : '/privatpartys'}>
        {p ? 'Privatparty' : 'Privatpartys'}
      </ZurueckLink>
      <Title order={2}>{p ? 'Privatparty bearbeiten' : 'Neue Privatparty'}</Title>
      <Formular key={p?.id ?? 'neu'} start={start} bearbeiten={p} />
    </Stack>
  );
}
