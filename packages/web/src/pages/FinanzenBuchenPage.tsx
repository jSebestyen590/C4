import {
  ActionIcon,
  Alert,
  Button,
  Group,
  List,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { heuteBerlin } from '@c4/shared';
import { useApi } from '../api';
import {
  buchungBody,
  formularFehler,
  freieZeilen,
  leereZeile,
  summeCent,
  summeText,
  type FormularModus,
  type FreieZeile,
  type Seite,
} from '../buchungFormular';
import { CentFeld } from '../CentFeld';
import { DatumFeld } from '../DatumFeld';
import {
  detailPfad,
  FINANZEN_KEY,
  jsonOderFehler,
  kontoOptionen,
  useKonten,
} from '../finanzenDaten';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const SEGMENT_STIL = { label: { minHeight: 36, display: 'grid', placeItems: 'center' } };

/** Create a booking: a simple Umbuchung between two accounts, or a free booking with any number of lines. */
export function FinanzenBuchenPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const konten = useKonten(false);
  const [datum, setDatum] = useState(heuteBerlin());
  const [text, setText] = useState('');
  const [modus, setModus] = useState<FormularModus>('umbuchung');
  const [von, setVon] = useState<string | null>(null);
  const [an, setAn] = useState<string | null>(null);
  const [betrag, setBetrag] = useState<number | string>('');
  const [zeilen, setZeilen] = useState<FreieZeile[]>(() => [
    leereZeile('soll'),
    leereZeile('haben'),
  ]);
  const [versucht, setVersucht] = useState(false);

  // Accounts with a Stückelung need denominations, which come with a later slice.
  const wahl = useMemo(
    () => (konten.data ?? []).filter((k) => !k.archiviert && !k.stueckelung),
    [konten.data],
  );
  const optionen = kontoOptionen(wahl);
  const hatStueckelung = (konten.data ?? []).some((k) => !k.archiviert && k.stueckelung);

  const stand = { modus, von, an, betrag, zeilen };
  const fehler = formularFehler(stand, wahl);
  const summe = summeCent(freieZeilen(zeilen));

  const buchen = useMutation({
    mutationFn: async () =>
      jsonOderFehler<{ id: string }>(
        await api.finanzen.buchungen.$post({ json: buchungBody({ datum, text }, stand) }),
      ),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: FINANZEN_KEY });
      void navigate(detailPfad(id));
    },
  });

  const aendere = (key: number, teil: Partial<FreieZeile>) =>
    setZeilen((alt) => alt.map((z) => (z.key === key ? { ...z, ...teil } : z)));

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setVersucht(true);
    if (text.trim() === '' || !datum || fehler.length > 0) return;
    buchen.mutate();
  };

  const textFehler =
    versucht && text.trim() === '' ? 'Bitte gib einen Buchungstext ein.' : undefined;

  return (
    <Stack maw={700}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Title order={2}>Buchen</Title>
      {konten.isPending && <Loader m="md" aria-label="Konten werden geladen" />}
      {konten.isError && <Alert color="red">Die Konten konnten nicht geladen werden.</Alert>}
      {konten.data && (
        <form onSubmit={onSubmit}>
          <Stack>
            <SegmentedControl
              fullWidth
              size="md"
              aria-label="Art der Buchung"
              value={modus}
              onChange={(v) => setModus(v as FormularModus)}
              styles={SEGMENT_STIL}
              data={[
                { value: 'umbuchung', label: 'Umbuchung' },
                { value: 'frei', label: 'Frei' },
              ]}
            />
            <DatumFeld label="Datum" value={datum} onWert={setDatum} loeschbar={false} />
            <TextInput
              label="Buchungstext"
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              maxLength={500}
              error={textFehler}
            />

            {modus === 'umbuchung' ? (
              <Stack>
                <Select
                  label="Von Konto"
                  placeholder="Konto wählen"
                  searchable
                  data={optionen}
                  value={von}
                  onChange={setVon}
                  nothingFoundMessage="Kein Konto gefunden"
                />
                <Select
                  label="An Konto"
                  placeholder="Konto wählen"
                  searchable
                  data={optionen}
                  value={an}
                  onChange={setAn}
                  nothingFoundMessage="Kein Konto gefunden"
                />
                <CentFeld label="Betrag" value={betrag} onChange={setBetrag} />
              </Stack>
            ) : (
              <Stack>
                {zeilen.map((z, i) => (
                  <Paper key={z.key} withBorder p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between" wrap="nowrap">
                        <Text fw={600}>Zeile {i + 1}</Text>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size={44}
                          aria-label={`Zeile ${i + 1} entfernen`}
                          disabled={zeilen.length <= 2}
                          onClick={() => setZeilen((alt) => alt.filter((x) => x.key !== z.key))}
                        >
                          <IconTrash size={20} />
                        </ActionIcon>
                      </Group>
                      <Select
                        aria-label={`Konto der Zeile ${i + 1}`}
                        placeholder="Konto wählen"
                        searchable
                        data={optionen}
                        value={z.kontoId}
                        onChange={(v) => aendere(z.key, { kontoId: v })}
                        nothingFoundMessage="Kein Konto gefunden"
                      />
                      <SegmentedControl
                        fullWidth
                        size="md"
                        aria-label={`Seite der Zeile ${i + 1}`}
                        value={z.seite}
                        onChange={(v) => aendere(z.key, { seite: v as Seite })}
                        styles={SEGMENT_STIL}
                        data={[
                          { value: 'soll', label: 'Soll (+)' },
                          { value: 'haben', label: 'Haben (−)' },
                        ]}
                      />
                      <CentFeld
                        aria-label={`Betrag der Zeile ${i + 1}`}
                        value={z.betrag}
                        onChange={(v) => aendere(z.key, { betrag: v })}
                      />
                    </Stack>
                  </Paper>
                ))}
                <Button
                  variant="default"
                  leftSection={<IconPlus size={18} />}
                  disabled={zeilen.length >= 50}
                  onClick={() =>
                    setZeilen((alt) => [...alt, leereZeile(summe > 0 ? 'haben' : 'soll')])
                  }
                >
                  Zeile hinzufügen
                </Button>
                <Text fw={600} c={summe === 0 ? 'teal' : undefined} aria-live="polite">
                  {summeText(summe)}
                </Text>
              </Stack>
            )}

            {hatStueckelung && (
              <Text size="sm" c="dimmed">
                Konten mit Stückelung (z. B. der Tresor) stehen hier noch nicht zur Auswahl.
                Buchungen von Bargeld mit Scheinen und Münzen kommen mit einem späteren Schritt.
              </Text>
            )}
            {versucht && fehler.length > 0 && (
              <Alert color="red" title="Die Buchung ist noch nicht vollständig">
                <List size="sm" spacing={4}>
                  {fehler.map((f) => (
                    <List.Item key={f}>{f}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            {buchen.isError && (
              <Alert color="red">
                {fehlerText(buchen.error, 'Das Buchen ist fehlgeschlagen.')}
              </Alert>
            )}
            <Button type="submit" loading={buchen.isPending}>
              Buchen
            </Button>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
