import { Alert, Button, Group, Modal, Select, Stack } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  heuteBerlin,
  MITGLIED_STATI,
  type Anrede,
  type MitgliedStatus,
  type StatusEintrag,
} from '@c4/shared';
import { useApi } from './api';
import { DatumFeld } from './DatumFeld';
import { historieAktualisieren } from './historieDaten';
import { labelFuer, MITGLIED_STATUS_LABELS } from './i18n';
import { fehlerText, pruefen } from './warenApi';

/** Adds an entry to the status history, or edits `eintrag` (admins only). */
export function StatusEintragModal({
  sub,
  anrede,
  eintrag,
  onClose,
}: Readonly<{ sub: string; anrede: Anrede; eintrag?: StatusEintrag; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const mobil = useMediaQuery('(max-width: 48em)');
  const [status, setStatus] = useState<MitgliedStatus>(eintrag?.status ?? 'mitglied');
  const [ab, setAb] = useState(eintrag?.ab ?? '');
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      const json = { status, ab };
      if (eintrag)
        await pruefen(
          await api.admin.mitglieder[':sub']['status-verlauf'][':id'].$put({
            param: { sub, id: eintrag.id },
            json,
          }),
        );
      else
        await pruefen(
          await api.admin.mitglieder[':sub']['status-verlauf'].$post({ param: { sub }, json }),
        );
    },
    onSuccess: async () => {
      await historieAktualisieren(qc);
      notifications.show({ color: 'green', message: 'Der Eintrag wurde gespeichert.' });
      onClose();
    },
    onError: (e) => setFehler(fehlerText(e, 'Der Eintrag konnte nicht gespeichert werden.')),
  });

  return (
    <Modal
      opened
      onClose={onClose}
      title={eintrag ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'}
      fullScreen={mobil}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          // Rendered inside the profile form's React tree (portal): keep the submit from reaching it.
          e.stopPropagation();
          setFehler(null);
          if (!ab) return setFehler('Bitte gib ein Datum an.');
          speichern.mutate();
        }}
      >
        <Stack>
          <Select
            label="Status"
            data={MITGLIED_STATI.map((s) => ({
              value: s,
              label: labelFuer(MITGLIED_STATUS_LABELS, s, anrede),
            }))}
            value={status}
            allowDeselect={false}
            onChange={(v) => v && setStatus(v as MitgliedStatus)}
          />
          <DatumFeld
            label="Ab"
            required
            loeschbar={false}
            max={heuteBerlin()}
            value={ab}
            onWert={setAb}
          />
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={speichern.isPending}>
              Speichern
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
