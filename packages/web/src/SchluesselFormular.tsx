import { Alert, Button, Group, Modal, Stack, Textarea, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { schluesselEingabeSchema, type SchluesselDto } from '@c4/shared';
import { useApi } from './api';
import { schluesselInvalidieren, schluesselLink } from './schluesselDaten';
import { fehlerText, pruefen } from './warenApi';

/**
 * Creates a key (then opens its page, where the first holder is entered via an Übergabe) or edits
 * name and description of `schluessel`.
 */
export function SchluesselFormular({
  schluessel,
  onClose,
}: Readonly<{ schluessel?: SchluesselDto; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(schluessel?.name ?? '');
  const [beschreibung, setBeschreibung] = useState(schluessel?.beschreibung ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = schluesselEingabeSchema.safeParse({ name, beschreibung });
    if (!parsed.success) {
      return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    }
    setFehler(null);
    setLaeuft(true);
    try {
      const json = { name, beschreibung };
      if (schluessel) {
        await pruefen(await api.schluessel[':id'].$put({ param: { id: schluessel.id }, json }));
      } else {
        const res = await api.schluessel.$post({ json });
        await pruefen(res);
        const { id } = (await res.json()) as { id: string };
        navigate(schluesselLink(id));
      }
      await schluesselInvalidieren(qc);
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={schluessel ? 'Schlüssel bearbeiten' : 'Schlüssel anlegen'}
    >
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          <TextInput
            size="md"
            label="Name"
            placeholder="z. B. Haupttür 1"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Textarea
            size="md"
            label="Beschreibung"
            placeholder="z. B. welche Türen er öffnet"
            autosize
            minRows={2}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.currentTarget.value)}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={laeuft}>
              {schluessel ? 'Speichern' : 'Anlegen'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
