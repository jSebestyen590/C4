import {
  ActionIcon,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { heuteBerlin, tagNachher, type UmfrageDetailDto } from '@c4/shared';
import { DatumFeld } from './DatumFeld';
import { EVENT_ART_LABELS } from './i18n';
import { useDienstformen, useEventKategorien } from './kalenderDaten';
import { ZahlFeld } from './ZahlFeld';

// Event settings and dates of a scheduling poll (see docs/umfragen.md).

let zaehler = 0;
const neuerKey = () => `t${++zaehler}`;

export interface TerminDatum {
  key: string;
  /** Set for dates that already exist (editing). */
  id?: string;
  datum: string;
  beginn: string;
  ende: string;
}

export interface TerminWerte {
  /** The existing date question (editing). */
  frageId?: string;
  kategorieId: string | null;
  jeTermin: boolean;
  beginn: string;
  ende: string;
  dienstformId: string | null;
  minimum: number;
  wunsch: number;
  termine: TerminDatum[];
}

export const neueTerminWerte = (): TerminWerte => ({
  kategorieId: null,
  jeTermin: false,
  beginn: '19:00',
  ende: '21:00',
  dienstformId: null,
  minimum: 1,
  wunsch: 2,
  termine: [{ key: neuerKey(), datum: tagNachher(heuteBerlin(), 7), beginn: '', ende: '' }],
});

export function terminWerteAus(u: UmfrageDetailDto): TerminWerte | null {
  if (!u.termin) return null;
  const frage = u.fragen[0];
  return {
    frageId: frage?.id,
    kategorieId: u.termin.kategorieId,
    jeTermin: u.termin.jeTermin,
    beginn: u.termin.beginn ?? '19:00',
    ende: u.termin.ende ?? '21:00',
    dienstformId: u.termin.bedarf?.dienstformId ?? null,
    minimum: u.termin.bedarf?.minimum ?? 1,
    wunsch: u.termin.bedarf?.wunsch ?? 2,
    termine: (frage?.optionen ?? []).map((o) => ({
      key: neuerKey(),
      id: o.id,
      datum: o.termin?.datum ?? '',
      beginn: o.termin?.beginn ?? '',
      ende: o.termin?.ende ?? '',
    })),
  };
}

/** `termin` and the date question for the API; `art` is the art of the chosen Kategorie. */
export function terminEingabeAus(t: TerminWerte, art: 'dienste' | 'teilnahme' | undefined) {
  const zeit = (v: string) => (t.jeTermin && v !== '' ? v : null);
  return {
    termin: {
      kategorieId: t.kategorieId ?? '',
      jeTermin: t.jeTermin,
      beginn: t.jeTermin ? null : t.beginn || null,
      ende: t.jeTermin ? null : t.ende || null,
      bedarf:
        art === 'dienste' && t.dienstformId
          ? { dienstformId: t.dienstformId, minimum: t.minimum, wunsch: t.wunsch }
          : null,
    },
    fragen: [
      {
        ...(t.frageId && { id: t.frageId }),
        text: '',
        freitext: false,
        maxAntworten: null,
        optionen: t.termine
          .filter((d) => d.datum !== '')
          .map((d) => ({
            ...(d.id && { id: d.id }),
            text: '',
            termin: { datum: d.datum, beginn: zeit(d.beginn), ende: zeit(d.ende) },
          })),
      },
    ],
  };
}

function ZeitFelder({
  beginn,
  ende,
  onChange,
}: Readonly<{
  beginn: string;
  ende: string;
  onChange: (z: { beginn: string; ende: string }) => void;
}>) {
  return (
    <Group grow gap="xs" preventGrowOverflow={false}>
      <TextInput
        size="md"
        type="time"
        label="Beginn"
        value={beginn}
        onChange={(e) => onChange({ beginn: e.currentTarget.value, ende })}
      />
      <TextInput
        size="md"
        type="time"
        label="Ende"
        value={ende}
        onChange={(e) => onChange({ beginn, ende: e.currentTarget.value })}
      />
    </Group>
  );
}

/** Kategorie, times, Bedarf and the dates to choose from. */
export function UmfrageTerminFelder({
  werte,
  onChange,
}: Readonly<{ werte: TerminWerte; onChange: (t: TerminWerte) => void }>) {
  const kategorien = useEventKategorien();
  const dienstformen = useDienstformen();
  const kategorie = kategorien.liste.find((k) => k.id === werte.kategorieId);
  const set = <K extends keyof TerminWerte>(k: K, v: TerminWerte[K]) =>
    onChange({ ...werte, [k]: v });
  const setDatum = (i: number, d: Partial<TerminDatum>) =>
    set(
      'termine',
      werte.termine.map((x, j) => (j === i ? { ...x, ...d } : x)),
    );
  const letztes = werte.termine.at(-1)?.datum || heuteBerlin();

  return (
    <Stack gap="sm">
      <Select
        size="md"
        label="Kategorie des Events"
        placeholder="Kategorie wählen"
        required
        allowDeselect={false}
        data={kategorien.aktive.map((k) => ({
          value: k.id,
          label: `${k.name} (${EVENT_ART_LABELS[k.art]})`,
        }))}
        value={werte.kategorieId}
        onChange={(v) => set('kategorieId', v)}
      />
      {kategorie?.art === 'teilnahme' && (
        <Text size="sm" c="dimmed">
          Wer für den festgelegten Termin gestimmt hat, wird zum Event eingeladen.
        </Text>
      )}
      {kategorie?.art === 'dienste' && (
        <Paper withBorder p="sm">
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              Das Event bekommt eine Schicht mit dieser Dienstform. Wer für den festgelegten Termin
              gestimmt hat, wird dort eingetragen. Fehlen danach Dienste, erinnert der Kalender wie
              gewohnt.
            </Text>
            <Select
              size="md"
              label="Dienstform"
              placeholder="Dienstform wählen"
              required
              allowDeselect={false}
              data={dienstformen.aktive.map((d) => ({ value: d.id, label: d.name }))}
              value={werte.dienstformId}
              onChange={(v) => set('dienstformId', v)}
            />
            <Group grow gap="xs" preventGrowOverflow={false}>
              <ZahlFeld
                size="md"
                label="Minimum"
                min={1}
                allowDecimal={false}
                value={werte.minimum}
                onChange={(v) => set('minimum', typeof v === 'number' ? v : 1)}
              />
              <ZahlFeld
                size="md"
                label="Wunsch"
                min={1}
                allowDecimal={false}
                value={werte.wunsch}
                onChange={(v) => set('wunsch', typeof v === 'number' ? v : 1)}
              />
            </Group>
          </Stack>
        </Paper>
      )}

      <Switch
        size="md"
        label="Uhrzeit je Termin"
        description={
          werte.jeTermin
            ? 'Jeder Termin hat eigene Uhrzeiten.'
            : 'Alle Termine haben dieselbe Uhrzeit.'
        }
        checked={werte.jeTermin}
        onChange={(e) => set('jeTermin', e.currentTarget.checked)}
      />
      {!werte.jeTermin && (
        <ZeitFelder
          beginn={werte.beginn}
          ende={werte.ende}
          onChange={(z) => onChange({ ...werte, ...z })}
        />
      )}

      <Text size="sm" fw={500}>
        Mögliche Termine
      </Text>
      {werte.termine.map((d, i) => (
        <Paper key={d.key} withBorder p="sm">
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <DatumFeld
                size="md"
                style={{ flex: 1 }}
                label={`Termin ${i + 1}`}
                loeschbar={false}
                value={d.datum}
                onWert={(datum) => setDatum(i, { datum })}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                size={44}
                aria-label={`Termin ${i + 1} entfernen`}
                disabled={werte.termine.length === 1}
                onClick={() =>
                  set(
                    'termine',
                    werte.termine.filter((_, j) => j !== i),
                  )
                }
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
            {werte.jeTermin && (
              <ZeitFelder beginn={d.beginn} ende={d.ende} onChange={(z) => setDatum(i, z)} />
            )}
          </Stack>
        </Paper>
      ))}
      <Button
        variant="default"
        leftSection={<IconPlus size={18} />}
        onClick={() => {
          const vorher = werte.termine.at(-1);
          set('termine', [
            ...werte.termine,
            {
              key: neuerKey(),
              datum: tagNachher(letztes, 1),
              beginn: vorher?.beginn ?? '',
              ende: vorher?.ende ?? '',
            },
          ]);
        }}
      >
        Termin hinzufügen
      </Button>
    </Stack>
  );
}
