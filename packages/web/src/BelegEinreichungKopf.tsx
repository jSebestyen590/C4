import { Alert, Stack, Text, Textarea } from '@mantine/core';
import { BereichLink } from './BereichLink';
import { useState } from 'react';
import { centAnzeigen, type BelegEntwurfDto } from '@c4/shared';
import { BestaetigenDialog } from './BestaetigenDialog';
import { formatDatumZeit } from './datum';
import { mitgliedLink, mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';

/** Header of a draft a member submitted: who, how much they stated, the note and a name suggestion. */
export function BelegEinreichungKopf({
  entwurf,
  betragCent,
  notiz,
  rechnungsstellerName,
}: Readonly<{
  entwurf: Pick<BelegEntwurfDto, 'eingereichtVon' | 'eingereichtAm'>;
  /** What the member stated (cent). */
  betragCent: number | null;
  notiz: string;
  rechnungsstellerName: string;
}>) {
  const von = entwurf.eingereichtVon;
  return (
    <Alert color="orange" title="Eingereicht von einem Mitglied">
      <Stack gap={4}>
        <Text size="sm">
          {von ? (
            <BereichLink to={mitgliedLink(von)} underline="never">
              <StatusName status={von.status}>{mitgliedName(von)}</StatusName>
            </BereichLink>
          ) : (
            'Ein Mitglied'
          )}{' '}
          hat diesen Beleg
          {entwurf.eingereichtAm ? ` am ${formatDatumZeit(entwurf.eingereichtAm)}` : ''} als Auslage
          eingereicht.
        </Text>
        {betragCent !== null && (
          <Text size="sm">
            <Text span fw={600}>
              Genannter Betrag:
            </Text>{' '}
            {centAnzeigen(betragCent)}
          </Text>
        )}
        {rechnungsstellerName && (
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
            <Text span fw={600}>
              Rechnungssteller (Vorschlag):
            </Text>{' '}
            {rechnungsstellerName}
          </Text>
        )}
        {notiz && (
          <Text size="sm" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            <Text span fw={600}>
              Notiz:
            </Text>{' '}
            {notiz}
          </Text>
        )}
        <Text size="sm" c="dimmed">
          Prüfe den Beleg, ergänze Rechnungssteller und Posten und buche ihn. Stimmt etwas nicht,
          verwirf ihn mit einer Begründung; das Mitglied erfährt sie.
        </Text>
      </Stack>
    </Alert>
  );
}

/** Asks for the reason (required) before a submitted Beleg is discarded. */
export function BelegVerwerfenDialog({
  onClose,
  onVerwerfen,
}: Readonly<{ onClose: () => void; onVerwerfen: (grund: string) => Promise<void> }>) {
  const [grund, setGrund] = useState('');
  return (
    <BestaetigenDialog
      titel="Eingereichten Beleg verwerfen?"
      bestaetigenText="Verwerfen"
      gesperrt={grund.trim() === ''}
      onClose={onClose}
      onBestaetigt={() => onVerwerfen(grund.trim())}
    >
      <Text size="sm">
        Das Mitglied bekommt eine Nachricht mit deiner Begründung und kann den Beleg neu einreichen.
        Eine hochgeladene Datei bleibt im Archiv.
      </Text>
      <Textarea
        label="Begründung"
        description="Pflicht, das Mitglied sieht sie."
        autosize
        minRows={2}
        maxLength={500}
        value={grund}
        onChange={(e) => setGrund(e.currentTarget.value)}
        data-autofocus
      />
    </BestaetigenDialog>
  );
}
