import { Alert, Button, Group, Modal, Stack, Textarea, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { privatpartyPersonEingabeSchema, type PrivatpartyPersonDto } from '@c4/shared';
import { useApi } from './api';
import { privatpartysInvalidieren } from './privatpartyDaten';
import { fehlerText, pruefen } from './warenApi';

/** Creates a person (then `onGespeichert` gets the new id) or edits `person`. */
export function PrivatpartyPersonFormular({
  person,
  onClose,
  onGespeichert,
  vorgabe,
}: Readonly<{
  person?: Pick<PrivatpartyPersonDto, 'id' | 'name' | 'email' | 'kontakt' | 'notizen'>;
  onClose: () => void;
  onGespeichert?: (id: string) => void;
  /** Prefill of a new person, e.g. from the sender of a mail. */
  vorgabe?: { name?: string | null; email?: string | null };
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(person?.name ?? vorgabe?.name ?? '');
  const [email, setEmail] = useState(person?.email ?? vorgabe?.email ?? '');
  const [kontakt, setKontakt] = useState(person?.kontakt ?? '');
  const [notizen, setNotizen] = useState(person?.notizen ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const json = { name, email, kontakt, notizen };
    const parsed = privatpartyPersonEingabeSchema.safeParse(json);
    if (!parsed.success) return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    setLaeuft(true);
    try {
      let id = person?.id ?? '';
      if (person) {
        await pruefen(await api.privatpartys.personen[':id'].$put({ param: { id }, json }));
      } else {
        const res = await api.privatpartys.personen.$post({ json });
        await pruefen(res);
        id = ((await res.json()) as { id: string }).id;
      }
      await privatpartysInvalidieren(qc);
      onGespeichert?.(id);
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={person ? 'Person bearbeiten' : 'Neue Person'}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          <TextInput
            size="md"
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <TextInput
            size="md"
            label="E-Mail"
            type="email"
            description="Hierhin gehen Antworten, bis eine Mail von der Person eingegangen ist."
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <TextInput
            size="md"
            label="Weitere Kontaktdaten"
            placeholder="z. B. Telefon, Instagram"
            value={kontakt}
            onChange={(e) => setKontakt(e.currentTarget.value)}
          />
          <Textarea
            size="md"
            label="Notizen"
            autosize
            minRows={2}
            value={notizen}
            onChange={(e) => setNotizen(e.currentTarget.value)}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button size="md" mih={42} variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button size="md" mih={42} type="submit" loading={laeuft}>
              {person ? 'Speichern' : 'Anlegen'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
