import { Select, Stack, Textarea, TextInput } from '@mantine/core';
import { useMemo } from 'react';
import { DatumFeld } from './DatumFeld';
import { zeitpunktIso } from './BuchungsFuss';
import { mitgliedOptionen, useMitgliederListe } from './organisator';

export interface AusleiheKopf {
  an: string;
  /** `sub` of the organising Mitglied; empty until chosen. */
  organisiertVon: string;
  /** `datetime-local` value. */
  zeitpunkt: string;
  /** `YYYY-MM-DD`; required, empty until chosen. */
  rueckgabe: string;
  kommentar: string;
}

/** Header fields of an Ausleihe: to whom, organiser, when, planned return day (required) and Kommentar. */
export function AusleiheKopfFelder({
  kopf,
  onChange,
  autofocus,
  rueckgabeFehler,
}: Readonly<{
  kopf: AusleiheKopf;
  onChange: (teil: Partial<AusleiheKopf>) => void;
  autofocus?: boolean;
  /** Validation message under the return date. */
  rueckgabeFehler?: string | null;
}>) {
  const mitglieder = useMitgliederListe();
  const optionen = useMemo(() => mitgliedOptionen(mitglieder.data ?? []), [mitglieder.data]);
  return (
    <Stack gap="sm">
      <TextInput
        label="An wen?"
        placeholder="z. B. Feuerwehr Musterdorf"
        maxLength={200}
        data-autofocus={autofocus ? true : undefined}
        value={kopf.an}
        onChange={(e) => onChange({ an: e.currentTarget.value })}
      />
      <Select
        label="Organisiert von"
        placeholder="Mitglied suchen"
        searchable
        allowDeselect={false}
        inputMode="text"
        nothingFoundMessage="Kein Mitglied gefunden"
        data={optionen}
        value={kopf.organisiertVon || null}
        error={mitglieder.isError ? 'Die Mitglieder konnten nicht geladen werden.' : undefined}
        onChange={(v) => onChange({ organisiertVon: v ?? '' })}
      />
      <TextInput
        label="Zeitpunkt"
        type="datetime-local"
        value={kopf.zeitpunkt}
        error={zeitpunktIso(kopf.zeitpunkt) === null ? 'Ungültiger Zeitpunkt.' : undefined}
        styles={{ input: { minWidth: 0 } }}
        onChange={(e) => onChange({ zeitpunkt: e.currentTarget.value })}
      />
      <DatumFeld
        label="Geplante Rückgabe"
        withAsterisk
        error={rueckgabeFehler ?? undefined}
        value={kopf.rueckgabe}
        styles={{ input: { minWidth: 0 } }}
        onWert={(rueckgabe) => onChange({ rueckgabe })}
      />
      <Textarea
        label="Kommentar (optional)"
        autosize
        minRows={2}
        maxLength={500}
        value={kopf.kommentar}
        onChange={(e) => onChange({ kommentar: e.currentTarget.value })}
      />
    </Stack>
  );
}
