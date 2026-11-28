import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { BereichLink } from '../BereichLink';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BELEG_MODUS_LABELS,
  RECHNUNG_STATUS_LABELS,
  RECHNUNG_ZAHLWEG_LABELS,
  centAnzeigen,
  datumAnzeigen,
  type RechnungDetailDto,
  type RechnungPostenDto,
} from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { anzahlText, satzText } from '../belegFormular';
import { BelegVorschau } from '../BelegDatei';
import { BelegSummen } from '../BelegSummen';
import { formatDatumZeit } from '../datum';
import {
  BETRAG_STIL,
  detailPfad,
  finanzenKeys,
  jsonOderFehler,
  rechnungEntwurfPfad,
  rechnungPfad,
  rechnungenPfad,
  useRechnung,
} from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import { KartenOderTabelle } from '../KartenOderTabelle';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { rechnungDateiname, rechnungTitel } from '../rechnung/rechnungDatei';
import { useRechnungPdfErzeugen } from '../rechnung/useRechnungPdf';
import { RechnungStornoDialog } from '../RechnungStornoDialog';
import { RechnungZahlungDialog } from '../RechnungZahlungDialog';
import { StatusName } from '../StatusAnzeige';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const STATUS_FARBE = {
  entwurf: 'blue',
  gestellt: 'orange',
  bezahlt: 'green',
  storniert: 'gray',
} as const;

/** Amount of an item with the deposit shown as "davon Pfand". */
function PostenBetrag({ p }: Readonly<{ p: RechnungPostenDto }>) {
  const pfand = p.pfandBetragCent ?? 0;
  return (
    <>
      <Text span fw={600} style={BETRAG_STIL}>
        {centAnzeigen(p.betragCent + pfand)}
      </Text>
      {pfand !== 0 && (
        <Text size="xs" c="dimmed" style={BETRAG_STIL}>
          davon Pfand {centAnzeigen(pfand)}
        </Text>
      )}
    </>
  );
}

const bezeichnung = (p: RechnungPostenDto) => (
  <>
    <Text span style={{ overflowWrap: 'anywhere' }}>
      {p.text}
    </Text>
    {p.einheit && (
      <Text size="sm" c="dimmed">
        {p.einheit}
      </Text>
    )}
  </>
);

/** A Rechnung as stored: header, items, totals, bookings, the PDF and the actions. */
export function FinanzenRechnungDetailPage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const rechnung = useRechnung(id);
  const pdfErzeugen = useRechnungPdfErzeugen();
  const [zahlung, setZahlung] = useState(false);
  const [storno, setStorno] = useState(false);

  const pdf = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => pdfErzeugen(id!),
    onSuccess: () => void qc.invalidateQueries({ queryKey: finanzenKeys.alle }),
  });
  const kopieren = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      jsonOderFehler<{ id: string }>(
        await api.finanzen.rechnungen[':id'].kopieren.$post({ param: { id: id! } }),
      ),
    onSuccess: (neu) => {
      void qc.invalidateQueries({ queryKey: ['finanzen', 'rechnungen'] });
      void navigate(rechnungEntwurfPfad(neu.id));
    },
  });

  if (rechnung.isPending) return <Loader m="md" aria-label="Wird geladen" />;
  if (rechnung.isError || !rechnung.data)
    return <Alert color="red">Die Rechnung konnte nicht geladen werden.</Alert>;
  const r: RechnungDetailDto = rechnung.data;
  const darf = can('finanzen:buchen');
  const farbe = r.ueberfaellig ? 'red' : STATUS_FARBE[r.status];

  return (
    <Stack>
      <ZurueckLink to={rechnungenPfad}>Rechnungen</ZurueckLink>
      <Group gap="sm" align="center">
        <Title order={2}>
          {rechnungTitel(r)} {r.nummer}
        </Title>
        <Badge color={farbe} variant="light" size="lg">
          {r.ueberfaellig
            ? 'Überfällig'
            : r.istStorno
              ? 'Storno'
              : RECHNUNG_STATUS_LABELS[r.status]}
        </Badge>
      </Group>

      {r.stornoVon && (
        <Alert color="gray">
          Stornorechnung zu{' '}
          <Anchor component={Link} to={rechnungPfad(r.stornoVon.id)}>
            Rechnung {r.stornoVon.nummer}
          </Anchor>{' '}
          vom {datumAnzeigen(r.stornoVon.rechnungsdatum)}.
          {r.stornoBegruendung && <> Grund: {r.stornoBegruendung}</>}
        </Alert>
      )}
      {r.stornorechnung && (
        <Alert color="gray">
          Diese Rechnung ist storniert:{' '}
          <Anchor component={Link} to={rechnungPfad(r.stornorechnung.id)}>
            Stornorechnung {r.stornorechnung.nummer}
          </Anchor>{' '}
          vom {datumAnzeigen(r.stornorechnung.rechnungsdatum)}.
        </Alert>
      )}
      {r.status === 'bezahlt' && !r.istStorno && (
        <Text size="sm" c="dimmed">
          Eine bezahlte Rechnung lässt sich nicht stornieren. Storniere zuerst die Zahlungsbuchung
          im Journal, danach die Rechnung.
        </Text>
      )}

      <Paper withBorder p="md">
        <Stack gap={4}>
          <Text>
            <Text span fw={600}>
              Empfänger:
            </Text>{' '}
            {r.mitglied ? (
              <BereichLink to={mitgliedLink(r.mitglied)} underline="never">
                <StatusName status={r.mitglied.status}>{mitgliedName(r.mitglied)}</StatusName>
              </BereichLink>
            ) : (
              r.empfaengerName
            )}
            {r.mitglied && (
              <Text span c="dimmed">
                {' '}
                ({r.empfaengerName})
              </Text>
            )}
          </Text>
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
            {r.empfaengerAnschrift}
            {r.empfaengerUstId ? `\nUSt-IdNr.: ${r.empfaengerUstId}` : ''}
          </Text>
          <Text style={{ overflowWrap: 'anywhere' }}>
            <Text span fw={600}>
              Betreff:
            </Text>{' '}
            {r.betreff}
          </Text>
          <Text>
            <Text span fw={600}>
              Rechnungsdatum:
            </Text>{' '}
            {datumAnzeigen(r.rechnungsdatum)}
          </Text>
          <Text>
            <Text span fw={600}>
              Leistung:
            </Text>{' '}
            {datumAnzeigen(r.leistungVon)}
            {r.leistungBis ? ` bis ${datumAnzeigen(r.leistungBis)}` : ''}
          </Text>
          {!r.istStorno && (
            <Text>
              <Text span fw={600}>
                Fällig am:
              </Text>{' '}
              <Text span c={r.ueberfaellig ? 'red' : undefined}>
                {datumAnzeigen(r.faelligAm)}
              </Text>
            </Text>
          )}
          <Text size="sm" c="dimmed">
            Preise sind {BELEG_MODUS_LABELS[r.modus].toLowerCase()}. Erstellt{' '}
            {formatDatumZeit(r.erstelltAm)}
            {r.erstelltVon && (
              <>
                {' von '}
                <StatusName status={r.erstelltVon.status}>{mitgliedName(r.erstelltVon)}</StatusName>
              </>
            )}
            .
          </Text>
          {r.einleitung && (
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
              {r.einleitung}
            </Text>
          )}
        </Stack>
      </Paper>

      <Title order={4}>Posten</Title>
      <KartenOderTabelle
        zeilen={r.posten}
        zeilenKey={(p) => String(p.pos)}
        minWidth={760}
        karte={(p) => (
          <Paper withBorder p="sm">
            <Stack gap={2}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div>{bezeichnung(p)}</div>
                <div style={{ textAlign: 'right' }}>
                  <PostenBetrag p={p} />
                </div>
              </Group>
              <Text size="sm" c="dimmed">
                {anzahlText(p.anzahlMilli)} × {centAnzeigen(p.einzelpreisCent)} ·{' '}
                {satzText(p.steuersatz)} · {p.erloesKontoName}
              </Text>
            </Stack>
          </Paper>
        )}
        kopf={
          <Table.Tr>
            <Table.Th>Pos.</Table.Th>
            <Table.Th>Bezeichnung</Table.Th>
            <Table.Th style={BETRAG_STIL}>Anzahl</Table.Th>
            <Table.Th style={BETRAG_STIL}>Einzelpreis ({r.modus})</Table.Th>
            <Table.Th>Steuer</Table.Th>
            <Table.Th>Erlös-Kategorie</Table.Th>
            <Table.Th style={BETRAG_STIL}>Betrag</Table.Th>
          </Table.Tr>
        }
        zeile={(p) => (
          <Table.Tr>
            <Table.Td>{p.pos}</Table.Td>
            <Table.Td>{bezeichnung(p)}</Table.Td>
            <Table.Td style={BETRAG_STIL}>{anzahlText(p.anzahlMilli)}</Table.Td>
            <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.einzelpreisCent)}</Table.Td>
            <Table.Td>{satzText(p.steuersatz)}</Table.Td>
            <Table.Td style={{ overflowWrap: 'anywhere' }}>{p.erloesKontoName}</Table.Td>
            <Table.Td style={BETRAG_STIL}>
              <PostenBetrag p={p} />
            </Table.Td>
          </Table.Tr>
        )}
      />
      <BelegSummen jeSteuersatz={r.summen} summeCent={r.bruttoCent} />
      {r.hinweis && (
        <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
          {r.hinweis}
        </Text>
      )}

      <Paper withBorder p="md">
        <Stack gap={4}>
          <Group gap={4}>
            <Title order={4}>Buchungen</Title>
            <InfoHinweis feld="Ist-Versteuerung" text={HILFE.rechnungen.istVersteuerung} />
          </Group>
          <Text>
            {r.istStorno ? 'Stornobuchung' : 'Stellen'}:{' '}
            <Anchor component={Link} to={detailPfad(r.buchungId)}>
              Buchung Nr. {r.buchungSeq}
            </Anchor>
          </Text>
          {r.zahlung ? (
            <Text>
              Zahlung ({RECHNUNG_ZAHLWEG_LABELS[r.zahlung.zahlweg]}) am{' '}
              {datumAnzeigen(r.zahlung.datum)}:{' '}
              <Anchor component={Link} to={detailPfad(r.zahlung.buchungId)}>
                Buchung Nr. {r.zahlung.buchungSeq}
              </Anchor>
            </Text>
          ) : (
            !r.istStorno && (
              <Text size="sm" c="dimmed">
                Noch nicht bezahlt: Erlös und Umsatzsteuer werden erst mit der Zahlung gebucht.
              </Text>
            )
          )}
        </Stack>
      </Paper>

      <Stack gap="xs">
        <Title order={4}>PDF</Title>
        {r.datei ? (
          <>
            <Button
              component="a"
              href={r.datei.url}
              target="_blank"
              rel="noreferrer"
              variant="default"
              w="fit-content"
            >
              {rechnungDateiname(r)} öffnen
            </Button>
            <BelegVorschau url={r.datei.url} typ="application/pdf" name={rechnungDateiname(r)} />
          </>
        ) : (
          <Stack gap="xs" align="flex-start">
            <Text size="sm" c="dimmed">
              Zu dieser Rechnung gibt es noch kein PDF im Archiv.
            </Text>
            {darf && (
              <Button loading={pdf.isPending} onClick={() => pdf.mutate()}>
                PDF erzeugen
              </Button>
            )}
            {pdf.isError && (
              <Alert color="red">
                {fehlerText(pdf.error, 'Das PDF konnte nicht erzeugt werden.')}
              </Alert>
            )}
          </Stack>
        )}
      </Stack>

      {kopieren.isError && (
        <Alert color="red">{fehlerText(kopieren.error, 'Das Kopieren ist fehlgeschlagen.')}</Alert>
      )}
      {darf && (
        <Group>
          {r.status === 'gestellt' && !r.istStorno && (
            <Button onClick={() => setZahlung(true)}>Zahlung erfassen</Button>
          )}
          {r.status === 'gestellt' && !r.istStorno && (
            <Button variant="default" color="red" onClick={() => setStorno(true)}>
              Stornorechnung
            </Button>
          )}
          {!r.istStorno && (
            <Button
              variant="default"
              loading={kopieren.isPending}
              onClick={() => kopieren.mutate()}
            >
              Als Entwurf kopieren
            </Button>
          )}
        </Group>
      )}

      {zahlung && <RechnungZahlungDialog rechnung={r} onClose={() => setZahlung(false)} />}
      {storno && (
        <RechnungStornoDialog
          rechnung={r}
          onClose={() => setStorno(false)}
          onErledigt={async (ergebnis) => {
            void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
            let pdfFehler = false;
            try {
              await pdfErzeugen(ergebnis.id);
            } catch {
              pdfFehler = true;
            }
            notifications.show({
              color: pdfFehler ? 'orange' : 'green',
              autoClose: pdfFehler ? false : 6000,
              message: pdfFehler
                ? `Stornorechnung ${ergebnis.nummer} erstellt, aber das PDF konnte nicht abgelegt werden. Erzeuge es auf der Rechnungsseite erneut.`
                : `Stornorechnung ${ergebnis.nummer} erstellt.`,
            });
            setStorno(false);
            void navigate(rechnungPfad(ergebnis.id));
          }}
        />
      )}
    </Stack>
  );
}
