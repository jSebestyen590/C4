import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Progress,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { IconChecklist, IconCircleCheck, IconRotate } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from './api';
import { useAuth } from './auth';
import {
  AUFRAEUMEN_KEY,
  type AufraeumEintrag,
  type AufraeumFertigEintrag,
  type OrganisatorEintrag,
} from './inventarDaten';
import { mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';
import { zeitAnzeigen } from './warenAnzeige';
import { fehlerAnzeigen, fehlerText, pruefen } from './warenApi';

const Person = ({ o }: Readonly<{ o: OrganisatorEintrag | null }>) =>
  o ? <StatusName status={o.status}>{mitgliedName(o)}</StatusName> : null;

/** Starts or ends the Aufräumaktion for everybody, or marks an IFCO as done. */
function useAufraeumMutationen() {
  const api = useApi();
  const qc = useQueryClient();
  const neu = () => qc.invalidateQueries({ queryKey: AUFRAEUMEN_KEY });
  return {
    starten: useMutation({
      meta: { eigeneFehlermeldung: true },
      mutationFn: async () => pruefen(await api.inventar.aufraeumen.$post()),
      onSuccess: neu,
      onError: (e) => fehlerAnzeigen(e),
    }),
    beenden: useMutation({
      meta: { eigeneFehlermeldung: true },
      mutationFn: async () => pruefen(await api.inventar.aufraeumen.beenden.$post()),
      onSuccess: neu,
    }),
    setzen: useMutation({
      meta: { eigeneFehlermeldung: true },
      mutationFn: async ({ ifcoId, fertig }: { ifcoId: string; fertig: boolean }) =>
        pruefen(
          await api.inventar.aufraeumen.ifcos[':id'].$put({
            param: { id: ifcoId },
            json: { fertig },
          }),
        ),
      onSuccess: neu,
      onError: (e) => fehlerAnzeigen(e),
    }),
  };
}

/**
 * Head of the IFCO view: "Aufräumen starten" while none runs, otherwise the progress over all
 * (non-archived) IFCOs, the switch "Nur offene" and "Aufräumen beenden".
 */
export function AufraeumPanel({
  aktion,
  gesamt,
  fertig,
  nurOffen,
  onNurOffen,
}: Readonly<{
  aktion: AufraeumEintrag | null;
  /** Number of IFCOs to clear up. */
  gesamt: number;
  /** How many of them are done. */
  fertig: number;
  nurOffen: boolean;
  onNurOffen: (wert: boolean) => void;
}>) {
  const darf = useAuth().can('inventar:umraeumen');
  const { starten, beenden } = useAufraeumMutationen();
  const [frage, setFrage] = useState<'starten' | 'beenden' | null>(null);
  const offen = gesamt - fertig;

  if (!aktion) {
    if (!darf) return null;
    return (
      <>
        <Button
          variant="light"
          leftSection={<IconChecklist size={18} />}
          onClick={() => setFrage('starten')}
        >
          Aufräumen starten
        </Button>
        <Modal
          opened={frage === 'starten'}
          onClose={() => setFrage(null)}
          title="Aufräumen starten"
        >
          <Stack>
            <Text>
              Startet für alle eine Aufräumaktion, z. B. nach einer Veranstaltung. Danach lässt sich
              jede IFCO als fertig abhaken, sobald Inhalt und Platz wieder stimmen.
            </Text>
            <Button
              loading={starten.isPending}
              onClick={() => starten.mutate(undefined, { onSuccess: () => setFrage(null) })}
            >
              Starten
            </Button>
          </Stack>
        </Modal>
      </>
    );
  }

  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Text fw={600}>Aufräumen läuft</Text>
          <Text size="sm" fw={600} c={offen === 0 ? 'green' : undefined}>
            {fertig} von {gesamt} fertig
          </Text>
        </Group>
        <Progress
          value={gesamt === 0 ? 100 : (fertig / gesamt) * 100}
          color={offen === 0 ? 'green' : undefined}
          aria-label={`${fertig} von ${gesamt} IFCOs fertig`}
        />
        <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
          Seit {zeitAnzeigen(aktion.gestartetAm)}
          {aktion.gestartetVon && (
            <>
              {' '}
              · gestartet von <Person o={aktion.gestartetVon} />
            </>
          )}
        </Text>
        <Switch
          label="Nur offene IFCOs"
          checked={nurOffen}
          onChange={(e) => onNurOffen(e.currentTarget.checked)}
        />
        {darf && (
          <Button variant="default" onClick={() => setFrage('beenden')}>
            Aufräumen beenden
          </Button>
        )}
      </Stack>
      <Modal opened={frage === 'beenden'} onClose={() => setFrage(null)} title="Aufräumen beenden">
        <Stack>
          <Text>
            {offen > 0
              ? `Noch ${offen === 1 ? 'ist 1 IFCO' : `sind ${offen} IFCOs`} nicht abgehakt. Trotzdem für alle beenden?`
              : 'Alle IFCOs sind fertig. Aufräumaktion für alle beenden?'}
          </Text>
          {beenden.isError && (
            <Alert color="red">{fehlerText(beenden.error, 'Beenden fehlgeschlagen.')}</Alert>
          )}
          <Button
            loading={beenden.isPending}
            onClick={() => beenden.mutate(undefined, { onSuccess: () => setFrage(null) })}
          >
            Beenden
          </Button>
        </Stack>
      </Modal>
    </Paper>
  );
}

/** Short note on the other Inventar views that an Aufräumaktion runs, linking to the IFCOs. */
export function AufraeumHinweis({ gesamt, fertig }: Readonly<{ gesamt: number; fertig: number }>) {
  return (
    <Alert color="blue" variant="light" icon={<IconChecklist size={18} />}>
      Aufräumen läuft: {fertig} von {gesamt} IFCOs fertig.{' '}
      <Anchor component={Link} to="/inventar?ansicht=ifcos" inherit>
        Zu den IFCOs
      </Anchor>
    </Alert>
  );
}

/** Green badge "Fertig · username" of a done IFCO; the time is in the tooltip. */
export function FertigBadge({ f }: Readonly<{ f: AufraeumFertigEintrag }>) {
  return (
    <Badge
      color="green"
      variant="light"
      leftSection={<IconCircleCheck size={14} />}
      title={`Fertig seit ${zeitAnzeigen(f.fertigAm)}`}
      style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
    >
      Fertig{f.von && ` · ${mitgliedName(f.von)}`}
    </Badge>
  );
}

/** Toggles "fertig" of one IFCO in the running Aufräumaktion (needs `inventar:umraeumen`). */
export function FertigKnopf({
  ifcoId,
  fertig,
  voll = false,
}: Readonly<{ ifcoId: string; fertig: boolean; voll?: boolean }>) {
  const darf = useAuth().can('inventar:umraeumen');
  const { setzen } = useAufraeumMutationen();
  if (!darf) return null;
  return (
    <Button
      size={voll ? 'lg' : 'md'}
      mih={voll ? 48 : undefined}
      fullWidth={voll}
      variant={fertig ? 'default' : 'filled'}
      color={fertig ? undefined : 'green'}
      leftSection={fertig ? <IconRotate size={18} /> : <IconCircleCheck size={18} />}
      loading={setzen.isPending}
      onClick={(e) => {
        // On a card the button must not open the IFCO.
        e.preventDefault();
        e.stopPropagation();
        setzen.mutate({ ifcoId, fertig: !fertig });
      }}
    >
      {fertig ? 'Wieder öffnen' : 'Fertig'}
    </Button>
  );
}

/** Done state of an IFCO on its detail page while an Aufräumaktion runs. */
export function IfcoAufraeumen({
  ifcoId,
  f,
}: Readonly<{ ifcoId: string; f: AufraeumFertigEintrag | undefined }>) {
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          Aufräumen läuft
        </Text>
        {f ? (
          <Text size="sm" c="green" style={{ overflowWrap: 'anywhere' }}>
            Fertig seit {zeitAnzeigen(f.fertigAm)}
            {f.von && (
              <>
                {' '}
                · <Person o={f.von} />
              </>
            )}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Noch offen. Hake die IFCO ab, sobald Inhalt und Platz stimmen.
          </Text>
        )}
        <FertigKnopf ifcoId={ifcoId} fertig={!!f} voll />
      </Stack>
    </Paper>
  );
}
