import {
  Alert,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  RECHNUNG_TEXT_PLATZHALTER,
  RECHNUNG_TEXT_STANDARD,
  RECHNUNG_ZAHLUNGSZIEL_STANDARD,
  rechnungEinstellungenEingabeSchema,
  type RechnungEinstellungenDto,
} from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { formatDatumZeit } from '../datum';
import { FeldZeile } from '../FeldZeile';
import { jsonOderFehler, useKonten, useRechnungEinstellungen } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import { mitgliedName } from '../mitglied';
import { erloesKonten } from '../rechnungFormular';
import { StatusName } from '../StatusAnzeige';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

interface Werte {
  vereinsname: string;
  anschrift: string;
  steuernummer: string;
  ustId: string;
  bankName: string;
  iban: string;
  bic: string;
  vorstand: string;
  register: string;
  kontakt: string;
  fusstext: string;
  zahlungszielTage: string;
  erloesKontoWaren: string | null;
}

const werteVon = (e: RechnungEinstellungenDto | null | undefined): Werte => ({
  vereinsname: e?.vereinsname ?? '',
  anschrift: e?.anschrift ?? '',
  steuernummer: e?.steuernummer ?? '',
  ustId: e?.ustId ?? '',
  bankName: e?.bankName ?? '',
  iban: e?.iban ?? '',
  bic: e?.bic ?? '',
  vorstand: e?.vorstand ?? '',
  register: e?.register ?? '',
  kontakt: e?.kontakt ?? '',
  fusstext: e?.fusstext ?? RECHNUNG_TEXT_STANDARD,
  zahlungszielTage: String(e?.zahlungszielTage ?? RECHNUNG_ZAHLUNGSZIEL_STANDARD),
  erloesKontoWaren: e?.erloesKontoWaren ?? null,
});

/** The club data printed on the invoices (the newest version counts); saving adds a new version. */
export function FinanzenRechnungEinstellungenPage() {
  const einstellungen = useRechnungEinstellungen();
  return (
    <Stack maw={800}>
      <ZurueckLink to="/finanzen/rechnungen">Rechnungen</ZurueckLink>
      <Group gap={4}>
        <Title order={2}>Rechnungs-Einstellungen</Title>
        <InfoHinweis feld="Rechnungs-Einstellungen" text={HILFE.rechnungen.einstellungen} />
      </Group>
      {einstellungen.isPending && <Loader m="md" aria-label="Wird geladen" />}
      {einstellungen.isError && (
        <Alert color="red">Die Einstellungen konnten nicht geladen werden.</Alert>
      )}
      {einstellungen.data !== undefined && (
        <Formular key={einstellungen.data?.id ?? 'neu'} aktuell={einstellungen.data} />
      )}
    </Stack>
  );
}

function Formular({ aktuell }: Readonly<{ aktuell: RechnungEinstellungenDto | null }>) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const darf = can('finanzen:verwalten');
  const konten = useKonten(false);
  const [werte, setWerte] = useState(() => werteVon(aktuell));
  const [versucht, setVersucht] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const setze = <K extends keyof Werte>(feld: K, wert: Werte[K]) => {
    setGespeichert(false);
    setWerte((w) => ({ ...w, [feld]: wert }));
  };

  const eingabe = rechnungEinstellungenEingabeSchema.safeParse({
    ...werte,
    zahlungszielTage:
      werte.zahlungszielTage.trim() === '' ? undefined : Number(werte.zahlungszielTage),
  });
  const fehler = (feld: keyof Werte): string | undefined =>
    versucht && !eingabe.success
      ? eingabe.error.issues.find((i) => i.path[0] === feld)?.message
      : undefined;

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      if (!eingabe.success) throw new Error('Bitte fülle alle Pflichtfelder aus.');
      return jsonOderFehler(
        await api.finanzen['rechnung-einstellungen'].$post({ json: eingabe.data }),
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['finanzen', 'rechnungEinstellungen'] });
      setGespeichert(true);
    },
  });

  const text = (
    feld: keyof Werte,
    label: string,
    extra: { maxLength: number; optional?: boolean },
  ) => (
    <TextInput
      label={extra.optional ? `${label} (optional)` : label}
      maxLength={extra.maxLength}
      value={werte[feld] as string}
      onChange={(e) => setze(feld, e.currentTarget.value as never)}
      error={fehler(feld)}
      disabled={!darf}
    />
  );
  const mehrzeilig = (
    feld: keyof Werte,
    label: string,
    extra: { maxLength: number; optional?: boolean; beschreibung?: string },
  ) => (
    <Textarea
      label={extra.optional ? `${label} (optional)` : label}
      description={extra.beschreibung}
      autosize
      minRows={2}
      maxLength={extra.maxLength}
      value={werte[feld] as string}
      onChange={(e) => setze(feld, e.currentTarget.value as never)}
      error={fehler(feld)}
      disabled={!darf}
    />
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setVersucht(true);
        if (eingabe.success && darf) speichern.mutate();
      }}
    >
      <Stack gap="md">
        {aktuell ? (
          <Text size="sm" c="dimmed">
            Stand: {formatDatumZeit(aktuell.erstelltAm)}
            {aktuell.erstelltVon && (
              <>
                {', zuletzt geändert von '}
                <StatusName status={aktuell.erstelltVon.status}>
                  {mitgliedName(aktuell.erstelltVon)}
                </StatusName>
              </>
            )}
            . Rechnungen, die schon gestellt sind, behalten ihre Angaben.
          </Text>
        ) : (
          <Alert color="blue">
            Noch nichts hinterlegt. Ohne diese Angaben lässt sich keine Rechnung stellen.
          </Alert>
        )}
        {!darf && (
          <Alert color="gray">
            Nur mit dem Recht „Finanzen verwalten“ lassen sich die Angaben ändern.
          </Alert>
        )}
        <FeldZeile cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing={0}>
          {text('vereinsname', 'Vereinsname', { maxLength: 120 })}
          {text('steuernummer', 'Steuernummer', { maxLength: 40 })}
          {mehrzeilig('anschrift', 'Anschrift', {
            maxLength: 300,
            beschreibung: 'Mehrzeilig, wie sie auf der Rechnung stehen soll.',
          })}
          {text('ustId', 'USt-IdNr.', { maxLength: 40, optional: true })}
          {text('bankName', 'Bank', { maxLength: 120 })}
          {text('iban', 'IBAN', { maxLength: 40 })}
          {text('bic', 'BIC', { maxLength: 20 })}
          {mehrzeilig('vorstand', 'Vorstand', {
            maxLength: 300,
            beschreibung: 'z. B. „Vertreten durch: Vorname Nachname“.',
          })}
          {text('register', 'Vereinsregister', { maxLength: 200, optional: true })}
          {mehrzeilig('kontakt', 'Kontakt', { maxLength: 300, optional: true })}
        </FeldZeile>
        {mehrzeilig('fusstext', 'Text unter den Posten', {
          maxLength: 1000,
          optional: true,
          beschreibung: `Steht unter der Summe jeder Rechnung. Platzhalter: ${RECHNUNG_TEXT_PLATZHALTER.map((p) => `${p.platzhalter} (${p.beschreibung})`).join(', ')}. Leer: Standardtext.`,
        })}
        <FeldZeile cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing={0}>
          <TextInput
            label="Zahlungsziel in Tagen"
            inputMode="numeric"
            maxLength={3}
            value={werte.zahlungszielTage}
            onChange={(e) => setze('zahlungszielTage', e.currentTarget.value.replace(/\D/g, ''))}
            error={fehler('zahlungszielTage')}
            disabled={!darf}
          />
          <Select
            label="Erlös-Kategorie für Waren (optional)"
            description="Vorbelegung bei Ware-Posten."
            placeholder="Keine Vorbelegung"
            clearable
            searchable
            data={erloesKonten(konten.data ?? []).map((k) => ({ value: k.id, label: k.name }))}
            value={werte.erloesKontoWaren}
            onChange={(v) => setze('erloesKontoWaren', v)}
            disabled={!darf}
          />
        </FeldZeile>
        {speichern.isError && (
          <Alert color="red">
            {fehlerText(speichern.error, 'Das Speichern ist fehlgeschlagen.')}
          </Alert>
        )}
        {gespeichert && <Alert color="green">Die Einstellungen sind gespeichert.</Alert>}
        {versucht && !eingabe.success && (
          <Alert color="red">Bitte prüfe die markierten Felder.</Alert>
        )}
        {darf && (
          <Group>
            <Button type="submit" loading={speichern.isPending}>
              Speichern
            </Button>
          </Group>
        )}
      </Stack>
    </form>
  );
}
