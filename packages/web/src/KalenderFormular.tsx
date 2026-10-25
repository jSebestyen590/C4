import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
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
  SCHICHT_ARTEN,
  type DienstformDto,
  type EventKategorieDto,
  type SchichtArt,
} from '@c4/shared';
import { DatumFeld } from './DatumFeld';
import { SCHICHT_ART_LABELS } from './i18n';

// Shared building blocks of the event form and the Vorlage editor.

export interface BedarfForm {
  dienstformId: string | null;
  minimum: number;
  wunsch: number;
}

export interface SchichtBasis {
  /** Stable key for React, not sent to the API. */
  key: string;
  name: string;
  art: SchichtArt;
  bedarfe: BedarfForm[];
}

let zaehler = 0;
export const neuerKey = (): string => `neu-${++zaehler}`;

/** A wall clock time in Europe/Berlin as edited in the form. */
export interface Zeitpunkt {
  datum: string;
  zeit: string;
}

export function ZeitpunktFelder({
  label,
  wert,
  onChange,
  fehler,
}: Readonly<{
  label: string;
  wert: Zeitpunkt;
  onChange: (w: Zeitpunkt) => void;
  fehler?: string;
}>) {
  return (
    <Group gap="xs" align="flex-start" wrap="nowrap">
      <DatumFeld
        label={label}
        value={wert.datum}
        onWert={(datum) => onChange({ ...wert, datum })}
        error={fehler}
        loeschbar={false}
        style={{ flex: 1, minWidth: 0 }}
      />
      <TextInput
        label="Uhrzeit"
        type="time"
        value={wert.zeit}
        onChange={(e) => onChange({ ...wert, zeit: e.currentTarget.value })}
        w={120}
        style={{ flexShrink: 0 }}
      />
    </Group>
  );
}

export function BedarfeEditor({
  bedarfe,
  onChange,
  dienstformen,
}: Readonly<{
  bedarfe: BedarfForm[];
  onChange: (b: BedarfForm[]) => void;
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
        <Text size="sm" c="dimmed">
          Noch kein Bedarf. Ohne Bedarf kann sich niemand in diese Schicht eintragen.
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
              onChange={(v) => aendern(i, { dienstformId: v })}
            />
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <NumberInput
                label="Minimum"
                min={0}
                allowDecimal={false}
                allowNegative={false}
                value={b.minimum}
                onChange={(v) => {
                  const minimum = zahl(v);
                  aendern(i, { minimum, wunsch: Math.max(b.wunsch, minimum) });
                }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <NumberInput
                label="Wunsch"
                min={b.minimum}
                allowDecimal={false}
                allowNegative={false}
                value={b.wunsch}
                onChange={(v) => aendern(i, { wunsch: zahl(v) })}
                style={{ flex: 1, minWidth: 0 }}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                size={44}
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

/** Add, remove and reorder Schichten; `zeitFelder` renders the time fields of one Schicht. */
export function SchichtListeEditor<T extends SchichtBasis>({
  schichten,
  onChange,
  neu,
  zeitFelder,
  dienstformen,
}: Readonly<{
  schichten: T[];
  onChange: (s: T[]) => void;
  neu: () => T;
  zeitFelder: (s: T, aendern: (patch: Partial<T>) => void) => ReactNode;
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
              <Text fw={600}>Schicht {i + 1}</Text>
              <Group gap={0} wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={44}
                  aria-label="Schicht nach oben"
                  disabled={i === 0}
                  onClick={() => verschieben(i, -1)}
                >
                  <IconArrowUp size={20} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={44}
                  aria-label="Schicht nach unten"
                  disabled={i === schichten.length - 1}
                  onClick={() => verschieben(i, 1)}
                >
                  <IconArrowDown size={20} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={44}
                  aria-label="Schicht entfernen"
                  onClick={() => onChange(schichten.filter((_, j) => j !== i))}
                >
                  <IconTrash size={20} />
                </ActionIcon>
              </Group>
            </Group>
            <TextInput
              label="Name"
              value={s.name}
              onChange={(e) => aendern(i, { name: e.currentTarget.value } as Partial<T>)}
            />
            <Select
              label="Art"
              data={SCHICHT_ARTEN.map((a) => ({ value: a, label: SCHICHT_ART_LABELS[a] }))}
              value={s.art}
              allowDeselect={false}
              onChange={(v) => v && aendern(i, { art: v as SchichtArt } as Partial<T>)}
            />
            {zeitFelder(s, (patch) => aendern(i, patch))}
            <BedarfeEditor
              bedarfe={s.bedarfe}
              dienstformen={dienstformen}
              onChange={(bedarfe) => aendern(i, { bedarfe } as Partial<T>)}
            />
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
  /** Hours before the start; '' = off. */
  hinweisStunden: number | '';
}

/** Title, description, Kategorie and the "missing Dienste" notice; shared by event and Vorlage. */
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
  return (
    <Stack>
      <TextInput
        label="Titel"
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
      <Select
        label="Kategorie"
        placeholder="Keine Kategorie"
        clearable
        data={kategorien
          .filter((k) => !k.archiviert || k.id === werte.kategorieId)
          .map((k) => ({ value: k.id, label: k.archiviert ? `${k.name} (archiviert)` : k.name }))}
        value={werte.kategorieId}
        onChange={(v) => onChange({ ...werte, kategorieId: v })}
      />
      <NumberInput
        label="Fehlende-Dienste-Hinweis (Stunden vorher, leer = aus)"
        min={0}
        allowDecimal={false}
        allowNegative={false}
        value={werte.hinweisStunden}
        onChange={(v) => onChange({ ...werte, hinweisStunden: typeof v === 'number' ? v : '' })}
      />
    </Stack>
  );
}

/** Converts the form's Bedarfe to API input; null while a row has no Dienstform. */
export function bedarfeZuEingabe(bedarfe: BedarfForm[]) {
  if (bedarfe.some((b) => b.dienstformId === null)) return null;
  return bedarfe.map((b) => ({
    dienstformId: b.dienstformId!,
    minimum: b.minimum,
    wunsch: b.wunsch,
  }));
}
