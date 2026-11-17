import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  berechneZaehlung,
  centAnzeigen,
  datumAnzeigen,
  heuteBerlin,
  type ZaehlungEingabeInput,
  type ZaehlungErgebnisDto,
} from '@c4/shared';
import { useApi } from '../api';
import { HINWEIS_DAUER_MS } from '../gebuchtHinweis';
import {
  abweichungText,
  mengenLeer,
  mengenStueckelung,
  zaehlungIst,
  type Mengen,
} from '../bargeldFormular';
import { schluesselFuer } from '../buchungFormular';
import { DatumFeld } from '../DatumFeld';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { HILFE } from '../finanzenHilfe';
import {
  BETRAG_STIL,
  detailPfad,
  finanzenKeys,
  jsonOderFehler,
  useBargeld,
  zaehlungPfad,
} from '../finanzenDaten';
import { StueckelungFeld } from '../StueckelungFeld';
import { enterWeiter, useVerwerfenWarnung } from '../useVerwerfenWarnung';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/** From this difference on the user has to confirm explicitly that it is right. */
const HOHE_DIFFERENZ_CENT = 5000;

const vorzeichenBetrag = (cent: number) =>
  cent === 0 ? centAnzeigen(0) : `${cent > 0 ? '+' : '−'}${centAnzeigen(Math.abs(cent))}`;

/** Summary before saving: Soll, Ist, Differenz and the booking that follows (or none). */
function ZaehlungsZusammenfassung({
  fachName,
  datum,
  ergebnis,
  warnungen,
  laeuft,
  fehler,
  onSpeichern,
  onClose,
}: Readonly<{
  fachName: string;
  datum: string;
  ergebnis: ReturnType<typeof berechneZaehlung>;
  warnungen: readonly string[];
  laeuft: boolean;
  fehler: string | null;
  onSpeichern: () => void;
  onClose: () => void;
}>) {
  const [bestaetigt, setBestaetigt] = useState<ReadonlySet<string>>(new Set());
  const offen = warnungen.some((w) => !bestaetigt.has(w));
  const unterschiede = ergebnis.posten.filter((p) => p.differenzAnzahl !== 0);
  return (
    <Modal
      opened
      onClose={laeuft ? () => undefined : onClose}
      title="Zählung prüfen"
      size="lg"
      closeOnClickOutside={!laeuft}
    >
      <Stack>
        <Text>
          <Text span fw={600}>
            Fach:
          </Text>{' '}
          {fachName} · {datumAnzeigen(datum)}
        </Text>
        <Table tabularNums verticalSpacing={4}>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Soll (Bestand laut Buchungen)</Table.Td>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(ergebnis.sollCent)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Ist (gezählt)</Table.Td>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(ergebnis.istCent)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td fw={700}>Differenz</Table.Td>
              <Table.Td
                style={{ ...BETRAG_STIL, fontWeight: 700 }}
                c={
                  ergebnis.differenzCent === 0
                    ? undefined
                    : ergebnis.differenzCent > 0
                      ? 'teal'
                      : 'red'
                }
              >
                {vorzeichenBetrag(ergebnis.differenzCent)}
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
        {unterschiede.length > 0 && (
          <Stack gap={2}>
            <Text size="sm" fw={600}>
              Abweichungen
            </Text>
            {unterschiede.map((p) => (
              <Text key={p.nennwertCent} size="sm">
                {abweichungText(p.nennwertCent, p.differenzAnzahl)}
              </Text>
            ))}
          </Stack>
        )}
        {ergebnis.zeilen.length === 0 ? (
          <Alert color="teal">
            Es stimmt alles, es ist keine Buchung nötig. Die Zählung wird nur protokolliert.
          </Alert>
        ) : (
          <Alert color="blue" title="Daraus entsteht eine Buchung">
            {ergebnis.differenzCent === 0
              ? 'Der Betrag stimmt, nur die Stückelung weicht ab: Das Fach wird auf die gezählten Münzen und Scheine umgestellt.'
              : `Das Fach wird um ${vorzeichenBetrag(ergebnis.differenzCent)} auf den gezählten Bestand korrigiert, die Gegenbuchung geht auf „Kassendifferenz“.`}
          </Alert>
        )}
        {warnungen.length > 0 && (
          <Alert color="orange" title="Bitte prüfen">
            <Stack gap="xs">
              {warnungen.map((w) => (
                <Checkbox
                  key={w}
                  label={`${w} Das ist richtig so.`}
                  checked={bestaetigt.has(w)}
                  onChange={(e) =>
                    setBestaetigt((alt) => {
                      const neu = new Set(alt);
                      if (e.currentTarget.checked) neu.add(w);
                      else neu.delete(w);
                      return neu;
                    })
                  }
                />
              ))}
            </Stack>
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Eine gespeicherte Zählung lässt sich nicht ändern. Ein Fehler wird mit einer neuen Zählung
          (und ggf. einem Storno der Buchung) korrigiert.
        </Text>
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose} disabled={laeuft}>
            Zurück zur Eingabe
          </Button>
          <Button onClick={onSpeichern} loading={laeuft} disabled={offen || laeuft}>
            Zählung speichern
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Counting a Fach: the counted amounts are typed next to the stock (Soll) with the difference shown
 * live; saving stores the protocol and books the difference to „Kassendifferenz“.
 */
export function FinanzenBargeldZaehlenPage() {
  const api = useApi();
  const qc = useQueryClient();
  const bargeld = useBargeld();
  const [datum, setDatum] = useState(heuteBerlin());
  const [text, setText] = useState('');
  const [fach, setFach] = useState<string | null>(null);
  const [ist, setIst] = useState<Mengen>({});
  const [versucht, setVersucht] = useState(false);
  const [pruefen, setPruefen] = useState(false);
  const [gespeichert, setGespeichert] = useState<ZaehlungErgebnisDto | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fachRef = useRef<HTMLInputElement>(null);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);

  // The success message closes by itself; a new one restarts the timer.
  useEffect(() => {
    if (!gespeichert) return;
    const t = setTimeout(() => setGespeichert(null), HINWEIS_DAUER_MS);
    return () => clearTimeout(t);
  }, [gespeichert]);

  const faecher = bargeld.data?.faecher ?? [];
  const aktuell = faecher.find((f) => f.id === fach);
  const ergebnis = useMemo(
    () => (aktuell ? berechneZaehlung(aktuell.id, aktuell.bestand, mengenStueckelung(ist)) : null),
    [aktuell, ist],
  );
  const buchbar = !!aktuell && datum !== '';
  const ungespeichert = text.trim() !== '' || !mengenLeer(ist);
  const warnung = useVerwerfenWarnung(ungespeichert);

  const warnungen: string[] = [];
  if (datum > heuteBerlin()) warnungen.push('Das Datum liegt in der Zukunft.');
  if (ergebnis && Math.abs(ergebnis.differenzCent) >= HOHE_DIFFERENZ_CENT)
    warnungen.push(
      `Die Differenz ${vorzeichenBetrag(ergebnis.differenzCent)} ist ungewöhnlich hoch.`,
    );

  const body = (key: string): ZaehlungEingabeInput => ({
    idempotenzSchluessel: key,
    kontoId: fach ?? '',
    datum,
    text: text.trim() || null,
    ist: zaehlungIst(ist),
  });

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      const inhalt = JSON.stringify(body(''));
      schluessel.current = schluesselFuer(schluessel.current, inhalt, () => crypto.randomUUID());
      return jsonOderFehler<ZaehlungErgebnisDto>(
        await api.finanzen.zaehlungen.$post({ json: body(schluessel.current.schluessel) }),
      );
    },
    onSuccess: (ergebnisDto) => {
      warnung.abgeschlossen();
      schluessel.current = null;
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      setGespeichert(ergebnisDto);
      setText('');
      setIst({});
      setVersucht(false);
      setPruefen(false);
      setTimeout(() => fachRef.current?.focus(), 0);
    },
  });

  const pruefenOeffnen = () => {
    setVersucht(true);
    if (!buchbar) return;
    speichern.reset();
    // The Soll is the stock of now: reload it before the summary.
    void bargeld.refetch().then(() => setPruefen(true));
  };

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen/bargeld">Bargeld</ZurueckLink>
      <Title order={2}>Zählen</Title>
      <Text c="dimmed" size="sm">
        Zähle ein Fach durch und trage ein, was wirklich drin ist. Felder, die du leer lässt, zählen
        als 0.
      </Text>
      {gespeichert && (
        <Alert
          color="green"
          title="Zählung gespeichert"
          withCloseButton
          onClose={() => setGespeichert(null)}
        >
          <Group gap="md">
            <Text size="sm">
              {gespeichert.wiederholt ? 'Die Zählung war schon gespeichert. ' : ''}
              {gespeichert.buchungId
                ? `Buchung Nr. ${gespeichert.buchungSeq} (Differenz ${vorzeichenBetrag(gespeichert.differenzCent)}).`
                : 'Es stimmt alles, es wurde keine Buchung angelegt.'}
            </Text>
            {gespeichert.buchungId && (
              <Anchor
                component={Link}
                to={detailPfad(gespeichert.buchungId)}
                size="sm"
                onClick={() => setGespeichert(null)}
              >
                Buchung ansehen
              </Anchor>
            )}
            <Anchor
              component={Link}
              to={zaehlungPfad(gespeichert.id)}
              size="sm"
              onClick={() => setGespeichert(null)}
            >
              Zählung ansehen
            </Anchor>
          </Group>
        </Alert>
      )}
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
              <DatumFeld
                label="Datum"
                value={datum}
                onWert={setDatum}
                loeschbar={false}
                data-nav=""
              />
              <TextInput
                label={<FeldLabel text="Anmerkung" hilfe={HILFE.bargeld.zaehlprotokoll} />}
                description="Optional, wird als Buchungstext verwendet."
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                maxLength={500}
                data-nav=""
              />
            </SimpleGrid>
            {aktuell && (
              <Group gap={2}>
                <Text fw={500} size="sm">
                  Soll, Ist und Differenz
                </Text>
                <InfoHinweis feld="Soll, Ist und Differenz" text={HILFE.bargeld.zaehlenSoll} />
                <InfoHinweis feld="Kassendifferenz" text={HILFE.bargeld.zaehlenDifferenz} />
              </Group>
            )}
            {aktuell ? (
              <StueckelungFeld
                label={`Gezählte Münzen und Scheine im Fach ${aktuell.name}`}
                value={ist}
                onChange={setIst}
                bestand={aktuell.bestand}
                bestandLabel="Soll"
                differenz
              />
            ) : (
              <Text c="dimmed">Wähle ein Fach, um die Zählung einzutragen.</Text>
            )}
            <Group align="center" gap="md">
              <Button type="button" onClick={pruefenOeffnen} disabled={!buchbar}>
                Prüfen und speichern
              </Button>
              <Text size="sm" c="dimmed">
                {buchbar ? 'Tastenkürzel: Strg+Enter' : 'Noch nicht möglich: Bitte wähle ein Fach.'}
              </Text>
            </Group>
          </Stack>
        </form>
      )}
      {pruefen && aktuell && ergebnis && (
        <ZaehlungsZusammenfassung
          fachName={aktuell.name}
          datum={datum}
          ergebnis={ergebnis}
          warnungen={warnungen}
          laeuft={speichern.isPending}
          fehler={
            speichern.isError
              ? fehlerText(speichern.error, 'Das Speichern ist fehlgeschlagen.')
              : null
          }
          onSpeichern={() => speichern.mutate()}
          onClose={() => setPruefen(false)}
        />
      )}
      {warnung.dialog}
    </Stack>
  );
}
