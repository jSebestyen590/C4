import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  berechneKassenabrechnung,
  centAnzeigen,
  datumAnzeigen,
  eventEinnahmenVorschlag,
  heuteBerlin,
  muenzrolle,
  NENNWERTE_CENT,
  nachschubVorschlag,
  pruefeBestand,
  rollenText,
  transferVorschlag,
  type BargeldFachDto,
  type KassenabrechnungEingabeInput,
  type KassenabrechnungErgebnisDto,
  type KassenabrechnungVorschauDto,
} from '@c4/shared';
import { useApi } from '../api';
import { BetragFeld } from '../BetragFeld';
import { mengenLeer, mengenStueckelung, stueckelungMengen, type Mengen } from '../bargeldFormular';
import { schluesselFuer } from '../buchungFormular';
import { DatumFeld } from '../DatumFeld';
import {
  BETRAG_STIL,
  detailPfad,
  finanzenKeys,
  jsonOderFehler,
  kassenabrechnungPfad,
  useBargeld,
  useKassenAbrechnungVorschau,
  useKonten,
} from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import {
  abrechnungsMatrix,
  eventBetraegeMit,
  matrixNennwerte,
  type MatrixZeile,
  faecherAlsBestand,
  fehlbestandJe,
  transfersBody,
  zielBestandMitNachschub,
  type NachschubMap,
} from '../kassenFormular';
import { entwurfBasis, entwurfLesen, entwurfLoeschen, entwurfSchreiben } from '../kassenEntwurf';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { enterWeiter, useVerwerfenWarnung } from '../useVerwerfenWarnung';
import { fehlerText } from '../warenApi';
import { ZahlFeld } from '../ZahlFeld';
import { ZurueckLink } from '../ZurueckLink';

const ZAHL = new Intl.NumberFormat('de-DE');

/** A count field of the table: digits only (a leading minus where the count may be negative). */
function AnzahlFeld({
  label,
  wert,
  onWert,
  vorzeichen = false,
  fehler,
}: Readonly<{
  label: string;
  wert: number | null | undefined;
  onWert: (w: number | null) => void;
  vorzeichen?: boolean;
  fehler?: boolean;
}>) {
  const anzeige =
    wert === null || wert === undefined ? '' : Object.is(wert, -0) ? '-' : String(wert);
  return (
    <TextInput
      aria-label={label}
      value={anzeige}
      inputMode={vorzeichen ? 'text' : 'numeric'}
      autoComplete="off"
      maxLength={9}
      placeholder="0"
      data-nav=""
      error={fehler}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const roh = e.currentTarget.value;
        const ziffern = roh.replace(/\D/g, '');
        const minus = vorzeichen && /^\s*[-−]/.test(roh);
        onWert(ziffern === '' ? (minus ? -0 : null) : (minus ? -1 : 1) * Number(ziffern));
      }}
      styles={{
        input: {
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 'max(16px, 1rem)',
          minWidth: 88,
        },
      }}
    />
  );
}

/** Missing coins of one denomination: choose a Fach and bring whole rolls into the Ziel-Fach. */
function NachschubZeile({
  nennwert,
  fehlt,
  wahl,
  quellen,
  onWahl,
  onVorschlag,
}: Readonly<{
  nennwert: number;
  fehlt: number;
  wahl: NachschubMap[number];
  quellen: readonly BargeldFachDto[];
  onWahl: (w: NachschubMap[number]) => void;
  onVorschlag: () => void;
}>) {
  const rolle = muenzrolle(nennwert);
  const bestandIn = (f: BargeldFachDto | undefined) =>
    f?.bestand.find((b) => b.nennwertCent === nennwert)?.anzahl ?? 0;
  const quelle = quellen.find((f) => f.id === wahl?.fachId);
  const vorrat = bestandIn(quelle);
  const ganzeMoeglich = !!rolle && vorrat >= rolle;
  const stueck = wahl?.stueck ?? 0;
  const rollen = rolle && stueck % rolle === 0 ? stueck / rolle : null;
  return (
    <Stack gap="xs">
      {fehlt > 0 && (
        <Text size="sm" c="orange.8" fw={600}>
          Es fehlen {ZAHL.format(fehlt)} × {centAnzeigen(nennwert)} im Ziel-Fach.
        </Text>
      )}
      {!wahl && (
        <Stack gap={4}>
          <Group gap="xs">
            <Button type="button" variant="default" size="sm" onClick={onVorschlag}>
              {rolle ? 'Münzrollen ins Ziel-Fach holen' : 'Aus einem anderen Fach holen'}
            </Button>
            <InfoHinweis feld="Fehlbestand" text={HILFE.kassen.fehlbestand} />
          </Group>
          <Text size="xs" c="dimmed">
            Oder lass es so: Die Kasse geht diesmal mit weniger raus, der Grundbestand bleibt
            unverändert (du bestätigst das beim Prüfen).
          </Text>
        </Stack>
      )}
      {wahl && (
        <Group align="flex-end" gap="md" wrap="wrap">
          <Select
            label="Aus Fach"
            data={quellen.map((f) => ({
              value: f.id,
              label: `${f.name} (${ZAHL.format(bestandIn(f))} × ${centAnzeigen(nennwert)})`,
            }))}
            value={wahl.fachId}
            onChange={(v) => onWahl({ fachId: v, stueck: wahl.stueck })}
            w={{ base: '100%', sm: 280 }}
            comboboxProps={{ width: 'target', withinPortal: true }}
            nothingFoundMessage="Kein Fach"
            searchable
          />
          {ganzeMoeglich && rolle ? (
            <ZahlFeld
              label={`Rollen à ${rolle} Stück`}
              value={rollen ?? Math.ceil(stueck / rolle)}
              onChange={(v) =>
                onWahl({
                  fachId: wahl.fachId,
                  stueck: Math.min(Math.max(0, Number(v) || 0) * rolle, vorrat),
                })
              }
              min={0}
              max={Math.floor(vorrat / rolle)}
              w={{ base: '100%', sm: 190 }}
            />
          ) : (
            <ZahlFeld
              label="Stück (keine ganze Rolle)"
              value={stueck}
              onChange={(v) =>
                onWahl({
                  fachId: wahl.fachId,
                  stueck: Math.min(Math.max(0, Number(v) || 0), vorrat),
                })
              }
              min={0}
              max={vorrat}
              w={{ base: '100%', sm: 190 }}
            />
          )}
          <Text size="sm" pb={10}>
            {rollenText(nennwert, stueck)}
            {rolle && !ganzeMoeglich && quelle ? ' · keine ganze Rolle im Fach' : ''}
          </Text>
          <Button
            type="button"
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => onWahl(undefined)}
          >
            Entfernen
          </Button>
        </Group>
      )}
    </Stack>
  );
}

/** Summary before booking: the booking lines, the figures and the warnings to confirm. */
function Zusammenfassung({
  rechnung,
  matrix,
  erloesKontoId,
  warnungen,
  kontoName,
  datum,
  kasseName,
  laeuft,
  fehler,
  onBuchen,
  onClose,
}: Readonly<{
  rechnung: ReturnType<typeof berechneKassenabrechnung>;
  matrix: readonly MatrixZeile[];
  erloesKontoId: string;
  warnungen: readonly string[];
  kontoName: (id: string) => string;
  datum: string;
  kasseName: string;
  laeuft: boolean;
  fehler: string | null;
  onBuchen: () => void;
  onClose: () => void;
}>) {
  const [bestaetigt, setBestaetigt] = useState<ReadonlySet<string>>(new Set());
  const offen = warnungen.some((w) => !bestaetigt.has(w));
  const nennwerte = matrixNennwerte(matrix);
  const erloesZeile = rechnung.zeilen.find((z) => z.kontoId === erloesKontoId);
  return (
    <Modal
      opened
      onClose={laeuft ? () => undefined : onClose}
      title="Abrechnung prüfen"
      size="xl"
      closeOnClickOutside={!laeuft}
    >
      <Stack>
        <Text>
          <Text span fw={600}>
            Kasse:
          </Text>{' '}
          {kasseName} · {datumAnzeigen(datum)}
        </Text>
        <Table tabularNums verticalSpacing={4}>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Bestand laut Buchhaltung</Table.Td>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(rechnung.sollCent)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Gezählt (Ist)</Table.Td>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(rechnung.istCent)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td fw={700}>Einnahme</Table.Td>
              <Table.Td style={{ ...BETRAG_STIL, fontWeight: 700 }}>
                {centAnzeigen(rechnung.einnahmeCent)}
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Davon auf Events verteilt</Table.Td>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(rechnung.eventSummeCent)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Fehler ohne Event</Table.Td>
              <Table.Td
                style={BETRAG_STIL}
                c={rechnung.fehlerCent === 0 ? undefined : 'orange.8'}
                fw={rechnung.fehlerCent === 0 ? 400 : 700}
              >
                {centAnzeigen(rechnung.fehlerCent)}
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
        {rechnung.zeilen.length === 0 ? (
          <Alert color="teal">
            Es stimmt alles, es ist keine Buchung nötig. Die Abrechnung wird nur protokolliert.
          </Alert>
        ) : (
          <Stack gap="xs">
            <Text fw={600}>Daraus entsteht eine Buchung („Kassenabrechnung“)</Text>
            {erloesZeile && (
              <Text size="sm">
                {kontoName(erloesZeile.kontoId)}: {centAnzeigen(erloesZeile.betragCent)}
                {erloesZeile.steuerArt === 'ust' &&
                  ` (Umsatzsteuer ${(erloesZeile.steuersatz ?? 0) / 100} %: netto ${centAnzeigen(erloesZeile.nettoCent ?? 0)}, Steuer ${centAnzeigen(erloesZeile.steuerCent ?? 0)})`}
              </Text>
            )}
            <Box visibleFrom="md">
              <Table tabularNums verticalSpacing={4} withRowBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th />
                    {nennwerte.map((n) => (
                      <Table.Th key={n} style={BETRAG_STIL}>
                        {centAnzeigen(n)}
                      </Table.Th>
                    ))}
                    <Table.Th style={BETRAG_STIL}>Summe</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {matrix.map((z) => (
                    <Table.Tr key={z.key}>
                      <Table.Td>{z.label}</Table.Td>
                      {nennwerte.map((n) => (
                        <Table.Td
                          key={n}
                          style={BETRAG_STIL}
                          c={
                            (z.werte[n] ?? 0) < 0
                              ? 'red'
                              : (z.werte[n] ?? 0) === 0
                                ? 'dimmed'
                                : undefined
                          }
                        >
                          {z.werte[n] ? ZAHL.format(z.werte[n]!) : '–'}
                        </Table.Td>
                      ))}
                      <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>
                        {centAnzeigen(z.summeCent)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
            <Stack gap="xs" hiddenFrom="md">
              {matrix.map((z) => (
                <Paper key={z.key} withBorder p="sm">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Text fw={600} size="sm">
                      {z.label}
                    </Text>
                    <Text fw={600} size="sm" style={BETRAG_STIL}>
                      {centAnzeigen(z.summeCent)}
                    </Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {nennwerte
                      .filter((n) => z.werte[n])
                      .map((n) => `${ZAHL.format(z.werte[n]!)} × ${centAnzeigen(n)}`)
                      .join(' · ') || 'leer'}
                  </Text>
                </Paper>
              ))}
            </Stack>
          </Stack>
        )}
        {warnungen.length > 0 && (
          <Alert color="orange" title="Bitte prüfen">
            <Stack gap="xs">
              {warnungen.map((w) => (
                <Checkbox
                  key={w}
                  label={`${w} Das ist richtig so.`}
                  checked={bestaetigt.has(w)}
                  onChange={(e) => {
                    const an = e.currentTarget.checked;
                    setBestaetigt((alt) => {
                      const neu = new Set(alt);
                      if (an) neu.add(w);
                      else neu.delete(w);
                      return neu;
                    });
                  }}
                />
              ))}
            </Stack>
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Eine gespeicherte Abrechnung lässt sich nicht ändern. Zum Korrigieren stornierst du die
          Buchung im Journal.
        </Text>
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose} disabled={laeuft}>
            Zurück zur Eingabe
          </Button>
          <Button onClick={onBuchen} loading={laeuft} disabled={offen || laeuft}>
            Abrechnen und buchen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function AbrechnenFormular({
  vorschau,
  faecher,
  kontoNamen,
  erloesOptionen,
  steuersaetze,
}: Readonly<{
  vorschau: KassenabrechnungVorschauDto;
  faecher: readonly BargeldFachDto[];
  kontoNamen: ReadonlyMap<string, string>;
  erloesOptionen: readonly { value: string; label: string }[];
  steuersaetze: ReadonlyMap<string, number | null>;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const { kasse } = vorschau;
  const navigate = useNavigate();
  const basis = entwurfBasis({
    saldoCent: kasse.saldoCent,
    letzteAbrechnungId: kasse.letzteAbrechnung?.id ?? null,
    zaehlungIds: vorschau.zaehlungen.map((z) => z.id),
  });
  // A draft of this Kasse survives a reload; one that no longer fits the preview is dropped with a hint.
  const [gelesen] = useState(() => entwurfLesen(window.localStorage, kasse.kontoId, basis));
  const e0 = gelesen.art === 'entwurf' ? gelesen.entwurf : null;
  const [entwurfVerworfen, setEntwurfVerworfen] = useState(gelesen.art === 'verworfen');
  const [datum, setDatum] = useState(e0?.datum ?? heuteBerlin());
  const [ist, setIst] = useState<Mengen>(e0?.ist ?? {});
  const [erloesWahl, setErloesWahl] = useState<string | null>(e0?.erloesWahl ?? null);
  const [zielWahl, setZielWahl] = useState<string | null>(e0?.zielWahl ?? null);
  const [transferEingabe, setTransferEingabe] = useState<Mengen | null>(
    e0?.transferEingabe ?? null,
  );
  const [nachschub, setNachschub] = useState<NachschubMap>(e0?.nachschub ?? {});
  const [eventEingabe, setEventEingabe] = useState<Record<string, number | null>>(
    e0?.eventEingabe ?? {},
  );
  const [pruefen, setPruefen] = useState(false);
  const [gespeichert, setGespeichert] = useState<KassenabrechnungErgebnisDto | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(e0?.schluessel ?? null);
  const verlassen = useRef(false);

  const eingabenVerwerfen = () => {
    entwurfLoeschen(window.localStorage, kasse.kontoId);
    schluessel.current = null;
    setDatum(heuteBerlin());
    setIst({});
    setErloesWahl(null);
    setZielWahl(null);
    setTransferEingabe(null);
    setNachschub({});
    setEventEingabe({});
    setEntwurfVerworfen(false);
  };

  const erloesId = erloesWahl ?? kasse.standardErloesKonto.id;
  const zielId = zielWahl ?? kasse.standardZielFach.id;
  const zielFach = faecher.find((f) => f.id === zielId);
  const quellen = faecher.filter((f) => f.id !== kasse.kontoId && f.id !== zielId);

  const istListe = useMemo(() => mengenStueckelung(ist), [ist]);
  const zielMitNachschub = zielBestandMitNachschub(zielFach?.bestand ?? [], nachschub);
  const vorschlag = transferVorschlag(istListe, kasse.grundbestand, zielMitNachschub);
  const transfer: Mengen = transferEingabe ?? stueckelungMengen(vorschlag.transfer);
  const fehlt = fehlbestandJe(ist, kasse.grundbestand, transfer);
  const transfers = transfersBody(zielId, transfer, nachschub);

  const eventVorschlag = eventEinnahmenVorschlag(
    kasse.saldoCent,
    vorschau.zaehlungen.map((z) => ({
      eventId: z.eventId,
      zaehlungId: z.id,
      summeCent: z.summeCent,
      gezaehltAm: z.gezaehltAm,
      eventBeginn: z.eventBeginn,
    })),
  );
  const events = eventBetraegeMit(eventVorschlag, eventEingabe);

  const rechnung = useMemo(
    () =>
      berechneKassenabrechnung({
        kasse: { id: kasse.kontoId, name: kasse.name },
        bestand: kasse.bestand,
        grundbestand: kasse.grundbestand,
        ist: istListe,
        transfers,
        erloesKonto: { id: erloesId, steuersatzStandard: steuersaetze.get(erloesId) ?? null },
        zielFachId: zielId,
        events,
      }),
    // `transfers` and `events` are rebuilt every render; their inputs are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      kasse,
      istListe,
      transferEingabe,
      nachschub,
      zielId,
      erloesId,
      steuersaetze,
      eventEingabe,
      vorschau,
    ],
  );
  const matrix = abrechnungsMatrix({
    ist: istListe,
    transfers,
    zielFach: zielFach ?? { id: zielId, name: kontoNamen.get(zielId) ?? zielId, bestand: [] },
    quellen: quellen.map((f) => ({ id: f.id, name: f.name, bestand: f.bestand })),
  });
  const bestandFehler = useMemo(
    () =>
      rechnung.zeilen.length > 0 ? pruefeBestand(rechnung.zeilen, faecherAlsBestand(faecher)) : [],
    [rechnung, faecher],
  );
  const warnungen = [
    ...rechnung.warnungen,
    ...(datum > heuteBerlin() ? ['Das Datum liegt in der Zukunft.'] : []),
  ];
  const zielFehlt = zielId === kasse.kontoId;
  const buchbar = datum !== '' && !zielFehlt && bestandFehler.length === 0 && !!erloesId;
  const ungespeichert = !mengenLeer(ist);
  const verwerfen = useVerwerfenWarnung(ungespeichert);

  // Every change is kept in the draft (not after a successful booking, which clears it).
  useEffect(() => {
    if (verlassen.current) return;
    if (
      mengenLeer(ist) &&
      !transferEingabe &&
      Object.keys(nachschub).length === 0 &&
      Object.keys(eventEingabe).length === 0
    ) {
      entwurfLoeschen(window.localStorage, kasse.kontoId);
      return;
    }
    entwurfSchreiben(window.localStorage, kasse.kontoId, {
      v: 1,
      basis,
      datum,
      ist,
      erloesWahl,
      zielWahl,
      transferEingabe,
      nachschub,
      eventEingabe,
      schluessel: schluessel.current,
    });
  }, [
    basis,
    datum,
    ist,
    erloesWahl,
    zielWahl,
    transferEingabe,
    nachschub,
    eventEingabe,
    kasse.kontoId,
  ]);

  const body = (key: string): KassenabrechnungEingabeInput => ({
    idempotenzSchluessel: key,
    kontoId: kasse.kontoId,
    datum,
    ist: istListe,
    erloesKontoId: erloesId,
    zielFachId: zielId,
    transfers,
    events: events.map((e) => ({
      eventId: e.eventId,
      zaehlungId: e.zaehlungId,
      betragCent: e.betragCent,
    })),
  });

  const buchen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      const inhalt = JSON.stringify(body(''));
      schluessel.current = schluesselFuer(schluessel.current, inhalt, () => crypto.randomUUID());
      // The key belongs to the draft: after a reload the same content keeps it.
      const roh = entwurfLesen(window.localStorage, kasse.kontoId, basis);
      if (roh.art === 'entwurf')
        entwurfSchreiben(window.localStorage, kasse.kontoId, {
          ...roh.entwurf,
          schluessel: schluessel.current,
        });
      return jsonOderFehler<KassenabrechnungErgebnisDto>(
        await api.finanzen.kassenabrechnungen.$post({ json: body(schluessel.current.schluessel) }),
      );
    },
    onSuccess: (ergebnis) => {
      verlassen.current = true;
      entwurfLoeschen(window.localStorage, kasse.kontoId);
      verwerfen.abgeschlossen();
      schluessel.current = null;
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      void qc.invalidateQueries({ queryKey: ['kassen'] });
      setGespeichert(ergebnis);
      void navigate(kassenabrechnungPfad(ergebnis.id));
      setIst({});
      setTransferEingabe(null);
      setNachschub({});
      setEventEingabe({});
      setPruefen(false);
    },
  });

  const pruefenOeffnen = () => {
    if (!buchbar) return;
    buchen.reset();
    setPruefen(true);
  };

  // The success message scrolls into view: the form above resets.
  useEffect(() => {
    if (gespeichert) window.scrollTo({ top: 0 });
  }, [gespeichert]);

  const kontoName = (id: string) => kontoNamen.get(id) ?? id;
  const zielOptionen = faecher
    .filter((f) => f.id !== kasse.kontoId)
    .map((f) => ({ value: f.id, label: f.name }));
  const transferSumme = rechnung.transferCent;
  const eventsOffen = vorschau.zaehlungen.length === 0;

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen/kassen">Kassen</ZurueckLink>
      <Title order={2}>Kasse „{kasse.name}“ abrechnen</Title>
      <Text c="dimmed" size="sm">
        Zähle die Kasse durch. Die Einnahme ist Ist minus Bestand laut Buchhaltung und wird als ein
        Erlös gebucht. Danach füllst du die Kasse auf den Grundbestand auf.
      </Text>
      {entwurfVerworfen && (
        <Alert color="yellow" withCloseButton onClose={() => setEntwurfVerworfen(false)}>
          Deine gespeicherten Eingaben passten nicht mehr zum aktuellen Stand der Kasse (z. B. wurde
          inzwischen abgerechnet oder neu gezählt) und wurden verworfen.
        </Alert>
      )}
      {gespeichert && (
        <Alert
          color="green"
          title="Abrechnung gespeichert"
          withCloseButton
          onClose={() => setGespeichert(null)}
        >
          <Group gap="md">
            <Text size="sm">
              {gespeichert.wiederholt ? 'Die Abrechnung war schon gespeichert. ' : ''}
              {gespeichert.buchungId
                ? `Buchung Nr. ${gespeichert.buchungSeq} (Einnahme ${centAnzeigen(gespeichert.einnahmeCent)}).`
                : 'Es stimmt alles, es wurde keine Buchung angelegt.'}
            </Text>
            {gespeichert.buchungId && (
              <Anchor component={Link} to={detailPfad(gespeichert.buchungId)} size="sm">
                Buchung ansehen
              </Anchor>
            )}
            <Anchor component={Link} to={kassenabrechnungPfad(gespeichert.id)} size="sm">
              Abrechnung ansehen
            </Anchor>
          </Group>
        </Alert>
      )}
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
              label={<FeldLabel text="Erlöskonto" hilfe={HILFE.kassen.erloeskonto} />}
              searchable
              data={erloesOptionen}
              value={erloesId}
              onChange={setErloesWahl}
              allowDeselect={false}
              nothingFoundMessage="Kein Erlöskonto gefunden"
              data-nav=""
            />
            <Select
              label={<FeldLabel text="Ziel-Fach" hilfe={HILFE.kassen.zielFach} />}
              searchable
              data={zielOptionen}
              value={zielId}
              onChange={(v) => {
                setZielWahl(v);
                setTransferEingabe(null);
                setNachschub({});
              }}
              allowDeselect={false}
              nothingFoundMessage="Kein Fach gefunden"
              error={zielFehlt ? 'Das Ziel-Fach muss ein anderes Fach sein.' : undefined}
              data-nav=""
            />
          </SimpleGrid>

          <Group gap={2}>
            <Text fw={500} size="sm">
              Bestand, Ist, Grundbestand und Transfer
            </Text>
            <InfoHinweis feld="Ist" text={HILFE.kassen.ist} />
            <InfoHinweis feld="Transfer" text={HILFE.kassen.transfer} />
          </Group>
          <Box style={{ overflowX: 'auto' }}>
            <Table
              role="group"
              aria-label="Kasse zählen und auffüllen"
              verticalSpacing={4}
              tabularNums
              withRowBorders
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={BETRAG_STIL}>Wert</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Bestand</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Ist</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Grundbestand</Table.Th>
                  <Table.Th style={BETRAG_STIL}>
                    Transfer{zielFach ? ` (${zielFach.name})` : ''}
                  </Table.Th>
                  <Table.Th style={BETRAG_STIL}>Kasse danach</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {NENNWERTE_CENT.map((n, i) => {
                  const posten = rechnung.posten[i]!;
                  const abweichend = posten.danach !== posten.grundbestand;
                  return (
                    <Fragment key={n}>
                      <Table.Tr>
                        <Table.Td style={BETRAG_STIL}>{centAnzeigen(n)}</Table.Td>
                        <Table.Td style={BETRAG_STIL} c="dimmed">
                          {ZAHL.format(posten.soll)}
                        </Table.Td>
                        <Table.Td>
                          <AnzahlFeld
                            label={`Ist ${centAnzeigen(n)}`}
                            wert={ist[n]}
                            onWert={(w) => setIst((alt) => ({ ...alt, [n]: w }))}
                          />
                        </Table.Td>
                        <Table.Td style={BETRAG_STIL} c="dimmed">
                          {ZAHL.format(posten.grundbestand)}
                        </Table.Td>
                        <Table.Td>
                          <AnzahlFeld
                            label={`Transfer ${centAnzeigen(n)}`}
                            wert={transfer[n]}
                            vorzeichen
                            onWert={(w) => setTransferEingabe({ ...transfer, [n]: w })}
                          />
                        </Table.Td>
                        <Table.Td
                          style={{ ...BETRAG_STIL, fontWeight: abweichend ? 700 : 400 }}
                          c={abweichend ? 'orange.8' : 'dimmed'}
                        >
                          {ZAHL.format(posten.danach)}
                        </Table.Td>
                      </Table.Tr>
                    </Fragment>
                  );
                })}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td style={BETRAG_STIL} fw={700}>
                    Summe
                  </Table.Td>
                  <Table.Td style={{ ...BETRAG_STIL, fontWeight: 700 }}>
                    {centAnzeigen(rechnung.sollCent)}
                  </Table.Td>
                  <Table.Td style={{ ...BETRAG_STIL, fontWeight: 700 }}>
                    {centAnzeigen(rechnung.istCent)}
                  </Table.Td>
                  <Table.Td style={{ ...BETRAG_STIL, fontWeight: 700 }}>
                    {centAnzeigen(
                      rechnung.posten.reduce((s, p) => s + p.nennwertCent * p.grundbestand, 0),
                    )}
                  </Table.Td>
                  <Table.Td style={{ ...BETRAG_STIL, fontWeight: 700 }}>
                    {centAnzeigen(transferSumme)}
                  </Table.Td>
                  <Table.Td style={{ ...BETRAG_STIL, fontWeight: 700 }}>
                    {centAnzeigen(
                      rechnung.posten.reduce((s, p) => s + p.nennwertCent * p.danach, 0),
                    )}
                  </Table.Td>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Box>
          <Stack gap="xs">
            {NENNWERTE_CENT.map((n) => {
              const fehltN = fehlt.get(n) ?? 0;
              if (fehltN <= 0 && !nachschub[n]) return null;
              return (
                <Paper key={`nachschub-${n}`} p="sm" bg="var(--mantine-color-orange-light)">
                  <Text fw={600} size="sm" mb={4}>
                    {centAnzeigen(n)}
                  </Text>
                  <NachschubZeile
                    nennwert={n}
                    fehlt={fehltN}
                    wahl={nachschub[n]}
                    quellen={quellen}
                    onWahl={(w) => setNachschub((alt) => ({ ...alt, [n]: w }))}
                    onVorschlag={() => {
                      const v = nachschubVorschlag(
                        [{ nennwertCent: n, anzahl: fehltN }],
                        quellen.map((f) => ({
                          fachId: f.id,
                          name: f.name,
                          bestand: f.bestand,
                        })),
                      )[0];
                      const rolle = muenzrolle(n);
                      const irgendeins = quellen.find(
                        (f) => (f.bestand.find((b) => b.nennwertCent === n)?.anzahl ?? 0) > 0,
                      );
                      setNachschub((alt) => ({
                        ...alt,
                        [n]: v
                          ? { fachId: v.fachId, stueck: v.anzahl }
                          : { fachId: irgendeins?.id ?? null, stueck: rolle ?? fehltN },
                      }));
                      setTransferEingabe(null);
                    }}
                  />
                </Paper>
              );
            })}
          </Stack>
          {transferEingabe && (
            <Group>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => setTransferEingabe(null)}
              >
                Transfer-Vorschlag wiederherstellen
              </Button>
            </Group>
          )}

          <Paper withBorder p="md">
            <Stack gap="xs">
              <Group gap={2}>
                <Text fw={600}>Einnahme</Text>
                <InfoHinweis feld="Einnahme" text={HILFE.kassen.ist} />
              </Group>
              <Text fw={700} size="xl" style={BETRAG_STIL} ta="left">
                {centAnzeigen(rechnung.einnahmeCent)}
              </Text>
              <Text size="sm" c="dimmed">
                Ist {centAnzeigen(rechnung.istCent)} minus Bestand {centAnzeigen(rechnung.sollCent)}
                .
              </Text>
            </Stack>
          </Paper>

          <Stack gap="xs">
            <Group gap={2}>
              <Text fw={600}>Zuordnung zu Events</Text>
              <InfoHinweis feld="Zuordnung zu Events" text={HILFE.kassen.eventZuordnung} />
            </Group>
            {eventsOffen ? (
              <Text size="sm" c="dimmed">
                Seit der letzten Abrechnung gibt es keine Dienst-Zählung. Die ganze Einnahme bleibt
                ohne Event.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={520}>
                <Table verticalSpacing={4} tabularNums>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Event</Table.Th>
                      <Table.Th style={BETRAG_STIL}>Dienst-Zählung</Table.Th>
                      <Table.Th>Gezählt von</Table.Th>
                      <Table.Th>Einnahme</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {vorschau.zaehlungen.map((z) => {
                      const e = events.find((x) => x.eventId === z.eventId)!;
                      return (
                        <Table.Tr key={z.eventId}>
                          <Table.Td>
                            <Anchor
                              component={Link}
                              to={`/kalender/events/${encodeURIComponent(z.eventId)}`}
                            >
                              {z.eventTitel}
                            </Anchor>
                            <Text size="xs" c="dimmed">
                              {datumAnzeigen(z.eventBeginn.slice(0, 10))}
                            </Text>
                          </Table.Td>
                          <Table.Td style={BETRAG_STIL}>{centAnzeigen(z.summeCent)}</Table.Td>
                          <Table.Td>
                            {z.gezaehltVon ? (
                              <Anchor
                                component={Link}
                                to={mitgliedLink(z.gezaehltVon)}
                                underline="never"
                              >
                                <StatusName status={z.gezaehltVon.status}>
                                  {mitgliedName(z.gezaehltVon)}
                                </StatusName>
                              </Anchor>
                            ) : (
                              '–'
                            )}
                          </Table.Td>
                          <Table.Td w={170}>
                            <BetragFeld
                              aria-label={`Einnahme ${z.eventTitel}`}
                              value={e.betragCent}
                              onWert={(c) => setEventEingabe((alt) => ({ ...alt, [z.eventId]: c }))}
                              data-nav=""
                            />
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
            <Group justify="space-between" wrap="wrap">
              <Group gap={2}>
                <Text fw={600}>Fehler ohne Event</Text>
                <InfoHinweis feld="Fehler ohne Event" text={HILFE.kassen.fehler} />
              </Group>
              <Badge
                size="xl"
                variant="light"
                color={rechnung.fehlerCent === 0 ? 'teal' : 'orange'}
                tt="none"
              >
                {centAnzeigen(rechnung.fehlerCent)}
              </Badge>
            </Group>
          </Stack>

          {bestandFehler.length > 0 && (
            <Alert color="red" title="Das geht so nicht">
              <Stack gap={2}>
                {bestandFehler.map((f) => (
                  <Text key={f} size="sm">
                    {f}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}
          <Group align="center" gap="md">
            <Button
              type="button"
              variant="default"
              onClick={eingabenVerwerfen}
              disabled={!ungespeichert}
            >
              Eingaben verwerfen
            </Button>
            <Button type="button" onClick={pruefenOeffnen} disabled={!buchbar}>
              Prüfen und abrechnen
            </Button>
            <Text size="sm" c="dimmed">
              Tastenkürzel: Strg+Enter
            </Text>
          </Group>
        </Stack>
      </form>
      {pruefen && (
        <Zusammenfassung
          rechnung={rechnung}
          matrix={matrix}
          erloesKontoId={erloesId}
          warnungen={warnungen}
          kontoName={kontoName}
          datum={datum}
          kasseName={kasse.name}
          laeuft={buchen.isPending}
          fehler={
            buchen.isError ? fehlerText(buchen.error, 'Das Speichern ist fehlgeschlagen.') : null
          }
          onBuchen={() => buchen.mutate()}
          onClose={() => setPruefen(false)}
        />
      )}
      {verwerfen.dialog}
    </Stack>
  );
}

/**
 * Settling a Kasse: the Finanzer:in counts it, the page proposes the transfer to the Ziel-Fach, the
 * allocation of the income to events (from the Dienst-Zählungen) and shows the error live. One
 * booking results (see docs/finanzen.md, „Barkassen“).
 */
export function FinanzenKasseAbrechnenPage() {
  const { kontoId } = useParams();
  const vorschau = useKassenAbrechnungVorschau(kontoId);
  const bargeld = useBargeld();
  const konten = useKonten(true);
  if (vorschau.isError || bargeld.isError || konten.isError) {
    return (
      <Stack>
        <ZurueckLink to="/finanzen/kassen">Kassen</ZurueckLink>
        <Alert color="red">Die Kasse konnte nicht geladen werden.</Alert>
      </Stack>
    );
  }
  if (!vorschau.data || !bargeld.data || !konten.data)
    return <Loader m="md" aria-label="Wird geladen" />;
  const eltern = new Set(konten.data.map((k) => k.parentId));
  const erloesOptionen = konten.data
    .filter(
      (k) =>
        k.art === 'erloes' &&
        !eltern.has(k.id) &&
        (!k.archiviert || k.id === vorschau.data.kasse.standardErloesKonto.id),
    )
    .map((k) => ({ value: k.id, label: k.name }));
  return (
    <AbrechnenFormular
      key={kontoId}
      vorschau={vorschau.data}
      faecher={bargeld.data.faecher}
      kontoNamen={new Map(konten.data.map((k) => [k.id, k.name]))}
      erloesOptionen={erloesOptionen}
      steuersaetze={new Map(konten.data.map((k) => [k.id, k.steuersatzStandard]))}
    />
  );
}
