import { Stack, Textarea, TextInput } from '@mantine/core';
import { DatumFeld } from './DatumFeld';
import { zeitpunktIso } from './BuchungsFuss';

export interface AusleiheKopf {
  an: string;
  /** `datetime-local` value. */
  zeitpunkt: string;
  /** `YYYY-MM-DD` or empty. */
  rueckgabe: string;
  kommentar: string;
}

/** Header fields of an Ausleihe: to whom, when, planned return date and Kommentar. */
export function AusleiheKopfFelder({
  kopf,
  onChange,
  autofocus,
}: Readonly<{
  kopf: AusleiheKopf;
  onChange: (teil: Partial<AusleiheKopf>) => void;
  autofocus?: boolean;
}>) {
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
      <TextInput
        label="Zeitpunkt"
        type="datetime-local"
        value={kopf.zeitpunkt}
        error={zeitpunktIso(kopf.zeitpunkt) === null ? 'Ungültiger Zeitpunkt.' : undefined}
        styles={{ input: { minWidth: 0 } }}
        onChange={(e) => onChange({ zeitpunkt: e.currentTarget.value })}
      />
      <DatumFeld
        label="Geplante Rückgabe (optional)"
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
