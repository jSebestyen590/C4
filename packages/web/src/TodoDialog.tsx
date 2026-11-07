import { Alert, Button, Group, Modal, Stack, Textarea, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { TODO_NOTIZEN_MAX, TODO_TITEL_MAX, todoEingabeSchema, type Todo } from '@c4/shared';
import { useApi } from './api';
import { DatumFeld } from './DatumFeld';
import { todosInvalidieren } from './todoDaten';
import { fehlerText, pruefen } from './warenApi';

/** Creates a Todo for oneself or edits `todo` (title, deadline, notes). */
export function TodoDialog({ todo, onClose }: Readonly<{ todo?: Todo; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [titel, setTitel] = useState(todo?.titel ?? '');
  const [faelligAm, setFaelligAm] = useState(todo?.faelligAm ?? '');
  const [notizen, setNotizen] = useState(todo?.notizen ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!faelligAm) return setFehler('Bitte gib eine Deadline an.');
    const json = { titel, notizen: notizen.trim() === '' ? null : notizen, faelligAm };
    const parsed = todoEingabeSchema.safeParse(json);
    if (!parsed.success) {
      return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    }
    setFehler(null);
    setLaeuft(true);
    try {
      if (todo) {
        await pruefen(await api.me.todos[':id'].$put({ param: { id: todo.id }, json }));
      } else {
        await pruefen(await api.me.todos.$post({ json }));
      }
      await todosInvalidieren(qc);
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={todo ? 'Todo bearbeiten' : 'Todo anlegen'}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          <TextInput
            size="md"
            label="Titel"
            required
            maxLength={TODO_TITEL_MAX}
            value={titel}
            onChange={(e) => setTitel(e.currentTarget.value)}
          />
          <DatumFeld
            size="md"
            label="Deadline"
            required
            loeschbar={false}
            value={faelligAm}
            onWert={setFaelligAm}
          />
          <Textarea
            size="md"
            label="Notizen"
            autosize
            minRows={3}
            maxLength={TODO_NOTIZEN_MAX}
            value={notizen}
            onChange={(e) => setNotizen(e.currentTarget.value)}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" size="md" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" size="md" loading={laeuft}>
              {todo ? 'Speichern' : 'Anlegen'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
