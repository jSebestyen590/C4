import { Checkbox, MultiSelect, Select, Stack, Text, Title } from '@mantine/core';
import { MITGLIED_STATI, type MitgliedStatus, type TeilnahmeKreis } from '@c4/shared';
import { labelFuer, MITGLIED_STATUS_LABELS } from './i18n';
import { mitgliedOptionen, useMitgliederListe } from './organisator';

// Participation section shared by the event form and the Vorlage editor.

export type TeilnahmeModus = 'keine' | 'eingeladen' | 'alle' | 'status';

export interface TeilnahmeWerte {
  modus: TeilnahmeModus;
  /** Statuses of the circle when `modus` is `status`. */
  status: MitgliedStatus[];
  /** Subs of the individually invited members. */
  eingeladen: string[];
}

export const keineTeilnahme = (): TeilnahmeWerte => ({
  modus: 'keine',
  status: [],
  eingeladen: [],
});

/** Form values from the stored circle (see `TeilnahmeKreis`) and the invited subs. */
export function teilnahmeWerteAus(
  kreis: TeilnahmeKreis,
  eingeladen: readonly string[] = [],
): TeilnahmeWerte {
  if (kreis === null) return keineTeilnahme();
  const modus: TeilnahmeModus =
    kreis.length === 0 ? 'eingeladen' : kreis.length === MITGLIED_STATI.length ? 'alle' : 'status';
  return { modus, status: [...kreis], eingeladen: [...eingeladen] };
}

/** The circle to send: none, nobody by status, everybody or the chosen statuses. */
export function teilnahmeKreisAus(w: TeilnahmeWerte): TeilnahmeKreis {
  switch (w.modus) {
    case 'keine':
      return null;
    case 'eingeladen':
      return [];
    case 'alle':
      return [...MITGLIED_STATI];
    case 'status':
      return w.status;
  }
}

/** Invited subs to send; only relevant when somebody is not covered by the circle anyway. */
export const eingeladeneAus = (w: TeilnahmeWerte): string[] =>
  w.modus === 'keine' || w.modus === 'alle' ? [] : w.eingeladen;

const MODUS_OPTIONEN: { value: TeilnahmeModus; label: string }[] = [
  { value: 'keine', label: 'Keine Teilnahme' },
  { value: 'alle', label: 'Alle Mitglieder' },
  { value: 'status', label: 'Nach Status' },
  { value: 'eingeladen', label: 'Niemand vorab' },
];

const MODUS_HINWEIS: Record<TeilnahmeModus, string> = {
  keine: 'Das Event hat keine Teilnahmeliste.',
  alle: 'Alle Mitglieder nehmen teil. Auch später dazukommende Mitglieder sind automatisch dabei.',
  status:
    'Mitglieder mit diesem Status nehmen teil. Auch später dazukommende Mitglieder mit passendem Status sind automatisch dabei.',
  eingeladen: 'Nur eingeladene Personen nehmen teil. Alle anderen können sich selbst eintragen.',
};

/** Who takes part by default; `mitEinladung` adds the choice of individual people (events only). */
export function TeilnahmeFelder({
  werte,
  onChange,
  mitEinladung = true,
}: Readonly<{
  werte: TeilnahmeWerte;
  onChange: (w: TeilnahmeWerte) => void;
  mitEinladung?: boolean;
}>) {
  const mitglieder = useMitgliederListe();
  return (
    <Stack gap="xs">
      <Title order={4}>Teilnahme</Title>
      <Select
        label="Wer nimmt teil?"
        allowDeselect={false}
        data={MODUS_OPTIONEN}
        value={werte.modus}
        onChange={(v) => v && onChange({ ...werte, modus: v as TeilnahmeModus })}
      />
      <Text size="sm" c="dimmed">
        {MODUS_HINWEIS[werte.modus]}
        {werte.modus !== 'keine' && ' Wer dabei ist, kann sich selbst austragen.'}
      </Text>
      {werte.modus === 'status' && (
        <Checkbox.Group
          label="Status"
          value={werte.status}
          onChange={(v) => onChange({ ...werte, status: v as MitgliedStatus[] })}
        >
          <Stack gap="xs" mt="xs">
            {MITGLIED_STATI.map((s) => (
              <Checkbox
                key={s}
                value={s}
                size="md"
                label={labelFuer(MITGLIED_STATUS_LABELS, s, 'neutral')}
              />
            ))}
          </Stack>
        </Checkbox.Group>
      )}
      {mitEinladung && (werte.modus === 'status' || werte.modus === 'eingeladen') && (
        <MultiSelect
          label="Einzelne Personen einladen"
          placeholder={werte.eingeladen.length === 0 ? 'Personen wählen' : undefined}
          searchable
          clearable
          hidePickedOptions
          nothingFoundMessage="Niemand gefunden"
          data={mitgliedOptionen(mitglieder.data ?? [])}
          value={werte.eingeladen}
          onChange={(eingeladen) => onChange({ ...werte, eingeladen })}
        />
      )}
    </Stack>
  );
}
