import {
  Alert,
  Button,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { centAnzeigen, heuteBerlin, type BuchungEingabeInput } from '@c4/shared';
import { useApi } from '../api';
import { zeigeGebucht } from '../gebuchtHinweis';
import {
  mengenLeer,
  mengenStueckelung,
  stueckelungText,
  wechselnFehler,
  wechselnHinweis,
  wechselnZeilen,
  type Mengen,
} from '../bargeldFormular';
import { schluesselFuer, warnungen as buchungsWarnungen } from '../buchungFormular';
import { BuchungsZusammenfassung } from '../BuchungsZusammenfassung';
import { DatumFeld } from '../DatumFeld';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { HILFE } from '../finanzenHilfe';
import { FINANZEN_KEY, jsonOderFehler, useBargeld } from '../finanzenDaten';
import { StueckelungFeld } from '../StueckelungFeld';
import { enterWeiter, useVerwerfenWarnung } from '../useVerwerfenWarnung';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/**
 * Wechseln inside one Fach: some coins and notes go out (capped at the stock), others of the same
 * value come in. Booked as two lines on the Fach; the sums must match.
 */
export function FinanzenBargeldWechselnPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const bargeld = useBargeld();
  const [datum, setDatum] = useState(heuteBerlin());
  const [text, setText] = useState('');
  const [fach, setFach] = useState<string | null>(null);
  const [raus, setRaus] = useState<Mengen>({});
  const [rein, setRein] = useState<Mengen>({});
  const [versucht, setVersucht] = useState(false);
  const [pruefen, setPruefen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fachRef = useRef<HTMLInputElement>(null);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);

  const faecher = bargeld.data?.faecher ?? [];
  const aktuell = faecher.find((f) => f.id === fach);
  const stand = { fach, raus, rein };
  const gruende = wechselnFehler(stand, aktuell?.bestand ?? null);
  const buchbar = gruende.length === 0 && datum !== '';
  const hinweis = wechselnHinweis(stand);
  const buchText = text.trim() || `Wechseln ${aktuell?.name ?? ''}`.trim();
  const ungespeichert = text.trim() !== '' || !mengenLeer(raus) || !mengenLeer(rein);
  const warnung = useVerwerfenWarnung(ungespeichert);

  const body = (key: string): BuchungEingabeInput => ({
    idempotenzSchluessel: key,
    datum,
    text: buchText,
    quelleTyp: 'umbuchung',
    zeilen: wechselnZeilen(stand),
  });

  const buchen = useMutation({
    mutationFn: async () => {
      const inhalt = JSON.stringify(body(''));
      schluessel.current = schluesselFuer(schluessel.current, inhalt, () => crypto.randomUUID());
      return jsonOderFehler<{ id: string; seq: number; wiederholt?: boolean }>(
        await api.finanzen.buchungen.$post({ json: body(schluessel.current.schluessel) }),
      );
    },
    onSuccess: ({ id, seq, wiederholt }) => {
      warnung.abgeschlossen();
      schluessel.current = null;
      void qc.invalidateQueries({ queryKey: FINANZEN_KEY });
      zeigeGebucht(navigate, { id, seq, wiederholt });
      setText('');
      setRaus({});
      setRein({});
      setVersucht(false);
      setPruefen(false);
      setTimeout(() => fachRef.current?.focus(), 0);
    },
  });

  const pruefenOeffnen = () => {
    setVersucht(true);
    if (!buchbar) return;
    buchen.reset();
    // The stock may have changed since the page was opened.
    void bargeld.refetch().then(() => setPruefen(true));
  };

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen/bargeld">Bargeld</ZurueckLink>
      <Title order={2}>Wechseln</Title>
      <Text c="dimmed" size="sm">
        Tauscht Münzen und Scheine innerhalb eines Fachs, z. B. einen 5-€-Schein gegen fünf
        1-€-Münzen.
      </Text>
      {bargeld.isPending && <Loader m="md" aria-label="Wird geladen" />}
      {bargeld.isError && <Alert color="red">Das Bargeld konnte nicht geladen werden.</Alert>}
      {bargeld.data && (
        <form
          ref={formRef}
          noValidate
          onKeyDown={(e) => enterWeiter(e, formRef.current, pruefenOeffnen)}
          onSubmit={(e) => {
            e.preventDefault();
            pruefenOeffnen();
          }}
        >
          <Stack>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <DatumFeld
                label="Datum"
                value={datum}
                onWert={setDatum}
                loeschbar={false}
                data-nav=""
              />
              <Select
                ref={fachRef}
                selectFirstOptionOnChange
                label={<FeldLabel text="Fach" hilfe={HILFE.bargeld.fach} />}
                placeholder="Fach suchen"
                searchable
                data={faecher.map((f) => ({ value: f.id, label: f.name }))}
                value={fach}
                onChange={setFach}
                nothingFoundMessage="Kein Fach gefunden"
                error={versucht && !fach ? 'Bitte wähle ein Fach.' : undefined}
                data-nav=""
              />
              <TextInput
                label={<FeldLabel text="Buchungstext" hilfe={HILFE.buchen.text} />}
                description="Leer lassen für den Standardtext."
                placeholder={`Wechseln ${aktuell?.name ?? ''}`.trim()}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                maxLength={500}
                data-nav=""
              />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
              <Stack gap={4}>
                <Group gap={2}>
                  <Text fw={500}>Raus (aus dem Fach)</Text>
                  <InfoHinweis feld="Raus" text={HILFE.bargeld.wechselnRaus} />
                </Group>
                <StueckelungFeld
                  label="Herausgenommene Münzen und Scheine"
                  value={raus}
                  onChange={setRaus}
                  bestand={aktuell?.bestand}
                  begrenzen={!!aktuell}
                />
              </Stack>
              <Stack gap={4}>
                <Group gap={2}>
                  <Text fw={500}>Rein (ins Fach)</Text>
                  <InfoHinweis feld="Rein" text={HILFE.bargeld.wechselnRein} />
                </Group>
                <StueckelungFeld
                  label="Hineingelegte Münzen und Scheine"
                  value={rein}
                  onChange={setRein}
                />
              </Stack>
            </SimpleGrid>
            {hinweis && (
              <Alert color={mengenLeer(raus) && mengenLeer(rein) ? 'gray' : 'orange'} role="status">
                {hinweis}
              </Alert>
            )}
            <Group align="center" gap="md">
              <Button type="button" onClick={pruefenOeffnen} disabled={!buchbar}>
                Prüfen und buchen
              </Button>
              {buchbar ? (
                <Text size="sm" c="dimmed">
                  Tastenkürzel: Strg+Enter
                </Text>
              ) : (
                <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 200 }}>
                  Noch nicht möglich: {gruende[0] ?? 'Bitte gib ein Datum an.'}
                </Text>
              )}
            </Group>
          </Stack>
        </form>
      )}
      {pruefen && (
        <BuchungsZusammenfassung
          datum={datum}
          text={buchText}
          zeilen={wechselnZeilen(stand).map((z, i) => ({
            key: i,
            konto: `${aktuell?.name ?? ''} (${i === 0 ? 'raus' : 'rein'})`,
            betragCent: z.betragCent,
          }))}
          extra={
            <Stack gap={2}>
              <Text size="sm">Raus: {stueckelungText(mengenStueckelung(raus))}</Text>
              <Text size="sm">Rein: {stueckelungText(mengenStueckelung(rein))}</Text>
              <Text size="sm" c="dimmed">
                Der Bestand des Fachs ändert sich um 0,00 €, nur die Stückelung wechselt (
                {centAnzeigen(wechselnZeilen(stand)[1]?.betragCent ?? 0)} getauscht).
              </Text>
            </Stack>
          }
          warnungen={buchungsWarnungen(
            { datum, text: buchText },
            { modus: 'umbuchung', von: null, nach: null, betrag: null, zeilen: [] },
            heuteBerlin(),
          )}
          laeuft={buchen.isPending}
          fehler={
            buchen.isError ? fehlerText(buchen.error, 'Das Buchen ist fehlgeschlagen.') : null
          }
          onBuchen={() => buchen.mutate()}
          onClose={() => setPruefen(false)}
        />
      )}
      {warnung.dialog}
    </Stack>
  );
}
