import {
  ActionIcon,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import {
  MITGLIED_STATI,
  SCHICHT_ARTEN,
  type DienstformDto,
  type EventKategorieDto,
  type SchichtArt,
} from '@c4/shared';
import { EVENT_ART_LABELS, SCHICHT_ART_LABELS } from './i18n';
import { teilnahmeWerteAus, type TeilnahmeWerte } from './TeilnahmeFelder';
import { ZahlFeld } from './ZahlFeld';

// Shared building blocks of the event form and the Vorlage editor.

export interface BedarfForm {
  dienstformId: string | null;
  minimum: number;
  wunsch: number;
}

export interface SchichtBasis {
  /** Stable key for React, not sent to the API. */
  key: string;
  art: SchichtArt;
  /** Betrieb: the Bedarf per Dienstform. */
  bedarfe: BedarfForm[];
  /** Aufbau/Putzen: head count of the Schicht itself. */
  minimum: number | '';
  wunsch: number | '';
}

/** Field errors of one Schicht, keyed by the path inside the Schicht (`bedarfe.0.minimum`, `wunsch`, ...). */
export type SchichtFehler = Record<string, string>;

/** Defaults of a new Schicht: a Betrieb with its first (still empty) Dienstform row. */
export const neueSchichtWerte = (): Pick<
  SchichtBasis,
  'art' | 'bedarfe' | 'minimum' | 'wunsch'
> => ({
  art: 'betrieb',
  bedarfe: [{ dienstformId: null, minimum: 1, wunsch: 1 }],
  minimum: 1,
  wunsch: 2,
});

/**
 * Splits validation issues into field errors per Schicht (issues at `schichten.<i>...`) and a
 * general message for everything else.
 */
export function fehlerAusIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): {
  schichten: Record<number, SchichtFehler>;
  allgemein: string | null;
} {
  const schichten: Record<number, SchichtFehler> = {};
  let allgemein: string | null = null;
  for (const issue of issues) {
    const [kopf, index, ...rest] = issue.path;
    if (kopf === 'schichten' && typeof index === 'number' && rest.length > 0) {
      const eintrag = (schichten[index] ??= {});
      eintrag[rest.map(String).join('.')] ??= issue.message;
    } else allgemein ??= issue.message;
  }
  if (allgemein === null && Object.keys(schichten).length > 0) {
    allgemein = 'Bitte prüfe die markierten Felder.';
  }
  return { schichten, allgemein };
}

let zaehler = 0;
export const neuerKey = (): string => `neu-${++zaehler}`;

/** Begin and end time of day; an end at or before the begin means the next day. */
export function UhrzeitFelder({
  beginn,
  ende,
  onChange,
  beginnNaechsterTag = false,
  fehler,
}: Readonly<{
  beginn: string;
  ende: string;
  onChange: (zeiten: { beginnZeit: string; endeZeit: string }) => void;
  /** The begin already lies on the next day (Betrieb Schicht earlier than the event start). */
  beginnNaechsterTag?: boolean;
  fehler?: string;
}>) {
  const endeNaechsterTag = beginn !== '' && ende !== '' && ende <= beginn;
  return (
    <Stack gap={4}>
      <Group gap="xs" align="flex-end" wrap="nowrap" grow>
        <TextInput
          label={beginnNaechsterTag ? 'Beginn (nächster Tag)' : 'Beginn'}
          type="time"
          value={beginn}
          onChange={(e) => onChange({ beginnZeit: e.currentTarget.value, endeZeit: ende })}
          style={{ minWidth: 0 }}
        />
        <TextInput
          label={endeNaechsterTag ? 'Ende (nächster Tag)' : 'Ende'}
          type="time"
          value={ende}
          error={fehler}
          onChange={(e) => onChange({ beginnZeit: beginn, endeZeit: e.currentTarget.value })}
          style={{ minWidth: 0 }}
        />
      </Group>
    </Stack>
  );
}

/** Day offset relative to the event date (Vorlage, Aufbau/Putzen); negative = days before. */
export function TagVersatzFeld({
  wert,
  onChange,
  fehler,
}: Readonly<{ wert: number | ''; onChange: (v: number | '') => void; fehler?: string }>) {
  return (
    <ZahlFeld
      label="Tag relativ zum Event"
      description="0 = am Tag des Events, −1 = ein Tag davor, 2 = zwei Tage danach"
      allowDecimal={false}
      allowNegative
      min={-365}
      max={365}
      value={wert}
      error={fehler}
      onChange={(v) => onChange(typeof v === 'number' ? v : '')}
    />
  );
}

export function BedarfeEditor({
  bedarfe,
  onChange,
  dienstformen,
  fehler = {},
}: Readonly<{
  bedarfe: BedarfForm[];
  onChange: (b: BedarfForm[]) => void;
  fehler?: SchichtFehler;
  /** All Dienstformen; archived ones are only offered where they are already chosen. */
  dienstformen: DienstformDto[];
}>) {
  const benutzt = new Set(bedarfe.map((b) => b.dienstformId));
  const optionen = (aktuell: string | null) =>
    dienstformen
      .filter((d) => d.id === aktuell || (!d.archiviert && !benutzt.has(d.id)))
      .map((d) => ({ value: d.id, label: d.archiviert ? `${d.name} (archiviert)` : d.name }));
  const frei = dienstformen.find((d) => !d.archiviert && !benutzt.has(d.id));
  const aendern = (i: number, patch: Partial<BedarfForm>) =>
    onChange(bedarfe.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const zahl = (v: string | number) => (typeof v === 'number' ? v : 0);

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Bedarf je Dienstform
      </Text>
      {bedarfe.length === 0 && (
        <Text size="sm" c={fehler.bedarfe ? 'red' : 'dimmed'}>
          {fehler.bedarfe ?? 'Eine Betriebs-Schicht braucht mindestens eine Dienstform.'}
        </Text>
      )}
      {bedarfe.length > 0 && fehler.bedarfe && (
        <Text size="sm" c="red">
          {fehler.bedarfe}
        </Text>
      )}
      {bedarfe.map((b, i) => (
        <Paper key={b.dienstformId ?? `leer-${i}`} withBorder p="xs" radius="md">
          <Stack gap="xs">
            <Select
              label="Dienstform"
              placeholder="Dienstform wählen"
              data={optionen(b.dienstformId)}
              value={b.dienstformId}
              allowDeselect={false}
              error={fehler[`bedarfe.${i}.dienstformId`]}
              onChange={(v) => aendern(i, { dienstformId: v })}
            />
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <ZahlFeld
                label="Minimum"
                min={1}
                allowDecimal={false}
                allowNegative={false}
                value={b.minimum}
                error={fehler[`bedarfe.${i}.minimum`]}
                onChange={(v) => {
                  const minimum = zahl(v);
                  aendern(i, { minimum, wunsch: Math.max(b.wunsch, minimum) });
                }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <ZahlFeld
                label="Wunsch"
                min={b.minimum}
                allowDecimal={false}
                allowNegative={false}
                value={b.wunsch}
                error={fehler[`bedarfe.${i}.wunsch`]}
                onChange={(v) => aendern(i, { wunsch: zahl(v) })}
                style={{ flex: 1, minWidth: 0 }}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                aria-label="Bedarf entfernen"
                onClick={() => onChange(bedarfe.filter((_, j) => j !== i))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
          </Stack>
        </Paper>
      ))}
      <Button
        variant="light"
        leftSection={<IconPlus size={18} />}
        disabled={!frei}
        onClick={() =>
          onChange([...bedarfe, { dienstformId: frei?.id ?? null, minimum: 1, wunsch: 1 }])
        }
      >
        Dienstform hinzufügen
      </Button>
    </Stack>
  );
}

/** Minimum and Wunsch of an Aufbau/Putzen Schicht (a head count, no Dienstform). */
function AnzahlEditor({
  minimum,
  wunsch,
  onChange,
  fehler,
}: Readonly<{
  minimum: number | '';
  wunsch: number | '';
  onChange: (patch: { minimum?: number | ''; wunsch?: number | '' }) => void;
  fehler: SchichtFehler;
}>) {
  const wert = (v: string | number): number | '' => (typeof v === 'number' ? v : '');
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Anzahl Personen
      </Text>
      <Group gap="xs" align="flex-start" wrap="nowrap">
        <ZahlFeld
          label="Minimum"
          min={0}
          allowDecimal={false}
          allowNegative={false}
          value={minimum}
          error={fehler.minimum}
          onChange={(v) => {
            const neu = wert(v);
            onChange({
              minimum: neu,
              ...(neu !== '' && wunsch !== '' && wunsch < neu ? { wunsch: neu } : {}),
            });
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <ZahlFeld
          label="Wunsch"
          min={1}
          allowDecimal={false}
          allowNegative={false}
          value={wunsch}
          error={fehler.wunsch}
          onChange={(v) => onChange({ wunsch: wert(v) })}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Group>
    </Stack>
  );
}

/** Add, remove and reorder Schichten; `zeitFelder` renders the time fields of one Schicht. */
export function SchichtListeEditor<T extends SchichtBasis>({
  schichten,
  onChange,
  neu,
  zeitFelder,
  untertitel,
  dienstformen,
  fehler = {},
}: Readonly<{
  schichten: T[];
  onChange: (s: T[]) => void;
  neu: () => T;
  zeitFelder: (s: T, aendern: (patch: Partial<T>) => void, fehler: SchichtFehler) => ReactNode;
  /** Field errors per Schicht index. */
  fehler?: Record<number, SchichtFehler>;
  /** Short description of a Schicht (art + time) shown below its heading; null while incomplete. */
  untertitel?: (s: T) => string | null;
  dienstformen: DienstformDto[];
}>) {
  const aendern = (i: number, patch: Partial<T>) =>
    onChange(schichten.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const verschieben = (i: number, delta: number) => {
    const kopie = [...schichten];
    const [s] = kopie.splice(i, 1);
    kopie.splice(i + delta, 0, s!);
    onChange(kopie);
  };
  return (
    <Stack gap="sm">
      <Text fw={600}>Schichten</Text>
      {schichten.length === 0 && (
        <Text size="sm" c="dimmed">
          Noch keine Schichten.
        </Text>
      )}
      {schichten.map((s, i) => (
        <Paper key={s.key} withBorder p="sm" radius="md">
          <Stack gap="sm">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <div>
                <Text fw={600}>{i + 1}. Schicht</Text>
                {untertitel?.(s) && (
                  <Text size="sm" c="dimmed">
                    {untertitel(s)}
                  </Text>
                )}
              </div>
              <Group gap={0} wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={42}
                  aria-label="Schicht nach oben"
                  disabled={i === 0}
                  onClick={() => verschieben(i, -1)}
                >
                  <IconArrowUp size={20} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={42}
                  aria-label="Schicht nach unten"
                  disabled={i === schichten.length - 1}
                  onClick={() => verschieben(i, 1)}
                >
                  <IconArrowDown size={20} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={42}
                  aria-label="Schicht entfernen"
                  onClick={() => onChange(schichten.filter((_, j) => j !== i))}
                >
                  <IconTrash size={20} />
                </ActionIcon>
              </Group>
            </Group>
            <Select
              label="Art"
              data={SCHICHT_ARTEN.map((a) => ({ value: a, label: SCHICHT_ART_LABELS[a] }))}
              value={s.art}
              allowDeselect={false}
              onChange={(v) => {
                if (!v) return;
                const art = v as SchichtArt;
                aendern(i, {
                  art,
                  ...(art === 'betrieb' && s.bedarfe.length === 0
                    ? { bedarfe: neueSchichtWerte().bedarfe }
                    : {}),
                } as Partial<T>);
              }}
            />
            {zeitFelder(s, (patch) => aendern(i, patch), fehler[i] ?? {})}
            {s.art === 'betrieb' ? (
              <BedarfeEditor
                bedarfe={s.bedarfe}
                dienstformen={dienstformen}
                fehler={fehler[i]}
                onChange={(bedarfe) => aendern(i, { bedarfe } as Partial<T>)}
              />
            ) : (
              <AnzahlEditor
                minimum={s.minimum}
                wunsch={s.wunsch}
                fehler={fehler[i] ?? {}}
                onChange={(patch) => aendern(i, patch as Partial<T>)}
              />
            )}
          </Stack>
        </Paper>
      ))}
      <Button
        variant="light"
        leftSection={<IconPlus size={18} />}
        onClick={() => onChange([...schichten, neu()])}
      >
        Schicht hinzufügen
      </Button>
    </Stack>
  );
}

export interface KopfWerte {
  titel: string;
  beschreibung: string;
  kategorieId: string | null;
}

/** Title, description and Kategorie; shared by event and Vorlage. */
export function KopfFelder({
  werte,
  onChange,
  kategorien,
}: Readonly<{
  werte: KopfWerte;
  onChange: (w: KopfWerte) => void;
  /** All Kategorien; an archived one is only offered while it is selected. */
  kategorien: EventKategorieDto[];
}>) {
  const gewaehlt = kategorien.find((k) => k.id === werte.kategorieId);
  return (
    <Stack>
      <Stack gap={4}>
        <Select
          label="Kategorie"
          description="Die Kategorie legt fest, ob das Event Dienste oder Teilnahme hat."
          placeholder="Kategorie wählen"
          withAsterisk
          allowDeselect={false}
          data={kategorien
            .filter((k) => !k.archiviert || k.id === werte.kategorieId)
            .map((k) => ({
              value: k.id,
              label: `${k.name}${k.archiviert ? ' (archiviert)' : ''} · ${EVENT_ART_LABELS[k.art]}`,
            }))}
          value={werte.kategorieId}
          onChange={(v) => onChange({ ...werte, kategorieId: v })}
        />
        {gewaehlt && (
          <Text size="sm" c="dimmed">
            {gewaehlt.art === 'dienste'
              ? 'Dieses Event hat Schichten und Dienste.'
              : 'Dieses Event hat Teilnehmende statt Diensten.'}
          </Text>
        )}
      </Stack>
      <TextInput
        label="Titel (optional)"
        description="Ohne Titel wird der Name der Kategorie angezeigt."
        placeholder={gewaehlt?.name ?? 'Name der Kategorie'}
        value={werte.titel}
        onChange={(e) => onChange({ ...werte, titel: e.currentTarget.value })}
      />
      <Textarea
        label="Beschreibung"
        autosize
        minRows={2}
        value={werte.beschreibung}
        onChange={(e) => onChange({ ...werte, beschreibung: e.currentTarget.value })}
      />
    </Stack>
  );
}

/** Converts the form's Bedarfe to API input; a row without Dienstform becomes `''` (rejected by validation). */
export function bedarfeZuEingabe(bedarfe: BedarfForm[]) {
  return bedarfe.map((b) => ({
    dienstformId: b.dienstformId ?? '',
    minimum: b.minimum,
    wunsch: b.wunsch,
  }));
}

/** The API shape of a Schicht's Bedarf: per art either `bedarfe` or the head count. */
export function bedarfFelder(s: Pick<SchichtBasis, 'art' | 'bedarfe' | 'minimum' | 'wunsch'>) {
  return s.art === 'betrieb'
    ? { art: s.art, bedarfe: bedarfeZuEingabe(s.bedarfe) }
    : {
        art: s.art,
        minimum: s.minimum === '' ? undefined : s.minimum,
        wunsch: s.wunsch === '' ? undefined : s.wunsch,
      };
}

/**
 * Form state after the Kategorie changed: choosing a participation Kategorie preloads its default
 * circle (keeping the individually invited people).
 */
export function teilnahmeNachKategorie<
  W extends { kategorieId: string | null; teilnahme: TeilnahmeWerte },
>(alt: W, neu: W, kategorien: readonly EventKategorieDto[]): W {
  if (neu.kategorieId === alt.kategorieId) return neu;
  const k = kategorien.find((x) => x.id === neu.kategorieId);
  if (k?.art !== 'teilnahme') return neu;
  return {
    ...neu,
    teilnahme: {
      ...teilnahmeWerteAus(k.teilnahmeStatus ?? [...MITGLIED_STATI]),
      eingeladen: neu.teilnahme.eingeladen,
    },
  };
}
