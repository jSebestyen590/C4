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
import {
  bedarfZusammen,
  heuteBerlin,
  tagNachher,
  UMFRAGE_TERMIN_NAME_MAX,
  type EventDauer,
  type EventKategorieDto,
  type UmfrageDetailDto,
  type VorlageDto,
} from '@c4/shared';
import { DatumFeld } from './DatumFeld';
import { ZeitraumFeld } from './ZeitraumFeld';
import { EVENT_ART_LABELS, EVENT_DAUER_LABELS } from './i18n';
import { useDienstformen, useEventKategorien, useVorlagen, vorlageTitel } from './kalenderDaten';
import { ZahlFeld } from './ZahlFeld';

// Event settings and dates of a scheduling poll (see docs/umfragen.md).

let zaehler = 0;
const neuerKey = () => `t${++zaehler}`;

export interface TerminDatum {
  key: string;
  /** Set for dates that already exist (editing). */
  id?: string;
  datum: string;
  /** Last day (multi-day and whole-day Kategorien). */
  bis: string;
  beginn: string;
  ende: string;
  /** Optional name shown with the date. */
  name: string;
}

export interface TerminWerte {
  /** The existing date question (editing). */
  frageId?: string;
  /** The event comes from a Vorlage (times, Schichten, Bedarf) or from a Kategorie. */
  quelle: 'kategorie' | 'vorlage';
  kategorieId: string | null;
  vorlageId: string | null;
  jeTermin: boolean;
  beginn: string;
  ende: string;
  dienstformId: string | null;
  minimum: number;
  wunsch: number;
  termine: TerminDatum[];
}

export const neuesDatum = (datum: string, vorher?: TerminDatum): TerminDatum => ({
  key: neuerKey(),
  datum,
  bis: datum,
  beginn: vorher?.beginn ?? '',
  ende: vorher?.ende ?? '',
  name: '',
});

export const neueTerminWerte = (): TerminWerte => ({
  quelle: 'kategorie',
  kategorieId: null,
  vorlageId: null,
  jeTermin: false,
  beginn: '19:00',
  ende: '21:00',
  dienstformId: null,
  minimum: 1,
  wunsch: 2,
  termine: [neuesDatum(tagNachher(heuteBerlin(), 7))],
});

export function terminWerteAus(u: UmfrageDetailDto): TerminWerte | null {
  if (!u.termin) return null;
  const frage = u.fragen[0];
  return {
    frageId: frage?.id,
    quelle: u.termin.vorlageId ? 'vorlage' : 'kategorie',
    kategorieId: u.termin.kategorieId,
    vorlageId: u.termin.vorlageId,
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
      bis: o.termin?.bis ?? o.termin?.datum ?? '',
      beginn: o.termin?.beginn ?? '',
      ende: o.termin?.ende ?? '',
      name: o.termin?.name ?? '',
    })),
  };
}

/** Kategorie of the settings: the chosen one, or that of the chosen Vorlage. */
export function terminKategorie(
  t: TerminWerte,
  kategorien: readonly EventKategorieDto[],
  vorlagen: readonly VorlageDto[],
): EventKategorieDto | undefined {
  const id =
    t.quelle === 'vorlage'
      ? vorlagen.find((v) => v.id === t.vorlageId)?.kategorieId
      : t.kategorieId;
  return kategorien.find((k) => k.id === id);
}

/**
 * `termin` and the date question for the API. The API drops what the Kategorie or Vorlage decides
 * itself (times, end dates, Bedarf), so this sends what the form shows.
 */
export function terminEingabeAus(t: TerminWerte, kategorie: EventKategorieDto | undefined) {
  const vorlage = t.quelle === 'vorlage';
  const dauer: EventDauer = kategorie?.dauer ?? 'eintaegig';
  const zeiten = !vorlage && dauer !== 'ganztaegig';
  const zeit = (v: string) => (zeiten && t.jeTermin && v !== '' ? v : null);
  return {
    termin: {
      kategorieId: kategorie?.id ?? t.kategorieId ?? '',
      vorlageId: vorlage ? t.vorlageId : null,
      jeTermin: zeiten && t.jeTermin,
      beginn: zeiten && !t.jeTermin ? t.beginn || null : null,
      ende: zeiten && !t.jeTermin ? t.ende || null : null,
      bedarf:
        !vorlage && kategorie?.art === 'dienste' && t.dienstformId
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
            termin: {
              datum: d.datum,
              bis: !vorlage && dauer !== 'eintaegig' ? d.bis || d.datum : null,
              beginn: zeit(d.beginn),
              ende: zeit(d.ende),
              name: d.name.trim() || null,
            },
          })),
      },
    ],
  };
}

function ZeitFelder({
  beginn,
  ende,
  optional = false,
  onChange,
}: Readonly<{
  beginn: string;
  ende: string;
  /** Labels the fields as optional. */
  optional?: boolean;
  onChange: (z: { beginn: string; ende: string }) => void;
}>) {
  return (
    <Group grow gap="xs" preventGrowOverflow={false}>
      <TextInput
        size="md"
        type="time"
        label={optional ? 'Beginn (optional)' : 'Beginn'}
        value={beginn}
        onChange={(e) => onChange({ beginn: e.currentTarget.value, ende })}
      />
      <TextInput
        size="md"
        type="time"
        label={optional ? 'Ende (optional)' : 'Ende'}
        value={ende}
        onChange={(e) => onChange({ beginn, ende: e.currentTarget.value })}
      />
    </Group>
  );
}

/** "Bedarf: mindestens 2, am liebsten 3 (Tresen, Kasse)". */
export const bedarfText = (b: { minimum: number; wunsch: number; dienstformen: string[] }) =>
  `Bedarf: mindestens ${b.minimum}, am liebsten ${b.wunsch} (${b.dienstformen.join(', ')})`;

/** Source of the event (Kategorie or Vorlage) and its Bedarf; it decides the other fields. */
export function TerminQuelleFelder({
  werte,
  onChange,
}: Readonly<{ werte: TerminWerte; onChange: (t: TerminWerte) => void }>) {
  const kategorien = useEventKategorien();
  const dienstformen = useDienstformen();
  const vorlagen = useVorlagen();
  const vorlagenListe = vorlagen.data ?? [];
  const kategorie = terminKategorie(werte, kategorien.liste, vorlagenListe);
  const vorlage =
    werte.quelle === 'vorlage' ? vorlagenListe.find((v) => v.id === werte.vorlageId) : undefined;
  const dauer: EventDauer = kategorie?.dauer ?? 'eintaegig';
  const set = <K extends keyof TerminWerte>(k: K, v: TerminWerte[K]) =>
    onChange({ ...werte, [k]: v });

  // The Bedarf of all Dienstformen of the Vorlage, shown as one.
  const vorlageBedarf = vorlage
    ? bedarfZusammen(vorlage.schichten.flatMap((s) => (s.art === 'betrieb' ? s.bedarfe : [])))
    : null;

  return (
    <Stack gap="sm">
      {/* Kategorie or Vorlage is chosen with the kind of poll before the form. */}
      {werte.quelle === 'vorlage' ? (
        <>
          <Select
            size="md"
            label="Vorlage des Events"
            placeholder="Vorlage wählen"
            required
            allowDeselect={false}
            searchable
            data={vorlagenListe
              .filter((v) => !v.archiviert)
              .map((v) => ({ value: v.id, label: vorlageTitel(v, kategorien.liste) }))}
            value={werte.vorlageId}
            onChange={(v) => set('vorlageId', v)}
          />
          {vorlage && (
            <Text size="sm" c="dimmed">
              {kategorie ? `${kategorie.name} · ` : ''}
              {dauer === 'ganztaegig'
                ? `${vorlage.tage} ${vorlage.tage === 1 ? 'Tag' : 'Tage'}`
                : `${vorlage.beginnZeit}–${vorlage.endeZeit} Uhr${vorlage.tage > 1 ? `, ${vorlage.tage} Tage` : ''}`}
              . Uhrzeiten, Schichten und Bedarf kommen aus der Vorlage, die Termine sind die
              Starttage.
            </Text>
          )}
          {vorlageBedarf && vorlageBedarf.dienstformIds.length > 0 && (
            <Text size="sm">
              {bedarfText({
                ...vorlageBedarf,
                dienstformen: vorlageBedarf.dienstformIds.map(
                  (id) => dienstformen.nachId.get(id)?.name ?? id,
                ),
              })}
              . Wer für den festgelegten Termin stimmt, wird der Reihe nach auf die Dienstformen
              verteilt.
            </Text>
          )}
        </>
      ) : (
        <Select
          size="md"
          label="Kategorie des Events"
          placeholder="Kategorie wählen"
          required
          allowDeselect={false}
          data={kategorien.aktive.map((k) => ({
            value: k.id,
            label: `${k.name} (${EVENT_ART_LABELS[k.art]}${k.dauer === 'eintaegig' ? '' : `, ${EVENT_DAUER_LABELS[k.dauer].titel.toLowerCase()}`})`,
          }))}
          value={werte.kategorieId}
          onChange={(v) => set('kategorieId', v)}
        />
      )}
      {kategorie?.art === 'teilnahme' && (
        <Text size="sm" c="dimmed">
          Wer für den festgelegten Termin gestimmt hat, wird zum Event eingeladen.
        </Text>
      )}
      {werte.quelle === 'kategorie' && kategorie?.art === 'dienste' && (
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
    </Stack>
  );
}

/** Times and the dates to choose from; what they need follows the Kategorie or Vorlage. */
export function UmfrageTerminFelder({
  werte,
  onChange,
}: Readonly<{ werte: TerminWerte; onChange: (t: TerminWerte) => void }>) {
  const kategorien = useEventKategorien();
  const vorlagen = useVorlagen();
  const kategorie = terminKategorie(werte, kategorien.liste, vorlagen.data ?? []);
  const dauer: EventDauer = kategorie?.dauer ?? 'eintaegig';
  const mitZeiten = werte.quelle === 'kategorie' && dauer !== 'ganztaegig';
  const mitBis = werte.quelle === 'kategorie' && dauer !== 'eintaegig';
  const set = <K extends keyof TerminWerte>(k: K, v: TerminWerte[K]) =>
    onChange({ ...werte, [k]: v });

  return (
    <Stack gap="sm">
      {mitZeiten && (
        <>
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
        </>
      )}

      <TerminListe
        termine={werte.termine}
        onChange={(termine) => set('termine', termine)}
        mitBis={mitBis}
        mitZeiten={mitZeiten && werte.jeTermin}
      />
    </Stack>
  );
}

/**
 * The dates of a scheduling poll, each with an optional name: a day or a range (`mitBis`), with
 * own times when `mitZeiten`.
 */
export function TerminListe({
  termine,
  onChange,
  mitBis,
  mitZeiten,
  zeitenOptional = false,
}: Readonly<{
  termine: TerminDatum[];
  onChange: (termine: TerminDatum[]) => void;
  mitBis: boolean;
  mitZeiten: boolean;
  /** Times may stay empty (scheduling without an event). */
  zeitenOptional?: boolean;
}>) {
  const setDatum = (i: number, d: Partial<TerminDatum>) =>
    onChange(termine.map((x, j) => (j === i ? { ...x, ...d } : x)));
  const letztes = termine.at(-1)?.datum || heuteBerlin();
  return (
    <Stack gap="sm">
      <Text size="sm" fw={500}>
        Mögliche Termine
      </Text>
      {termine.map((d, i) => (
        <Paper key={d.key} withBorder p="sm">
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap" align="flex-end">
              {mitBis ? (
                <ZeitraumFeld
                  style={{ flex: 1 }}
                  label={`Termin ${i + 1}`}
                  von={d.datum}
                  bis={d.bis}
                  onWert={({ von, bis }) => setDatum(i, { datum: von, bis })}
                />
              ) : (
                <DatumFeld
                  size="md"
                  style={{ flex: 1 }}
                  label={`Termin ${i + 1}`}
                  loeschbar={false}
                  value={d.datum}
                  onWert={(datum) => setDatum(i, { datum, bis: d.bis < datum ? datum : d.bis })}
                />
              )}
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                aria-label={`Termin ${i + 1} entfernen`}
                disabled={termine.length === 1}
                onClick={() => onChange(termine.filter((_, j) => j !== i))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
            {mitZeiten && (
              <ZeitFelder
                beginn={d.beginn}
                ende={d.ende}
                optional={zeitenOptional}
                onChange={(z) => setDatum(i, z)}
              />
            )}
            <TextInput
              size="md"
              label="Name (optional)"
              placeholder="z. B. StuK"
              maxLength={UMFRAGE_TERMIN_NAME_MAX}
              value={d.name}
              onChange={(e) => setDatum(i, { name: e.currentTarget.value })}
            />
          </Stack>
        </Paper>
      ))}
      <Button
        variant="default"
        leftSection={<IconPlus size={18} />}
        onClick={() => onChange([...termine, neuesDatum(tagNachher(letztes, 1), termine.at(-1))])}
      >
        Termin hinzufügen
      </Button>
    </Stack>
  );
}
