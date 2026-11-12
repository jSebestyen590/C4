import { Alert, Button, Checkbox, Group, Modal, Radio, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { heuteBerlin, tagNachher, type PrivatpartyDetailDto } from '@c4/shared';
import { useApi } from './api';
import { DatumFeld } from './DatumFeld';
import { StufeBadge } from './PrivatpartyAnzeige';
import { privatpartysInvalidieren, wunschTerminText } from './privatpartyDaten';
import { useVorlagen } from './kalenderDaten';
import { fehlerText, pruefen } from './warenApi';

function VorlagenSelect({
  wert,
  onWert,
}: Readonly<{ wert: string | null; onWert: (id: string | null) => void }>) {
  const vorlagen = useVorlagen();
  return (
    <Select
      size="md"
      label="Vorlage"
      description="Zeiten, Schichten und Dienste des Events kommen aus der Vorlage."
      placeholder={vorlagen.isPending ? 'Vorlagen werden geladen' : 'Vorlage wählen'}
      required
      searchable
      nothingFoundMessage="Keine Vorlage gefunden"
      data={(vorlagen.data ?? []).map((v) => ({ value: v.id, label: v.titel }))}
      value={wert}
      onChange={onWert}
    />
  );
}

/** Shared frame of the two dialogs: runs `ausfuehren`, shows its error and closes on success. */
function Dialog({
  titel,
  senden,
  gesperrt,
  onClose,
  ausfuehren,
  children,
}: Readonly<{
  titel: string;
  senden: string;
  gesperrt: boolean;
  onClose: () => void;
  ausfuehren: () => Promise<void>;
  children: React.ReactNode;
}>) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const absenden = async () => {
    setFehler(null);
    setLaeuft(true);
    try {
      await ausfuehren();
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={titel}>
      <Stack>
        {children}
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button size="md" mih={42} variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            size="md"
            mih={42}
            loading={laeuft}
            disabled={gesperrt}
            onClick={() => void absenden()}
          >
            {senden}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Accepts a wish date: picks the date and the Vorlage, the event is created at the wished times. */
export function ZusageDialog({
  privatparty,
  onClose,
}: Readonly<{ privatparty: PrivatpartyDetailDto; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [terminId, setTerminId] = useState<string | null>(
    privatparty.termine.find((t) => t.stufe === 'bevorzugt')?.id ??
      privatparty.termine[0]?.id ??
      null,
  );
  const [vorlageId, setVorlageId] = useState<string | null>(null);
  return (
    <Dialog
      titel="Privatparty zusagen"
      senden="Zusagen"
      gesperrt={!terminId || !vorlageId}
      onClose={onClose}
      ausfuehren={async () => {
        await pruefen(
          await api.privatpartys[':id'].zusage.$post({
            param: { id: privatparty.id },
            json: { terminId: terminId!, vorlageId: vorlageId! },
          }),
        );
        await privatpartysInvalidieren(qc);
        notifications.show({ color: 'green', message: 'Zugesagt. Das Event wurde angelegt.' });
      }}
    >
      <Radio.Group label="Termin" value={terminId} onChange={setTerminId}>
        <Stack gap="xs" mt="xs">
          {privatparty.termine.map((t) => (
            <Radio
              key={t.id}
              value={t.id}
              size="md"
              label={
                <Group gap="xs">
                  <Text span>{wunschTerminText(t)}</Text>
                  <StufeBadge stufe={t.stufe} />
                </Group>
              }
            />
          ))}
        </Stack>
      </Radio.Group>
      <VorlagenSelect wert={vorlageId} onWert={setVorlageId} />
    </Dialog>
  );
}

/** Builds a scheduling poll over the wish dates, so the club members can say who is available. */
export function UmfrageDialog({
  privatparty,
  onClose,
}: Readonly<{ privatparty: PrivatpartyDetailDto; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [vorlageId, setVorlageId] = useState<string | null>(null);
  const [endetAm, setEndetAm] = useState(tagNachher(heuteBerlin(), 7));
  const [pflicht, setPflicht] = useState(false);
  return (
    <Dialog
      titel="Umfrage erstellen"
      senden="Umfrage erstellen"
      gesperrt={!vorlageId || !endetAm}
      onClose={onClose}
      ausfuehren={async () => {
        await pruefen(
          await api.privatpartys[':id'].umfrage.$post({
            param: { id: privatparty.id },
            json: { vorlageId: vorlageId!, endetAm, pflicht },
          }),
        );
        await privatpartysInvalidieren(qc);
        notifications.show({ color: 'green', message: 'Die Umfrage wurde erstellt.' });
      }}
    >
      <Text size="sm" c="dimmed">
        Alle Mitglieder bekommen eine Terminumfrage mit den Wunschterminen. Nach dem Ende legst du
        das Event aus dem gewählten Termin an.
      </Text>
      <VorlagenSelect wert={vorlageId} onWert={setVorlageId} />
      <DatumFeld
        size="md"
        label="Die Umfrage endet am"
        required
        loeschbar={false}
        value={endetAm}
        onWert={setEndetAm}
      />
      <Checkbox
        size="md"
        label="Abstimmen ist Pflicht"
        description="Alle müssen abstimmen und werden erinnert. Sonst können sie abstimmen."
        checked={pflicht}
        onChange={(e) => setPflicht(e.currentTarget.checked)}
      />
    </Dialog>
  );
}
