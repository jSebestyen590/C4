import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { centAnzeigen, type BuchEintragDto } from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { schluesselFuer } from '../buchungFormular';
import { BUCH_KEY, BuchInhaber, Saldo, saldoText, useBuchSeite } from '../buchDaten';
import { BuchVerlauf, eintragTeile } from '../BuchVerlauf';
import { jsonOderFehler } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { fehlerText, pruefen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/** Reverses one entry: the reason is required, the idempotency key survives double clicks. */
function StornoDialog({
  eintrag,
  onClose,
}: Readonly<{ eintrag: BuchEintragDto; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);
  const storno = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      schluessel.current = schluesselFuer(schluessel.current, text.trim(), () =>
        crypto.randomUUID(),
      );
      return jsonOderFehler<{ id: string }>(
        await api.buch.eintraege[':id'].storno.$post({
          param: { id: eintrag.id },
          json: { idempotenzSchluessel: schluessel.current.schluessel, text: text.trim() },
        }),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BUCH_KEY });
      notifications.show({ color: 'green', message: 'Der Eintrag wurde storniert.' });
      onClose();
    },
  });
  const gueltig = text.trim() !== '';
  return (
    <Modal opened onClose={storno.isPending ? () => undefined : onClose} title="Eintrag stornieren">
      <Stack>
        <Text>
          {eintragTeile(eintrag).join(' · ')} (Wirkung auf den Saldo:{' '}
          {saldoText(eintrag.betragCent)})
        </Text>
        <Text size="sm" c="dimmed">
          Das Storno ist ein neuer Eintrag mit umgekehrten Werten. Der ursprüngliche Eintrag bleibt
          sichtbar.
        </Text>
        <Textarea
          size="md"
          autosize
          minRows={2}
          maxLength={500}
          label={<FeldLabel text="Begründung" hilfe={HILFE.buch.storno} />}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          data-autofocus
        />
        {storno.isError && <Alert color="red">{fehlerText(storno.error)}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose} disabled={storno.isPending}>
            Abbrechen
          </Button>
          <Button
            color="red"
            loading={storno.isPending}
            disabled={!gueltig}
            onClick={() => storno.mutate()}
          >
            Jetzt stornieren
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** One page: header with balance and tarif, Verlauf with Storno, archiving. */
export function FinanzenBuchSeitePage() {
  const { id = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const seite = useBuchSeite(id);
  const [stornoZiel, setStornoZiel] = useState<BuchEintragDto | null>(null);
  const [archivieren, setArchivieren] = useState(false);
  const [saldoBestaetigt, setSaldoBestaetigt] = useState(false);
  const s = seite.data;
  const darfBuchen = can('finanzen:buchen');

  return (
    <Stack maw={900}>
      <ZurueckLink to="/finanzen/buch">Buch</ZurueckLink>
      {seite.isPending && <Loader m="md" aria-label="Seite wird geladen" />}
      {seite.isError && <Alert color="red">Die Seite konnte nicht geladen werden.</Alert>}
      {s && (
        <>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Title order={2}>Seite {s.nummer}</Title>
              <Text>
                <BuchInhaber seite={s} />
              </Text>
            </Stack>
            {s.archiviert && <Badge color="gray">Archiviert</Badge>}
            {s.ueberzug && <Badge color="red">Überzogen</Badge>}
          </Group>
          <Paper withBorder p="md" radius="md">
            <Group gap="xl" align="flex-end">
              <Stack gap={0}>
                <Group gap={2}>
                  <Text size="sm" c="dimmed">
                    Saldo
                  </Text>
                  <InfoHinweis feld="Saldo" text={HILFE.buch.saldo} />
                </Group>
                <Text fz={32} lh={1.1}>
                  <Saldo cent={s.saldoCent} />
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="sm" c="dimmed">
                  Tarif heute
                </Text>
                <Text>
                  {s.tarif
                    ? `Strich ${centAnzeigen(s.tarif.strichwertCent)} · Überzug bis ${centAnzeigen(s.tarif.maxUeberzugCent)}`
                    : 'Kein Tarif hinterlegt'}
                </Text>
              </Stack>
            </Group>
          </Paper>
          {darfBuchen && !s.archiviert && (
            <Group>
              <Button
                variant="default"
                onClick={() => {
                  setSaldoBestaetigt(false);
                  setArchivieren(true);
                }}
              >
                Seite archivieren
              </Button>
              <InfoHinweis feld="Archivieren" text={HILFE.buch.archivieren} />
            </Group>
          )}
          <Title order={3}>Verlauf</Title>
          <BuchVerlauf
            eintraege={s.verlauf}
            mitAutor
            onStorno={darfBuchen ? setStornoZiel : undefined}
          />
        </>
      )}
      {stornoZiel && <StornoDialog eintrag={stornoZiel} onClose={() => setStornoZiel(null)} />}
      {archivieren && s && (
        <BestaetigenDialog
          titel="Seite archivieren"
          bestaetigenText="Archivieren"
          gesperrt={s.saldoCent !== 0 && !saldoBestaetigt}
          onClose={() => setArchivieren(false)}
          onBestaetigt={async () => {
            await pruefen(await api.buch.seiten[':id'].archivieren.$post({ param: { id } }));
            await qc.invalidateQueries({ queryKey: BUCH_KEY });
            notifications.show({ color: 'green', message: `Seite ${s.nummer} archiviert.` });
          }}
        >
          <Text>
            Seite {s.nummer} wird aus der Abrechnung genommen, ihre Nummer wird wieder frei. Der
            Verlauf bleibt erhalten.
          </Text>
          {s.saldoCent !== 0 && (
            <Alert color="orange" title="Offener Saldo">
              <Checkbox
                checked={saldoBestaetigt}
                onChange={(e) => setSaldoBestaetigt(e.currentTarget.checked)}
                label={`Auf der Seite steht noch ${saldoText(s.saldoCent)}. Das ist geklärt.`}
              />
            </Alert>
          )}
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
