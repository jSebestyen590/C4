import {
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  Radio,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ProtokollAktionDto } from '@c4/shared';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { aktionLaeuft, auswahlUmschalten, zustandText } from './aktionenLogik';

/** The members an Aktion concerns (bold, status color, linked) and the link to the event. */
function AktionBezug({ aktion }: Readonly<{ aktion: ProtokollAktionDto }>) {
  if (aktion.personen.length === 0 && !aktion.eventId) return null;
  return (
    <Group gap="xs" wrap="wrap">
      {aktion.personen.map((p) => (
        <Anchor key={p.sub} component={Link} to={mitgliedLink(p)} underline="never" size="sm">
          <StatusName status={p.status}>{mitgliedName(p)}</StatusName>
        </Anchor>
      ))}
      {aktion.eventId && (
        <Anchor
          component={Link}
          to={`/kalender/events/${encodeURIComponent(aktion.eventId)}`}
          target="_blank"
          rel="noopener"
          size="sm"
          // Touch target: at least 42px high.
          mih={42}
          style={{ display: 'inline-flex', alignItems: 'center' }}
        >
          Im Kalender öffnen
        </Anchor>
      )}
    </Group>
  );
}

/** The vote was not beschlussfähig: the Aktion runs provisionally, the vote is repeated next time. */
export const VORLAEUFIG_TEXT =
  'Vorläufig – nicht beschlussfähig, wird in der nächsten Sitzung wiederholt.';

function Vorlaeufig({ aktion }: Readonly<{ aktion: ProtokollAktionDto }>) {
  if (!aktion.vorlaeufig) return null;
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Badge color="orange" variant="light" size="md">
        vorläufig
      </Badge>
      <Text size="sm" c="orange.8" style={{ overflowWrap: 'anywhere', flex: 1 }}>
        {VORLAEUFIG_TEXT}
      </Text>
    </Group>
  );
}

/** Replace the planned series event of the day by the new event, or create it in addition. */
function SerieWahl({
  aktion,
  zusaetzlich,
  onZusaetzlich,
  disabled,
}: Readonly<{
  aktion: ProtokollAktionDto;
  zusaetzlich: readonly string[];
  onZusaetzlich: (neu: string[]) => void;
  disabled?: boolean;
}>) {
  if (!aktion.serie || aktion.erledigt) return null;
  const ersetzen = !zusaetzlich.includes(aktion.id);
  return (
    // Stacked radios instead of a SegmentedControl: long series names wrap on a phone.
    <Radio.Group
      aria-label={`Serienevent „${aktion.serie.name}“`}
      value={ersetzen ? 'ersetzen' : 'zusaetzlich'}
      onChange={(wert) =>
        onZusaetzlich(
          wert === 'ersetzen'
            ? zusaetzlich.filter((id) => id !== aktion.id)
            : [...zusaetzlich, aktion.id],
        )
      }
    >
      <Stack gap="xs">
        <Radio
          size="md"
          disabled={disabled}
          value="ersetzen"
          label={`Serienevent „${aktion.serie.name}“ ersetzen`}
        />
        <Radio size="md" disabled={disabled} value="zusaetzlich" label="Zusätzlich anlegen" />
      </Stack>
    </Radio.Group>
  );
}

function Erledigt() {
  return (
    <Group gap={4} wrap="nowrap" c="green" aria-label="erledigt">
      <IconCheck size={16} />
      <Text size="sm" c="green">
        erledigt
      </Text>
    </Group>
  );
}

/** Aktionen with checkboxes (closing dialog): what runs on closing is up to the user. */
export function AktionenAuswahl({
  aktionen,
  auswahl,
  onAuswahl,
  zusaetzlich = [],
  onZusaetzlich = () => {},
}: Readonly<{
  aktionen: readonly ProtokollAktionDto[];
  auswahl: readonly string[];
  onAuswahl: (neu: string[]) => void;
  /** Ids of Aktionen with a Serienevent that are created in addition instead of replacing it. */
  zusaetzlich?: readonly string[];
  onZusaetzlich?: (neu: string[]) => void;
}>) {
  return (
    <Stack gap="sm" component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
      {aktionen.map((a) => {
        const kannLaufen = aktionLaeuft(a);
        return (
          <li key={a.id}>
            <Stack gap={2} opacity={kannLaufen || a.erledigt ? 1 : 0.6}>
              {a.erledigt ? (
                <Group gap="xs" wrap="nowrap" align="flex-start" mih={42}>
                  <Text style={{ overflowWrap: 'anywhere', flex: 1 }}>{a.text}</Text>
                  <Erledigt />
                </Group>
              ) : (
                <Checkbox
                  size="md"
                  mih={42}
                  styles={{ root: { display: 'flex', alignItems: 'center' } }}
                  label={a.text}
                  checked={auswahl.includes(a.id)}
                  disabled={!kannLaufen}
                  onChange={(e) =>
                    onAuswahl(auswahlUmschalten(auswahl, a.id, e.currentTarget.checked))
                  }
                />
              )}
              {!a.erledigt && !kannLaufen && a.grund && (
                <Text size="sm" c="dimmed">
                  {a.grund}
                </Text>
              )}
              {a.zustand === 'fehler' && a.ergebnis && (
                <Text size="sm" c="red">
                  Zuletzt fehlgeschlagen: {a.ergebnis.text}
                </Text>
              )}
              <SerieWahl
                aktion={a}
                zusaetzlich={zusaetzlich}
                onZusaetzlich={onZusaetzlich}
                disabled={!kannLaufen || !auswahl.includes(a.id)}
              />
              <Vorlaeufig aktion={a} />
              <AktionBezug aktion={a} />
            </Stack>
          </li>
        );
      })}
    </Stack>
  );
}

/** Card of a closed protocol: state of every Aktion, with run / retry buttons. */
export function AktionenKarte({
  aktionen,
  laeuftId,
  gesperrt,
  onAusfuehren,
  zusaetzlich = [],
  onZusaetzlich = () => {},
}: Readonly<{
  aktionen: readonly ProtokollAktionDto[];
  /** Id of the Aktion that is running now (its button spins), or null. */
  laeuftId: string | null;
  /** Another run is in progress: no new one can start. */
  gesperrt: boolean;
  onAusfuehren: (id: string) => void;
  /** Ids of Aktionen with a Serienevent that are created in addition instead of replacing it. */
  zusaetzlich?: readonly string[];
  onZusaetzlich?: (neu: string[]) => void;
}>) {
  if (aktionen.length === 0) return null;
  return (
    <Paper withBorder p="md" radius="md" data-druck="aus">
      <Stack gap="sm">
        <Title order={4}>Aktionen</Title>
        <Stack gap="md" component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
          {aktionen.map((a) => (
            <li key={a.id}>
              <Stack gap={4}>
                <Text style={{ overflowWrap: 'anywhere' }}>{a.text}</Text>
                <Vorlaeufig aktion={a} />
                <AktionBezug aktion={a} />
                <SerieWahl
                  aktion={a}
                  zusaetzlich={zusaetzlich}
                  onZusaetzlich={onZusaetzlich}
                  disabled={!aktionLaeuft(a)}
                />
                <AktionZustand aktion={a} />
                {aktionLaeuft(a) && (
                  <Box>
                    <Button
                      variant={a.zustand === 'fehler' ? 'filled' : 'default'}
                      loading={laeuftId === a.id}
                      disabled={gesperrt && laeuftId !== a.id}
                      onClick={() => onAusfuehren(a.id)}
                    >
                      {a.zustand === 'fehler' ? 'Erneut versuchen' : 'Ausführen'}
                    </Button>
                  </Box>
                )}
              </Stack>
            </li>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}

function AktionZustand({ aktion }: Readonly<{ aktion: ProtokollAktionDto }>): ReactNode {
  if (aktion.zustand === 'erledigt') {
    return (
      <>
        <Erledigt />
        {aktion.ergebnis && (
          <Text size="sm" c="dimmed">
            {aktion.ergebnis.text}
          </Text>
        )}
      </>
    );
  }
  if (aktion.zustand === 'fehler') {
    return (
      <Text size="sm" c="red">
        {zustandText(aktion)}
        {aktion.ergebnis ? `: ${aktion.ergebnis.text}` : ''}
      </Text>
    );
  }
  if (aktion.zustand === 'nicht_ausfuehrbar') {
    return (
      <Text size="sm" c="dimmed">
        {zustandText(aktion)}
        {aktion.grund ? `: ${aktion.grund}` : ''}
      </Text>
    );
  }
  return (
    <Text size="sm" c="dimmed">
      {zustandText(aktion)}
    </Text>
  );
}
