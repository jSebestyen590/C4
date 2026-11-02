import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  heuteBerlin,
  MITGLIED_STATI,
  statusUebergangUeblich,
  type Anrede,
  type MitgliedStatus,
} from '@c4/shared';
import { useApi } from './api';
import { DatumFeld } from './DatumFeld';
import { historieAktualisieren } from './historieDaten';
import { useAuth } from './auth';
import { labelFuer, MITGLIED_STATUS_LABELS } from './i18n';
import { fehlerText, pruefen } from './warenApi';

export const BADGE_FARBE: Record<MitgliedStatus, string> = {
  anwaerter: 'orange',
  mitglied: 'green',
  em: 'gray',
  extern: 'blue',
};

/** [light, dark] shade of the username per status; both keep enough contrast on their background. */
const NAME_FARBE: Record<MitgliedStatus, [string, string]> = {
  anwaerter: ['orange.9', 'orange.4'],
  mitglied: ['green.9', 'green.4'],
  em: ['gray.7', 'gray.5'],
  extern: ['blue.9', 'blue.4'],
};

/** Text color for a member's username, matching the active light/dark mode. */
export function useStatusFarbe(status: MitgliedStatus): string {
  const dunkel = useComputedColorScheme('light') === 'dark';
  return NAME_FARBE[status][dunkel ? 1 : 0];
}

export function StatusBadge({
  status,
  anrede,
}: Readonly<{ status: MitgliedStatus; anrede: Anrede }>) {
  return (
    <Badge color={BADGE_FARBE[status]} variant="light">
      {labelFuer(MITGLIED_STATUS_LABELS, status, anrede)}
    </Badge>
  );
}

/** A member's primary label (username or name): always bold, in the color of their status. */
export function StatusName({
  status,
  children,
}: Readonly<{ status: MitgliedStatus; children: string }>) {
  const farbe = useStatusFarbe(status);
  return (
    <Text component="span" fw={700} c={farbe} style={{ overflowWrap: 'anywhere' }}>
      {children}
    </Text>
  );
}

/** Page heading in the color of the member's status. */
export function StatusTitel({
  status,
  children,
}: Readonly<{ status: MitgliedStatus; children: string }>) {
  const farbe = useStatusFarbe(status);
  return (
    <Title order={2} c={farbe} style={{ overflowWrap: 'anywhere' }}>
      {children}
    </Title>
  );
}

/** Admins pick the status; everyone else sees it read-only. */
export function StatusFeld({
  sub,
  status,
  anrede,
  deaktiviert = false,
}: Readonly<{ sub: string; status: MitgliedStatus; anrede: Anrede; deaktiviert?: boolean }>) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  // The chosen status waits in a dialog for its start date (and a warning if the change is unusual).
  const [neuerStatus, setNeuerStatus] = useState<MitgliedStatus | null>(null);
  const [ab, setAb] = useState(heuteBerlin());
  const [fehler, setFehler] = useState<string | null>(null);
  const setzen = useMutation({
    mutationFn: async (daten: { status: MitgliedStatus; ab: string }) => {
      const res = await api.admin.mitglieder[':sub'].status.$put({ param: { sub }, json: daten });
      if (res.status === 404) throw new Error('kein-profil');
      await pruefen(res);
    },
    onSuccess: async () => {
      await historieAktualisieren(qc);
      notifications.show({ color: 'green', message: 'Der Status wurde gespeichert.' });
      setNeuerStatus(null);
    },
    onError: (err) =>
      setFehler(
        err.message === 'kein-profil'
          ? 'Der Status kann erst geändert werden, wenn das Mitglied sein Profil angelegt hat.'
          : fehlerText(err, 'Der Status konnte nicht gespeichert werden.'),
      ),
  });

  if (!can('users:manage'))
    return (
      <Stack gap={4}>
        <Text size="sm" c="dimmed">
          Status
        </Text>
        <div>
          <StatusBadge status={status} anrede={anrede} />
        </div>
      </Stack>
    );
  const name = (s: MitgliedStatus) => labelFuer(MITGLIED_STATUS_LABELS, s, anrede);
  return (
    <>
      <Select
        label="Status"
        data={MITGLIED_STATI.map((s) => ({
          value: s,
          label: labelFuer(MITGLIED_STATUS_LABELS, s, anrede),
        }))}
        value={status}
        allowDeselect={false}
        // The status of a deactivated account is frozen (the API answers 409).
        description={
          deaktiviert ? 'Aktiviere den Account wieder, um den Status zu ändern.' : undefined
        }
        disabled={deaktiviert}
        onChange={(v) => {
          if (!v) return;
          setAb(heuteBerlin());
          setFehler(null);
          setNeuerStatus(v as MitgliedStatus);
        }}
      />
      {neuerStatus && (
        <Modal opened onClose={() => setNeuerStatus(null)} title="Status ändern">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              // Rendered inside the profile form's React tree (portal): keep the submit from reaching it.
              e.stopPropagation();
              setFehler(null);
              if (!ab) return setFehler('Bitte gib ein Datum an.');
              setzen.mutate({ status: neuerStatus, ab });
            }}
          >
            <Stack>
              <Text>
                Neuer Status: <b>{name(neuerStatus)}</b>
              </Text>
              {!statusUebergangUeblich(status, neuerStatus) && (
                <Alert color="orange" title="Ungewöhnlicher Statuswechsel">
                  Üblich ist die Reihenfolge {name('anwaerter')} → {name('mitglied')} → {name('em')}
                  , ohne Stufen zu überspringen. {name('extern')} geht jederzeit. Der Wechsel von{' '}
                  <b>{name(status)}</b> zu <b>{name(neuerStatus)}</b> weicht davon ab.
                </Alert>
              )}
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
                <Button variant="default" onClick={() => setNeuerStatus(null)}>
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  color={statusUebergangUeblich(status, neuerStatus) ? undefined : 'orange'}
                  loading={setzen.isPending}
                >
                  {statusUebergangUeblich(status, neuerStatus) ? 'Ändern' : 'Trotzdem ändern'}
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>
      )}
    </>
  );
}
