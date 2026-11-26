import { Alert, Button, Group, Modal, Stack, TextInput, Textarea } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { RechnungsempfaengerDto } from '@c4/shared';
import { useApi } from './api';
import { jsonOderFehler } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { FeldLabel } from './InfoHinweis';
import { fehlerText } from './warenApi';

/**
 * Creates an external Rechnungsempfänger (name, multi line address, optional email and USt-IdNr.) or,
 * with `empfaenger`, edits one. `onGespeichert` gets the id (the Rechnung form selects it).
 */
export function RechnungsempfaengerDialog({
  empfaenger,
  name = '',
  onGespeichert,
  onClose,
}: Readonly<{
  empfaenger?: RechnungsempfaengerDto;
  /** Preset name of a new recipient (the typed search text). */
  name?: string;
  onGespeichert: (id: string) => void;
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [werte, setWerte] = useState({
    name: empfaenger?.name ?? name,
    anschrift: empfaenger?.anschrift ?? '',
    email: empfaenger?.email ?? '',
    ustId: empfaenger?.ustId ?? '',
  });
  const [versucht, setVersucht] = useState(false);
  const setze = (feld: keyof typeof werte, wert: string) =>
    setWerte((w) => ({ ...w, [feld]: wert }));

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      const json = {
        name: werte.name.trim(),
        anschrift: werte.anschrift.trim(),
        email: werte.email.trim() || null,
        ustId: werte.ustId.trim() || null,
      };
      if (empfaenger) {
        await jsonOderFehler(
          await api.finanzen.rechnungsempfaenger[':id'].$put({
            param: { id: empfaenger.id },
            json,
          }),
        );
        return empfaenger.id;
      }
      return (
        await jsonOderFehler<{ id: string }>(await api.finanzen.rechnungsempfaenger.$post({ json }))
      ).id;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ['finanzen', 'rechnungsempfaenger'] });
      onGespeichert(id);
      onClose();
    },
  });
  const fehlt =
    werte.name.trim() === ''
      ? 'Bitte gib einen Namen ein.'
      : werte.anschrift.trim() === ''
        ? 'Bitte gib die Anschrift an.'
        : null;

  return (
    <Modal
      opened
      onClose={speichern.isPending ? () => undefined : onClose}
      title={empfaenger ? 'Empfänger bearbeiten' : 'Neuer Empfänger'}
      size="lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setVersucht(true);
          if (!fehlt) speichern.mutate();
        }}
      >
        <Stack>
          <TextInput
            label="Name"
            maxLength={120}
            value={werte.name}
            onChange={(e) => setze('name', e.currentTarget.value)}
            error={versucht && werte.name.trim() === '' ? 'Bitte gib einen Namen ein.' : undefined}
            data-autofocus
          />
          <Textarea
            label={<FeldLabel text="Anschrift" hilfe={HILFE.rechnungen.anschrift} />}
            description="Mehrzeilig, so wie sie auf der Rechnung stehen soll."
            autosize
            minRows={3}
            maxLength={300}
            value={werte.anschrift}
            onChange={(e) => setze('anschrift', e.currentTarget.value)}
            error={
              versucht && werte.anschrift.trim() === '' ? 'Bitte gib die Anschrift an.' : undefined
            }
          />
          <TextInput
            label="E-Mail (optional)"
            type="email"
            maxLength={200}
            value={werte.email}
            onChange={(e) => setze('email', e.currentTarget.value)}
          />
          <TextInput
            label="USt-IdNr. (optional)"
            maxLength={40}
            value={werte.ustId}
            onChange={(e) => setze('ustId', e.currentTarget.value)}
          />
          {speichern.isError && (
            <Alert color="red">
              {fehlerText(speichern.error, 'Das Speichern ist fehlgeschlagen.')}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={speichern.isPending}>
              Abbrechen
            </Button>
            <Button type="submit" loading={speichern.isPending}>
              {empfaenger ? 'Speichern' : 'Anlegen'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
