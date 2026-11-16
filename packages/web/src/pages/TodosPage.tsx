import {
  Alert,
  Anchor,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { datumAnzeigen, heuteBerlin, tagNachher, todoFaelligKurz, type Todo } from '@c4/shared';
import { useApi } from '../api';
import { AktionsMenue } from '../AktionsMenue';
import { useAuth } from '../auth';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { TodoDialog } from '../TodoDialog';
import { todosInvalidieren, useMeineTodos, useTodoErledigt } from '../todoDaten';
import { pruefen } from '../warenApi';

/** Colour of the deadline of an open Todo: red once overdue, orange within two days. */
export function todoFristFarbe(faelligAm: string, heute: string): 'red' | 'orange' | undefined {
  if (faelligAm < heute) return 'red';
  if (faelligAm <= tagNachher(heute, 2)) return 'orange';
  return undefined;
}

function Fortschritt({ todo }: Readonly<{ todo: Todo }>) {
  const n = todo.zustaendige.length;
  if (n <= 1) return null;
  if (todo.modus === 'gemeinsam') {
    const von = todo.zustaendige.find((z) => z.sub === todo.erledigtVon);
    return (
      <Text size="sm" c="dimmed">
        {todo.erledigtAm && von ? (
          <>
            Erledigt von{' '}
            <Anchor component={Link} to={mitgliedLink(von)} underline="never">
              <StatusName status={von.status}>{mitgliedName(von)}</StatusName>
            </Anchor>
          </>
        ) : (
          `Gemeinsam für ${n} Personen: Wer zuerst abhakt, erledigt es für alle.`
        )}
      </Text>
    );
  }
  const fertig = todo.zustaendige.filter((z) => z.erledigtAm !== null).length;
  return (
    <Text size="sm" c="dimmed">
      {fertig} von {n} erledigt
    </Text>
  );
}

/** One Todo as a card: tick box, title, deadline, notes, source and progress. */
export function TodoKarte({
  todo,
  heute,
  protokollLink,
  onErledigt,
  onBearbeiten,
  onLoeschen,
}: Readonly<{
  todo: Todo;
  heute: string;
  /** Links the source protocol (the member may read protocols). */
  protokollLink: boolean;
  onErledigt: (erledigt: boolean) => void;
  onBearbeiten: () => void;
  onLoeschen: () => void;
}>) {
  const checkId = useId();
  const farbe = todo.ichErledigt ? undefined : todoFristFarbe(todo.faelligAm, heute);
  const ueberfaellig = !todo.ichErledigt && todo.faelligAm < heute;
  return (
    <Paper withBorder p="sm" data-testid="todo-karte">
      <Group wrap="nowrap" align="flex-start" gap="xs">
        {/* The label makes the whole 44px square a touch target. */}
        <Center component="label" htmlFor={checkId} w={42} h={42} style={{ flexShrink: 0 }}>
          <Checkbox
            id={checkId}
            size="lg"
            checked={todo.ichErledigt}
            onChange={(e) => onErledigt(e.currentTarget.checked)}
            aria-label={`${todo.titel} ${todo.ichErledigt ? 'wieder öffnen' : 'abhaken'}`}
          />
        </Center>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }} pt={10}>
          <Text
            fw={600}
            td={todo.ichErledigt ? 'line-through' : undefined}
            c={todo.ichErledigt ? 'dimmed' : undefined}
            style={{ overflowWrap: 'anywhere' }}
          >
            {todo.titel}
          </Text>
          <Text size="sm" c={farbe ?? 'dimmed'} fw={farbe ? 600 : undefined}>
            Fällig {todoFaelligKurz(todo.faelligAm)}
            {ueberfaellig && ' (überfällig)'}
          </Text>
          {todo.notizen && (
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {todo.notizen}
            </Text>
          )}
          {todo.quelle && (
            <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
              Aus Protokoll:{' '}
              {protokollLink ? (
                <Anchor
                  component={Link}
                  to={`/protokolle/${encodeURIComponent(todo.quelle.protokollId)}`}
                >
                  {todo.quelle.eventName} {datumAnzeigen(todo.quelle.datum)}
                </Anchor>
              ) : (
                `${todo.quelle.eventName} ${datumAnzeigen(todo.quelle.datum)}`
              )}
            </Text>
          )}
          <Fortschritt todo={todo} />
        </Stack>
        <AktionsMenue
          label={`Aktionen für ${todo.titel}`}
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconPencil size={18} />,
              onClick: onBearbeiten,
              sichtbar: todo.bearbeitbar,
            },
            {
              text: 'Löschen',
              icon: <IconTrash size={18} />,
              color: 'red',
              onClick: onLoeschen,
              sichtbar: todo.bearbeitbar,
            },
          ]}
        />
      </Group>
    </Paper>
  );
}

/** The signed-in member's Todos: open ones by deadline, done ones behind a button. */
export function TodosPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const todos = useMeineTodos();
  const erledigt = useTodoErledigt();
  const [anlegen, setAnlegen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Todo | null>(null);
  const [loeschen, setLoeschen] = useState<Todo | null>(null);
  const [erledigteZeigen, setErledigteZeigen] = useState(false);

  const heute = heuteBerlin();
  const daten = todos.data ?? [];
  const offen = daten.filter((t) => !t.ichErledigt);
  const fertig = daten.filter((t) => t.ichErledigt);
  const protokollLink = can('protokolle:lesen');

  const karte = (t: Todo) => (
    <TodoKarte
      key={t.id}
      todo={t}
      heute={heute}
      protokollLink={protokollLink}
      onErledigt={(e) => erledigt.mutate({ id: t.id, erledigt: e })}
      onBearbeiten={() => setBearbeiten(t)}
      onLoeschen={() => setLoeschen(t)}
    />
  );

  return (
    <Stack maw={{ base: '100%', md: 720 }}>
      <Group justify="space-between" wrap="nowrap">
        <Title order={2}>Todos</Title>
        <Button size="md" leftSection={<IconPlus size={18} />} onClick={() => setAnlegen(true)}>
          Todo anlegen
        </Button>
      </Group>
      {todos.isPending && <Loader m="md" aria-label="Todos werden geladen" />}
      {todos.isError && <Alert color="red">Die Todos konnten nicht geladen werden.</Alert>}
      {todos.data && (
        <>
          <Title order={3}>Offen</Title>
          {offen.length === 0 ? <Text c="dimmed">Keine offenen Todos.</Text> : offen.map(karte)}
          {fertig.length > 0 && (
            <>
              <Button
                variant="subtle"
                size="md"
                leftSection={
                  erledigteZeigen ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />
                }
                onClick={() => setErledigteZeigen((z) => !z)}
                style={{ alignSelf: 'flex-start' }}
              >
                {erledigteZeigen ? 'Erledigte ausblenden' : 'Erledigte anzeigen'} ({fertig.length})
              </Button>
              {erledigteZeigen && (
                <>
                  <Title order={3}>Erledigt</Title>
                  {fertig.map(karte)}
                </>
              )}
            </>
          )}
        </>
      )}
      {anlegen && <TodoDialog onClose={() => setAnlegen(false)} />}
      {bearbeiten && <TodoDialog todo={bearbeiten} onClose={() => setBearbeiten(null)} />}
      {loeschen && (
        <BestaetigenDialog
          titel="Todo löschen"
          bestaetigenText="Löschen"
          onClose={() => setLoeschen(null)}
          onBestaetigt={async () => {
            await pruefen(await api.me.todos[':id'].$delete({ param: { id: loeschen.id } }));
            await todosInvalidieren(qc);
          }}
        >
          <Text>
            „{loeschen.titel}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
