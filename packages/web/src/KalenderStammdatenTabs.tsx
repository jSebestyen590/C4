import {
  Alert,
  Button,
  Checkbox,
  ColorSwatch,
  Group,
  Badge,
  Modal,
  MultiSelect,
  Radio,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowMerge } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  dienstformEingabeSchema,
  eventKategorieEingabeSchema,
  MITGLIED_STATI,
  externeEingabeSchema,
  EVENT_ARTEN,
  EVENT_DAUERN,
  type DienstformDto,
  type EventArt,
  type EventDauer,
  type EventKategorieDto,
  type ExterneDto,
} from '@c4/shared';
import { useApi } from './api';
import { EVENT_ART_LABELS, EVENT_DAUER_LABELS } from './i18n';
import {
  TeilnahmeFelder,
  teilnahmeKreisAus,
  teilnahmeWerteAus,
  type TeilnahmeWerte,
} from './TeilnahmeFelder';
import {
  kalenderInvalidieren,
  useDienstformen,
  useEventKategorien,
  useExterne,
} from './kalenderDaten';
import { KalenderStammdatenTab } from './KalenderStammdatenTab';
import { fehlerText, pruefen } from './warenApi';
import { ZahlFeld } from './ZahlFeld';

const ersteMeldung = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : (r.error?.issues[0]?.message ?? 'Ungültige Eingabe.');

// ---------------------------------------------------------------------------------------------
// Dienstformen
// ---------------------------------------------------------------------------------------------

interface DienstformWerte {
  name: string;
  reihenfolge: number | '';
}

export function DienstformenTab() {
  const api = useApi();
  const q = useDienstformen();
  const json = (w: DienstformWerte, archiviert?: boolean) => ({
    name: w.name,
    ...(w.reihenfolge === '' ? {} : { reihenfolge: w.reihenfolge }),
    ...(archiviert === undefined ? {} : { archiviert }),
  });
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Dienstformen gibt es nur für den Betrieb. Aufbau und Putzen brauchen keine Dienstform, dort
        legst du nur die Anzahl der Personen fest.
      </Text>
      <KalenderStammdatenTab<DienstformDto, DienstformWerte>
        anlegenText="Dienstform anlegen"
        bearbeitenTitel="Dienstform bearbeiten"
        items={q.data}
        laedt={q.isPending}
        fehler={q.isError}
        zeile={(d) => (
          <Stack gap={0}>
            <Text fw={600}>{d.name}</Text>
            <Text size="sm" c="dimmed">
              Reihenfolge {d.reihenfolge}
            </Text>
          </Stack>
        )}
        leer={{ name: '', reihenfolge: '' }}
        aus={(d) => ({ name: d.name, reihenfolge: d.reihenfolge })}
        felder={(w, set) => (
          <>
            <TextInput
              label="Name"
              value={w.name}
              onChange={(e) => set({ ...w, name: e.currentTarget.value })}
            />
            <ZahlFeld
              label="Reihenfolge"
              description="Kleinere Zahlen stehen weiter vorne. Leer = ans Ende."
              min={0}
              allowDecimal={false}
              allowNegative={false}
              value={w.reihenfolge}
              onChange={(v) => set({ ...w, reihenfolge: typeof v === 'number' ? v : '' })}
            />
          </>
        )}
        validieren={(w) => ersteMeldung(dienstformEingabeSchema.safeParse(json(w)))}
        speichern={async (id, w, d) => {
          const body = json(w, d?.archiviert);
          await pruefen(
            id
              ? await api.kalender.dienstformen[':id'].$put({ param: { id }, json: body })
              : await api.kalender.dienstformen.$post({ json: body }),
          );
        }}
        archivieren={async (d, archiviert) =>
          pruefen(
            await api.kalender.dienstformen[':id'].$put({
              param: { id: d.id },
              json: { name: d.name, reihenfolge: d.reihenfolge, archiviert },
            }),
          )
        }
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------------------------
// Kategorien
// ---------------------------------------------------------------------------------------------

/** Pick one of the theme colors; every swatch is a 44px touch target. */
export function FarbWahl({
  wert,
  onChange,
}: Readonly<{ wert: string; onChange: (farbe: string) => void }>) {
  const theme = useMantineTheme();
  const farben = Object.keys(theme.colors).filter((f) => f !== 'dark');
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Farbe
      </Text>
      <Group gap={0} role="radiogroup" aria-label="Farbe">
        {farben.map((f) => (
          <UnstyledButton
            key={f}
            role="radio"
            aria-checked={wert === f}
            aria-label={f}
            onClick={() => onChange(f)}
            w={44}
            h={44}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ColorSwatch
              color={`var(--mantine-color-${f}-6)`}
              size={wert === f ? 34 : 26}
              style={
                wert === f
                  ? { outline: '3px solid var(--mantine-color-text)', outlineOffset: 1 }
                  : undefined
              }
            />
          </UnstyledButton>
        ))}
      </Group>
    </Stack>
  );
}

interface KategorieWerte {
  name: string;
  farbe: string;
  art: EventArt;
  dauer: EventDauer;
  /** Default circle; only sent for `teilnahme`. */
  teilnahme: TeilnahmeWerte;
  /** "Sitzung mit Protokoll"; only for `teilnahme`. */
  protokoll: boolean;
}

const kategorieJson = (w: KategorieWerte) => ({
  name: w.name,
  farbe: w.farbe,
  art: w.art,
  dauer: w.dauer,
  teilnahmeStatus: w.art === 'teilnahme' ? teilnahmeKreisAus(w.teilnahme) : null,
  protokoll: w.art === 'teilnahme' && w.protokoll,
});

export function EventKategorienTab() {
  const api = useApi();
  const q = useEventKategorien();
  return (
    <KalenderStammdatenTab<EventKategorieDto, KategorieWerte>
      anlegenText="Kategorie anlegen"
      bearbeitenTitel="Kategorie bearbeiten"
      items={q.data}
      laedt={q.isPending}
      fehler={q.isError}
      zeile={(k) => (
        <Group gap="sm" wrap="nowrap">
          <ColorSwatch color={`var(--mantine-color-${k.farbe}-6)`} size={22} />
          <Stack gap={2} align="flex-start" style={{ minWidth: 0 }}>
            <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
              {k.name}
            </Text>
            <Group gap={6}>
              <Badge variant="light" color={k.art === 'teilnahme' ? 'teal' : 'gray'} tt="none">
                {EVENT_ART_LABELS[k.art]}
              </Badge>
              {k.protokoll && (
                <Badge variant="light" color="indigo" tt="none">
                  Protokoll
                </Badge>
              )}
              {k.dauer !== 'eintaegig' && (
                <Badge variant="outline" color="gray" tt="none">
                  {EVENT_DAUER_LABELS[k.dauer].titel}
                </Badge>
              )}
            </Group>
          </Stack>
        </Group>
      )}
      leer={{
        name: '',
        farbe: 'indigo',
        art: 'dienste',
        dauer: 'eintaegig',
        teilnahme: teilnahmeWerteAus([...MITGLIED_STATI]),
        protokoll: false,
      }}
      aus={(k) => ({
        name: k.name,
        farbe: k.farbe,
        art: k.art,
        dauer: k.dauer,
        teilnahme: teilnahmeWerteAus(k.teilnahmeStatus ?? [...MITGLIED_STATI]),
        protokoll: k.protokoll,
      })}
      felder={(w, set, k) => (
        <>
          <TextInput
            label="Name"
            value={w.name}
            onChange={(e) => set({ ...w, name: e.currentTarget.value })}
          />
          <FarbWahl wert={w.farbe} onChange={(farbe) => set({ ...w, farbe })} />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Art
            </Text>
            <SegmentedControl
              fullWidth
              data={EVENT_ARTEN.map((a) => ({ value: a, label: EVENT_ART_LABELS[a] }))}
              value={w.art}
              disabled={k?.benutzt === true}
              onChange={(art) => set({ ...w, art: art as EventArt })}
            />
            <Text size="sm" c="dimmed">
              {k?.benutzt
                ? 'Die Art lässt sich nicht mehr ändern, weil Events diese Kategorie benutzen.'
                : w.art === 'dienste'
                  ? 'Events dieser Kategorie haben Schichten und Dienste.'
                  : 'Events dieser Kategorie haben Teilnehmende statt Diensten.'}
            </Text>
          </Stack>
          <Radio.Group
            label="Dauer der Events"
            value={w.dauer}
            onChange={(v) => set({ ...w, dauer: v as EventDauer })}
          >
            <Stack gap="sm" mt="xs">
              {EVENT_DAUERN.map((d) => (
                <Radio
                  key={d}
                  value={d}
                  size="md"
                  label={EVENT_DAUER_LABELS[d].titel}
                  description={EVENT_DAUER_LABELS[d].beschreibung}
                />
              ))}
            </Stack>
          </Radio.Group>
          {k && k.dauer !== w.dauer && k.benutzt && (
            <Text size="sm" c="dimmed">
              Bestehende Events behalten ihre Zeiten. Erst beim Bearbeiten gelten die neuen Regeln.
            </Text>
          )}
          {w.art === 'teilnahme' && (
            <Checkbox
              size="md"
              label="Sitzung mit Protokoll"
              description="Zu Events dieser Kategorie kann ein Protokoll geschrieben werden."
              checked={w.protokoll}
              onChange={(e) => set({ ...w, protokoll: e.currentTarget.checked })}
            />
          )}
          {w.art === 'teilnahme' && (
            <TeilnahmeFelder
              titel="Standard-Kreis"
              label="Wer nimmt standardmäßig teil?"
              mitEinladung={false}
              werte={w.teilnahme}
              onChange={(teilnahme) => set({ ...w, teilnahme })}
            />
          )}
        </>
      )}
      validieren={(w) => ersteMeldung(eventKategorieEingabeSchema.safeParse(kategorieJson(w)))}
      speichern={async (id, w, k) => {
        const body = { ...kategorieJson(w), archiviert: k?.archiviert ?? false };
        await pruefen(
          id
            ? await api.kalender.kategorien[':id'].$put({ param: { id }, json: body })
            : await api.kalender.kategorien.$post({ json: body }),
        );
      }}
      archivieren={async (k, archiviert) =>
        pruefen(
          await api.kalender.kategorien[':id'].$put({
            param: { id: k.id },
            json: {
              name: k.name,
              farbe: k.farbe,
              art: k.art,
              dauer: k.dauer,
              teilnahmeStatus: k.teilnahmeStatus,
              protokoll: k.protokoll,
              archiviert,
            },
          }),
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Externe
// ---------------------------------------------------------------------------------------------

interface ExterneWerte {
  name: string;
  quelle: string;
  kontakt: string;
}

const optionLabel = (e: ExterneDto) => (e.quelle ? `${e.name} (${e.quelle})` : e.name);

function ZusammenfuehrenModal({
  externe,
  onClose,
}: Readonly<{ externe: ExterneDto[]; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [ziel, setZiel] = useState<string | null>(null);
  const [quellen, setQuellen] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const aktive = externe;

  const absenden = async () => {
    if (!ziel) return setFehler('Bitte wähle das Ziel.');
    if (quellen.length === 0)
      return setFehler('Bitte wähle mindestens eine Person zum Zusammenführen.');
    setLaeuft(true);
    setFehler(null);
    try {
      await pruefen(
        await api.kalender.externe.zusammenfuehren.$post({
          json: { zielId: ziel, quelleIds: quellen },
        }),
      );
      await kalenderInvalidieren(qc);
      notifications.show({ color: 'green', message: 'Die Personen wurden zusammengeführt.' });
      onClose();
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title="Externe zusammenführen">
      <Stack>
        <Text size="sm">
          Alle Dienste der gewählten Personen gehen auf das Ziel über. Die gewählten Personen werden
          danach gelöscht. Ist eine Person in einer Schicht schon beim Ziel eingetragen, entfällt
          ihr doppelter Eintrag.
        </Text>
        <Select
          label="Ziel"
          placeholder="Person wählen, die bleibt"
          searchable
          data={aktive.map((e) => ({ value: e.id, label: optionLabel(e) }))}
          value={ziel}
          onChange={(v) => {
            setZiel(v);
            setQuellen((q) => q.filter((id) => id !== v));
          }}
        />
        <MultiSelect
          label="Zusammenführen"
          placeholder="Personen wählen"
          searchable
          data={aktive
            .filter((e) => e.id !== ziel)
            .map((e) => ({ value: e.id, label: optionLabel(e) }))}
          value={quellen}
          onChange={setQuellen}
        />
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button loading={laeuft} onClick={() => void absenden()}>
            Zusammenführen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function ExterneTab() {
  const api = useApi();
  const q = useExterne(true);
  const [zusammen, setZusammen] = useState(false);
  return (
    <>
      <KalenderStammdatenTab<ExterneDto, ExterneWerte>
        anlegenText="Externe Person anlegen"
        bearbeitenTitel="Externe Person bearbeiten"
        items={q.data}
        laedt={q.isPending}
        fehler={q.isError}
        zeile={(e) => (
          <Stack gap={0}>
            <Text fw={600} fs="italic" style={{ overflowWrap: 'anywhere' }}>
              {e.name}
            </Text>
            {e.quelle && (
              <Text size="sm" c="dimmed">
                Quelle: {e.quelle}
              </Text>
            )}
            {e.kontakt && (
              <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                Kontakt: {e.kontakt}
              </Text>
            )}
          </Stack>
        )}
        extra={
          <Button
            variant="default"
            leftSection={<IconArrowMerge size={18} />}
            onClick={() => setZusammen(true)}
          >
            Zusammenführen
          </Button>
        }
        leer={{ name: '', quelle: '', kontakt: '' }}
        aus={(e) => ({ name: e.name, quelle: e.quelle ?? '', kontakt: e.kontakt ?? '' })}
        felder={(w, set) => (
          <>
            <TextInput
              label="Name"
              value={w.name}
              onChange={(e) => set({ ...w, name: e.currentTarget.value })}
            />
            <TextInput
              label="Quelle"
              description="z. B. „Freund:in von X“ oder „StuK“"
              value={w.quelle}
              onChange={(e) => set({ ...w, quelle: e.currentTarget.value })}
            />
            <TextInput
              label="Kontakt"
              value={w.kontakt}
              onChange={(e) => set({ ...w, kontakt: e.currentTarget.value })}
            />
          </>
        )}
        validieren={(w) => ersteMeldung(externeEingabeSchema.safeParse(w))}
        speichern={async (id, w, e) => {
          const body = { ...w, archiviert: e?.archiviert ?? false };
          await pruefen(
            id
              ? await api.kalender.externe[':id'].$put({ param: { id }, json: body })
              : await api.kalender.externe.$post({ json: body }),
          );
        }}
        archivieren={async (e, archiviert) =>
          pruefen(
            await api.kalender.externe[':id'].$put({
              param: { id: e.id },
              json: { name: e.name, quelle: e.quelle, kontakt: e.kontakt, archiviert },
            }),
          )
        }
      />
      {zusammen && (
        <ZusammenfuehrenModal externe={q.data ?? []} onClose={() => setZusammen(false)} />
      )}
    </>
  );
}
