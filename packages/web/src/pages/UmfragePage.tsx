import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Progress,
  Radio,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconPlayerStop, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  moeglicheAntworten,
  type UmfrageDetailDto,
  type UmfrageFrageDto,
  type UmfragePerson,
} from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { useApi } from '../api';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { UMFRAGE_ERGEBNISSE_LABELS } from '../i18n';
import { PersonLink, umfragenInvalidieren, useUmfrage } from '../umfrageDaten';
import { fehlerText, pruefen } from '../warenApi';
import { laufzeitText, UmfrageBadges } from './UmfragenPage';

/** The own free text answer, as a pseudo option in the inputs. */
const FREITEXT = '__freitext__';

interface Antwort {
  optionIds: string[];
  freitext: string | null;
}

/** Names separated by commas, each as a linked member mention. */
function Personen({ personen }: Readonly<{ personen: UmfragePerson[] }>) {
  return (
    <Text size="sm">
      {personen.map((p, i) => (
        <Fragment key={p.sub}>
          {i > 0 && ', '}
          <PersonLink person={p} />
        </Fragment>
      ))}
    </Text>
  );
}

/** Inputs for one question: radio buttons for a single answer, check boxes for several. */
function FrageEingabe({
  frage,
  nr,
  antwort,
  onChange,
  gesperrt,
}: Readonly<{
  frage: UmfrageFrageDto;
  nr: number;
  antwort: Antwort;
  onChange: (a: Antwort) => void;
  gesperrt: boolean;
}>) {
  const max = frage.maxAntworten ?? moeglicheAntworten(frage);
  const gewaehlt = [...antwort.optionIds, ...(antwort.freitext !== null ? [FREITEXT] : [])];
  const setzen = (werte: string[]) =>
    onChange({
      optionIds: werte.filter((w) => w !== FREITEXT),
      freitext: werte.includes(FREITEXT) ? (antwort.freitext ?? '') : null,
    });
  const optionen = [
    ...frage.optionen.map((o) => ({ value: o.id, label: o.text })),
    ...(frage.freitext ? [{ value: FREITEXT, label: 'Eigene Antwort' }] : []),
  ];
  const label = `${nr}. ${frage.text}`;
  const hinweis =
    max === 1
      ? undefined
      : frage.maxAntworten === null
        ? 'Mehrere Antworten möglich.'
        : `Bis zu ${max} Antworten.`;

  return (
    <Stack gap="xs">
      {max === 1 ? (
        <Radio.Group
          label={label}
          value={gewaehlt[0] ?? null}
          onChange={(v) => setzen([v])}
          styles={{ label: { fontSize: 'var(--mantine-font-size-md)', fontWeight: 600 } }}
        >
          <Stack gap="sm" mt="xs">
            {optionen.map((o) => (
              <Radio key={o.value} value={o.value} label={o.label} size="md" disabled={gesperrt} />
            ))}
          </Stack>
        </Radio.Group>
      ) : (
        <Checkbox.Group
          label={label}
          description={hinweis}
          value={gewaehlt}
          onChange={setzen}
          styles={{ label: { fontSize: 'var(--mantine-font-size-md)', fontWeight: 600 } }}
        >
          <Stack gap="sm" mt="xs">
            {optionen.map((o) => (
              <Checkbox
                key={o.value}
                value={o.value}
                label={o.label}
                size="md"
                // Once the maximum is reached only picked answers stay changeable.
                disabled={gesperrt || (gewaehlt.length >= max && !gewaehlt.includes(o.value))}
              />
            ))}
          </Stack>
        </Checkbox.Group>
      )}
      {antwort.freitext !== null && (
        <Textarea
          size="md"
          aria-label={`Eigene Antwort zu Frage ${nr}`}
          placeholder="Deine Antwort"
          autosize
          minRows={2}
          disabled={gesperrt}
          value={antwort.freitext}
          onChange={(e) => onChange({ ...antwort, freitext: e.currentTarget.value })}
        />
      )}
    </Stack>
  );
}

/** Counts per answer as bars, with names in public polls and the free texts. */
function FrageErgebnis({
  frage,
  nr,
  abgaben,
}: Readonly<{ frage: UmfrageFrageDto; nr: number; abgaben: number }>) {
  return (
    <Stack gap="xs">
      <Text fw={600}>
        {nr}. {frage.text}
      </Text>
      {frage.optionen.map((o) => {
        const anzahl = o.stimmen ?? 0;
        return (
          <Stack key={o.id} gap={4}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text style={{ overflowWrap: 'anywhere' }}>{o.text}</Text>
              <Text c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {anzahl} {anzahl === 1 ? 'Stimme' : 'Stimmen'}
              </Text>
            </Group>
            <Progress value={abgaben === 0 ? 0 : (anzahl / abgaben) * 100} size="lg" />
            {o.personen && o.personen.length > 0 && <Personen personen={o.personen} />}
          </Stack>
        );
      })}
      {frage.freitexte && frage.freitexte.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            Eigene Antworten
          </Text>
          {frage.freitexte.map((f, i) => (
            <Paper key={i} withBorder p="xs">
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {f.text}
              </Text>
              {f.person && (
                <Text size="xs" c="dimmed">
                  <PersonLink person={f.person} />
                </Text>
              )}
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** Who voted and who did not yet (public polls only). */
function Teilnehmende({ u }: Readonly<{ u: UmfrageDetailDto }>) {
  if (!u.teilnehmende) return null;
  const gruppen = [
    {
      titel: 'Noch offen (Pflicht)',
      liste: u.teilnehmende.filter((t) => !t.abgestimmt && t.rolle === 'pflicht'),
    },
    {
      titel: 'Noch offen (optional)',
      liste: u.teilnehmende.filter((t) => !t.abgestimmt && t.rolle === 'optional'),
    },
    { titel: 'Abgestimmt', liste: u.teilnehmende.filter((t) => t.abgestimmt) },
  ].filter((g) => g.liste.length > 0);
  return (
    <Stack gap="xs">
      <Title order={3}>Teilnahme</Title>
      {gruppen.map((g) => (
        <Stack key={g.titel} gap={2}>
          <Text size="sm" c="dimmed">
            {g.titel} ({g.liste.length})
          </Text>
          <Personen personen={g.liste.map((t) => t.person)} />
        </Stack>
      ))}
    </Stack>
  );
}

function Abstimmung({ u }: Readonly<{ u: UmfrageDetailDto }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [antworten, setAntworten] = useState<Record<string, Antwort>>(() =>
    Object.fromEntries(
      u.meineAntworten.map((a) => [a.frageId, { optionIds: a.optionIds, freitext: a.freitext }]),
    ),
  );
  const [bearbeiten, setBearbeiten] = useState(!u.abgestimmt);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const absenden = async () => {
    setFehler(null);
    setLaeuft(true);
    try {
      await pruefen(
        await api.umfragen[':id'].stimme.$put({
          param: { id: u.id },
          json: {
            antworten: u.fragen.map((f) => ({
              frageId: f.id,
              optionIds: antworten[f.id]?.optionIds ?? [],
              freitext: antworten[f.id]?.freitext ?? null,
            })),
          },
        }),
      );
      notifications.show({ color: 'green', message: 'Deine Stimme ist gespeichert.' });
      setBearbeiten(false);
      await umfragenInvalidieren(qc);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Paper withBorder p="md">
      <Stack>
        <Title order={3}>{u.abgestimmt ? 'Deine Stimme' : 'Abstimmen'}</Title>
        {u.erneutNoetig && (
          <Alert color="orange">
            Die Umfrage wurde geändert, deine Stimme zählt so nicht mehr. Bitte stimme erneut ab.
          </Alert>
        )}
        {u.anonym && (
          <Text size="sm" c="dimmed">
            Anonym: Niemand sieht, wer abgestimmt hat oder was.
          </Text>
        )}
        {u.fragen.map((f, i) => (
          <FrageEingabe
            key={f.id}
            frage={f}
            nr={i + 1}
            antwort={antworten[f.id] ?? { optionIds: [], freitext: null }}
            onChange={(a) => setAntworten((alt) => ({ ...alt, [f.id]: a }))}
            gesperrt={!bearbeiten}
          />
        ))}
        {fehler && <Alert color="red">{fehler}</Alert>}
        {bearbeiten ? (
          <Button size="md" loading={laeuft} onClick={() => void absenden()}>
            {u.abgestimmt ? 'Stimme speichern' : 'Abstimmen'}
          </Button>
        ) : (
          <Button size="md" variant="default" onClick={() => setBearbeiten(true)}>
            Stimme ändern
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

/** One poll: voting, results, who voted, and the creator's actions. */
export function UmfragePage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const umfrage = useUmfrage(id);
  const [dialog, setDialog] = useState<'beenden' | 'loeschen' | null>(null);

  const zurueck = (
    <Anchor component={Link} to="/umfragen" size="sm">
      ← Zurück zur Liste
    </Anchor>
  );
  if (umfrage.isPending) return <Loader m="md" aria-label="Umfrage wird geladen" />;
  if (umfrage.isError) {
    return (
      <Stack maw={720}>
        {zurueck}
        <Alert color="red">Die Umfrage konnte nicht geladen werden.</Alert>
      </Stack>
    );
  }
  const u = umfrage.data;
  const darfAbstimmen = u.laeuft && u.meinKreis !== null;

  return (
    <Stack maw={720}>
      {zurueck}
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Title order={2} style={{ overflowWrap: 'anywhere' }}>
          {u.titel}
        </Title>
        <AktionsMenue
          label="Aktionen zur Umfrage"
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconPencil size={18} />,
              onClick: () => navigate(`/umfragen/${u.id}/bearbeiten`),
              sichtbar: u.darfBearbeiten && u.laeuft,
            },
            {
              text: 'Vorzeitig beenden',
              icon: <IconPlayerStop size={18} />,
              onClick: () => setDialog('beenden'),
              sichtbar: u.darfBearbeiten && u.laeuft,
            },
            {
              text: 'Löschen',
              icon: <IconTrash size={18} />,
              color: 'red',
              onClick: () => setDialog('loeschen'),
              sichtbar: u.darfLoeschen,
              trenner: true,
            },
          ]}
        />
      </Group>
      <UmfrageBadges u={u} />
      <Text size="sm" c="dimmed">
        {u.ersteller && (
          <>
            Erstellt von <PersonLink person={u.ersteller} /> ·{' '}
          </>
        )}
        {laufzeitText(u)} · {u.abgaben} von {u.kreisGroesse} abgestimmt
      </Text>
      {u.beschreibung && <Text style={{ whiteSpace: 'pre-wrap' }}>{u.beschreibung}</Text>}

      {darfAbstimmen && <Abstimmung key={`${u.id}-${u.abgestimmt}-${u.erneutNoetig}`} u={u} />}

      <Title order={3} mt="md">
        Ergebnisse
      </Title>
      {u.ergebnisseSichtbar ? (
        u.fragen.map((f, i) => (
          <FrageErgebnis key={f.id} frage={f} nr={i + 1} abgaben={u.abgaben} />
        ))
      ) : (
        <Text c="dimmed">
          {u.ergebnisse === 'nach_abstimmung'
            ? 'Die Ergebnisse siehst du, sobald du abgestimmt hast.'
            : 'Die Ergebnisse sind sichtbar, sobald die Umfrage beendet ist.'}
        </Text>
      )}
      {u.darfBearbeiten && u.laeuft && (
        <Text size="xs" c="dimmed">
          Sichtbarkeit für andere: {UMFRAGE_ERGEBNISSE_LABELS[u.ergebnisse].titel}
        </Text>
      )}

      <Teilnehmende u={u} />

      {dialog === 'beenden' && (
        <BestaetigenDialog
          titel="Umfrage beenden"
          bestaetigenText="Beenden"
          onClose={() => setDialog(null)}
          onBestaetigt={async () => {
            await pruefen(await api.umfragen[':id'].beenden.$post({ param: { id: u.id } }));
            await umfragenInvalidieren(qc);
          }}
        >
          <Text>
            „{u.titel}“ wird jetzt beendet. Danach kann niemand mehr abstimmen, und alle sehen die
            Ergebnisse.
          </Text>
        </BestaetigenDialog>
      )}
      {dialog === 'loeschen' && (
        <BestaetigenDialog
          titel="Umfrage löschen"
          bestaetigenText="Löschen"
          onClose={() => setDialog(null)}
          onBestaetigt={async () => {
            await pruefen(await api.umfragen[':id'].$delete({ param: { id: u.id } }));
            navigate('/umfragen');
            await umfragenInvalidieren(qc);
          }}
        >
          <Text>
            „{u.titel}“ wird mit allen Stimmen endgültig gelöscht. Das lässt sich nicht rückgängig
            machen.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
