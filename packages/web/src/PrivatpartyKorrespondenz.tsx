import {
  Alert,
  Anchor,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowsExchange, IconPaperclip } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { zitatTrennen, type PrivatpartyDetailDto, type PrivatpartyNachrichtDto } from '@c4/shared';
import { useApi } from './api';
import { AktionsMenue } from './AktionsMenue';
import { mitgliedLink, mitgliedName } from './mitglied';
import { privatpartyName } from './PrivatpartyAnzeige';
import { privatpartysInvalidieren, usePrivatpartys } from './privatpartyDaten';
import { StatusName } from './StatusAnzeige';
import { fehlerText, pruefen } from './warenApi';

const zeitFormat = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
});

/** The mail text with quoted parts folded away behind "Zitat anzeigen". */
function MailText({ text }: Readonly<{ text: string }>) {
  const [offen, setOffen] = useState(false);
  const { neu, zitat } = zitatTrennen(text);
  return (
    <Stack gap={4}>
      <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{neu || '…'}</Text>
      {zitat && (
        <>
          <Anchor component="button" type="button" size="sm" onClick={() => setOffen((o) => !o)}>
            {offen ? 'Zitat ausblenden' : 'Zitat anzeigen'}
          </Anchor>
          {offen && (
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {zitat}
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}

/** Moves a message to another open request (e.g. a reply that was not threaded). */
function ZuordnenDialog({
  nachricht,
  aktuelleId,
  onClose,
}: Readonly<{ nachricht: PrivatpartyNachrichtDto; aktuelleId: string; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const offene = usePrivatpartys('offen');
  const [ziel, setZiel] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const senden = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      await pruefen(
        await api.privatpartys.nachrichten[':id'].zuordnen.$post({
          param: { id: nachricht.id },
          json: { privatpartyId: ziel! },
        }),
      );
      await privatpartysInvalidieren(qc);
      notifications.show({ color: 'green', message: 'Die Nachricht wurde zugeordnet.' });
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title="Andere Anfrage zuordnen">
      <Stack>
        <Text size="sm" c="dimmed">
          Die Nachricht „{nachricht.betreff ?? 'ohne Betreff'}“ wandert zu einer anderen offenen
          Anfrage. Ein Eintrag, der nur für diese Mail angelegt wurde, wird gelöscht.
        </Text>
        <Select
          size="md"
          label="Anfrage"
          placeholder="Anfrage wählen"
          searchable
          nothingFoundMessage="Keine offene Anfrage"
          data={(offene.data ?? [])
            .filter((p) => p.id !== aktuelleId)
            .map((p) => ({
              value: p.id,
              label: p.anlass ? `${privatpartyName(p)} · ${p.anlass}` : privatpartyName(p),
            }))}
          value={ziel}
          onChange={setZiel}
        />
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button disabled={!ziel} loading={laeuft} onClick={() => void senden()}>
            Zuordnen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Nachricht({
  n,
  privatpartyId,
}: Readonly<{ n: PrivatpartyNachrichtDto; privatpartyId: string }>) {
  const [zuordnen, setZuordnen] = useState(false);
  const eigene = n.richtung === 'aus';
  return (
    <Paper
      withBorder
      p="sm"
      maw="92%"
      ml={eigene ? 'auto' : undefined}
      bg={eigene ? 'var(--mantine-color-blue-light)' : undefined}
    >
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
          <Stack gap={0} style={{ minWidth: 0 }}>
            {eigene ? (
              <Text size="sm">
                gesendet von{' '}
                {n.gesendetVon ? (
                  <Anchor component={Link} to={mitgliedLink(n.gesendetVon)} underline="never">
                    <StatusName status={n.gesendetVon.status}>
                      {mitgliedName(n.gesendetVon)}
                    </StatusName>
                  </Anchor>
                ) : (
                  'unbekannt'
                )}
              </Text>
            ) : (
              <Text size="sm" fw={700} style={{ overflowWrap: 'anywhere' }}>
                {n.vonName || n.vonAdresse || 'Unbekannt'}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              {zeitFormat.format(new Date(n.zeitpunkt))}
            </Text>
          </Stack>
          <AktionsMenue
            label="Nachrichten-Aktionen"
            aktionen={[
              {
                text: 'Andere Anfrage zuordnen',
                icon: <IconArrowsExchange size={18} />,
                onClick: () => setZuordnen(true),
              },
            ]}
          />
        </Group>
        {n.betreff && (
          <Text fw={500} style={{ overflowWrap: 'anywhere' }}>
            {n.betreff}
          </Text>
        )}
        <MailText text={n.text} />
        {n.anhaenge.length > 0 && (
          <Group gap={4}>
            <IconPaperclip size={16} />
            <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
              {n.anhaenge.join(', ')} (Anhänge werden nicht gespeichert)
            </Text>
          </Group>
        )}
      </Stack>
      {zuordnen && (
        <ZuordnenDialog
          nachricht={n}
          aktuelleId={privatpartyId}
          onClose={() => setZuordnen(false)}
        />
      )}
    </Paper>
  );
}

function Antwortfeld({ p }: Readonly<{ p: PrivatpartyDetailDto }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  if (!p.mailEingerichtet) return <Alert color="gray">Party-Mail ist nicht eingerichtet.</Alert>;
  const senden = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      await pruefen(
        await api.privatpartys[':id'].nachrichten.$post({ param: { id: p.id }, json: { text } }),
      );
      setText('');
      await privatpartysInvalidieren(qc);
      notifications.show({ color: 'green', message: 'Die Antwort wurde gesendet.' });
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <Stack gap="xs">
      <Textarea
        size="md"
        label="Antworten"
        autosize
        minRows={3}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      {fehler && <Alert color="red">{fehler}</Alert>}
      <Group>
        <Button size="md" loading={laeuft} disabled={!text.trim()} onClick={() => void senden()}>
          Senden
        </Button>
      </Group>
    </Stack>
  );
}

/** The mail thread of a request (oldest first) with the reply box. */
export function PrivatpartyKorrespondenz({ p }: Readonly<{ p: PrivatpartyDetailDto }>) {
  if (p.nachrichten.length === 0 && !p.mailEingerichtet) return null;
  return (
    <Stack gap="xs">
      <Title order={3}>Korrespondenz</Title>
      {p.nachrichten.length === 0 && <Text c="dimmed">Noch keine Nachrichten.</Text>}
      {p.nachrichten.map((n) => (
        <Nachricht key={n.id} n={n} privatpartyId={p.id} />
      ))}
      <Antwortfeld p={p} />
    </Stack>
  );
}
