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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BELEG_MODUS_LABELS,
  centAnzeigen,
  datumAnzeigen,
  monatAnzeigen,
  einzelpreisAusGesamt,
  istEigenbeleg,
  ZAHLWEG_LABELS,
  type BelegPostenDto,
} from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { anzahlText, pfandJeSatz, satzText } from '../belegFormular';
import { BelegVorschau } from '../BelegDatei';
import { BelegSummen } from '../BelegSummen';
import {
  BETRAG_STIL,
  belegEntwurfPfad,
  detailPfad,
  finanzenKeys,
  jsonOderFehler,
  useBeleg,
  useBelegWaren,
} from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { KartenOderTabelle } from '../KartenOderTabelle';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { formatDatumZeit } from '../datum';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/** "Gesamtpreis, ≈ 1,00 € je Stück" for a Gesamtpreis line, else the price per unit. */
const preisText = (p: BelegPostenDto): string =>
  p.gesamtCent === null || p.art === 'leergut'
    ? centAnzeigen(p.einzelpreisCent)
    : `Gesamtpreis, ≈ ${centAnzeigen(einzelpreisAusGesamt(p.gesamtCent, p.anzahlMilli))} je ${p.art === 'ware' ? 'Gebinde' : 'Stück'}`;

/**
 * Ware of a Ware item (linked to the Ware page) with the Gebinde; with `kurz` the whole line
 * "Ur-Krostitzer, 20 x 0,5l Flasche 3,10 €" (the Ware name once, no deposit text).
 */
function WareAngabe({
  p,
  gebindeName,
  kurz = false,
}: Readonly<{ p: BelegPostenDto; gebindeName: string | null; kurz?: boolean }>) {
  if (p.art !== 'ware' || !p.wareId) return null;
  return (
    <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
      <Anchor component={Link} to={`/waren/${encodeURIComponent(p.wareId)}`}>
        {p.wareName ?? 'Ware'}
      </Anchor>
      {kurz
        ? `, ${anzahlText(p.anzahlMilli)} x ${gebindeName ? `${gebindeName} ` : ''}${preisText(p)}`
        : gebindeName
          ? `, ${gebindeName}`
          : ''}
    </Text>
  );
}

/** Amount of an item with the deposit shown as "(davon Pfand 31,00 €)". */
function PostenBetrag({ p }: Readonly<{ p: BelegPostenDto }>) {
  return (
    <>
      {centAnzeigen(p.betragCent + (p.pfandBetragCent ?? 0))}
      {!!p.pfandBetragCent && (
        <Text size="xs" c="dimmed" fw={400}>
          (davon Pfand {centAnzeigen(p.pfandBetragCent)})
        </Text>
      )}
    </>
  );
}

const Zeile = ({
  label,
  children,
}: Readonly<{ label: React.ReactNode; children: React.ReactNode }>) => (
  <Group gap="xs" align="flex-start" wrap="nowrap">
    <Text fw={600} w={140} style={{ flexShrink: 0 }}>
      {label}
    </Text>
    <Text style={{ overflowWrap: 'anywhere' }} component="div">
      {children}
    </Text>
  </Group>
);

/** A booked Beleg: file, items, totals, links to the booking and the Erstattung. */
export function FinanzenBelegDetailPage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const beleg = useBeleg(id);
  const kopieren = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      jsonOderFehler<{ id: string }>(
        await api.finanzen.belege[':id'].kopieren.$post({ param: { id: id! } }),
      ),
    onSuccess: ({ id: neu }) => {
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      void navigate(belegEntwurfPfad(neu));
    },
  });
  const b = beleg.data;
  const eigenbeleg = !!b && istEigenbeleg(b);
  const satzOderKeine = (satz: number) => (eigenbeleg ? 'ohne Vorsteuer' : satzText(satz));
  const waren = useBelegWaren(!!b?.posten.some((p) => p.art === 'ware'));
  const gebindeName = (p: BelegPostenDto) =>
    (waren.data ?? []).find((w) => w.id === p.wareId)?.gebinde.find((g) => g.id === p.gebindeId)
      ?.bezeichnung ?? null;

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen/belege">Belege</ZurueckLink>
      {beleg.isPending && <Loader m="md" aria-label="Beleg wird geladen" />}
      {beleg.isError && <Alert color="red">Der Beleg konnte nicht geladen werden.</Alert>}
      {b && (
        <>
          <Group justify="space-between" align="center">
            <Group>
              <Title order={2}>Beleg {b.nummer}</Title>
              {b.storniert && <Badge color="gray">Storniert</Badge>}
            </Group>
            {can('finanzen:buchen') && (
              <Group gap={2}>
                <Button
                  variant="default"
                  onClick={() => kopieren.mutate()}
                  loading={kopieren.isPending}
                >
                  Als Entwurf kopieren
                </Button>
                <InfoHinweis feld="Als Entwurf kopieren" text={HILFE.belege.kopieren} />
              </Group>
            )}
          </Group>
          {kopieren.isError && (
            <Alert color="red">
              {fehlerText(kopieren.error, 'Das Kopieren ist fehlgeschlagen.')}
            </Alert>
          )}
          {b.storniert && (
            <Alert color="gray">
              Die Buchung dieses Belegs ist storniert. Mit „Als Entwurf kopieren“ kannst du ihn
              korrigiert neu erfassen.
            </Alert>
          )}
          <Paper withBorder p="md">
            <Stack gap="xs">
              <Zeile label="Rechnungssteller">{b.rechnungssteller}</Zeile>
              <Zeile label="Belegdatum">{datumAnzeigen(b.belegdatum)}</Zeile>
              <Zeile label="Preise">{BELEG_MODUS_LABELS[b.modus]}</Zeile>
              <Zeile label="Zahlweg">
                {ZAHLWEG_LABELS[b.zahlweg]}
                {b.mitglied && (
                  <>
                    {': '}
                    <Anchor component={Link} to={mitgliedLink(b.mitglied)}>
                      <StatusName status={b.mitglied.status}>{mitgliedName(b.mitglied)}</StatusName>
                    </Anchor>
                  </>
                )}
              </Zeile>
              <Zeile label={<FeldLabel text="Bezahlt am" hilfe={HILFE.belege.bezahldatum} />}>
                {b.bezahldatum ? datumAnzeigen(b.bezahldatum) : 'noch offen (Auslage)'}
              </Zeile>
              <Zeile label="Buchung">
                <Anchor component={Link} to={detailPfad(b.buchung.id)}>
                  Nr. {b.buchung.seq}
                </Anchor>
                {b.buchungVerschoben && (
                  <Text span c="orange.8">
                    {' '}
                    · gebucht am {datumAnzeigen(b.buchungsdatum)} (
                    {monatAnzeigen(b.zahlweg === 'auslage' ? b.belegdatum : (b.bezahldatum ?? ''))}{' '}
                    war festgeschrieben)
                  </Text>
                )}
              </Zeile>
              {b.erstattung && (
                <Zeile label="Erstattung">
                  {datumAnzeigen(b.erstattung.datum)},{' '}
                  <Anchor component={Link} to={detailPfad(b.erstattung.buchung.id)}>
                    Buchung Nr. {b.erstattung.buchung.seq}
                  </Anchor>
                </Zeile>
              )}
              {b.eigenbelegBegruendung && (
                <Zeile label="Eigenbeleg">{b.eigenbelegBegruendung} (ohne Vorsteuer)</Zeile>
              )}
              {b.eingereichtVon && (
                <Zeile label="Eingereicht von">
                  <Anchor component={Link} to={mitgliedLink(b.eingereichtVon)}>
                    <StatusName status={b.eingereichtVon.status}>
                      {mitgliedName(b.eingereichtVon)}
                    </StatusName>
                  </Anchor>
                  {b.eingereichtAm ? `, ${formatDatumZeit(b.eingereichtAm)}` : ''}
                  {b.eingereichtBetragCent !== null &&
                    `, genannter Betrag ${centAnzeigen(b.eingereichtBetragCent)}`}
                </Zeile>
              )}
              {b.erstelltVon && (
                <Zeile label="Erfasst von">
                  <StatusName status={b.erstelltVon.status}>
                    {mitgliedName(b.erstelltVon)}
                  </StatusName>
                </Zeile>
              )}
            </Stack>
          </Paper>

          <Title order={4}>Posten</Title>
          <KartenOderTabelle<BelegPostenDto>
            zeilen={b.posten}
            zeilenKey={(p) => String(p.pos)}
            kartenAlsStapel
            karte={(p) => (
              <Paper withBorder p="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={0}>
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                      {p.art === 'leergut' ? 'Leergut' : p.kategorieName}
                    </Text>
                    <WareAngabe p={p} gebindeName={gebindeName(p)} kurz />
                    {p.text && p.art !== 'ware' && (
                      <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                        {p.text}
                      </Text>
                    )}
                    <Text size="sm" c="dimmed">
                      {p.art === 'ware'
                        ? satzOderKeine(p.steuersatz)
                        : `${anzahlText(p.anzahlMilli)} × ${preisText(p)} · ${satzOderKeine(p.steuersatz)}`}
                    </Text>
                  </Stack>
                  <Text fw={600} style={BETRAG_STIL} component="div">
                    <PostenBetrag p={p} />
                  </Text>
                </Group>
              </Paper>
            )}
            kopf={
              <Table.Tr>
                <Table.Th>Kategorie</Table.Th>
                <Table.Th>Text</Table.Th>
                <Table.Th style={BETRAG_STIL}>Anzahl</Table.Th>
                <Table.Th style={BETRAG_STIL}>Einzelpreis</Table.Th>
                <Table.Th style={BETRAG_STIL}>Steuersatz</Table.Th>
                <Table.Th style={BETRAG_STIL}>Betrag</Table.Th>
              </Table.Tr>
            }
            zeile={(p) => (
              <Table.Tr>
                <Table.Td>{p.art === 'leergut' ? 'Leergut' : p.kategorieName}</Table.Td>
                <Table.Td style={{ overflowWrap: 'anywhere' }}>
                  {p.art === 'ware' ? null : p.text}
                  <WareAngabe p={p} gebindeName={gebindeName(p)} />
                </Table.Td>
                <Table.Td style={BETRAG_STIL}>{anzahlText(p.anzahlMilli)}</Table.Td>
                <Table.Td style={BETRAG_STIL}>{preisText(p)}</Table.Td>
                <Table.Td style={BETRAG_STIL}>{satzOderKeine(p.steuersatz)}</Table.Td>
                <Table.Td style={BETRAG_STIL}>
                  <PostenBetrag p={p} />
                </Table.Td>
              </Table.Tr>
            )}
          />
          <BelegSummen
            jeSteuersatz={b.jeSteuersatz}
            summeCent={b.summeCent}
            pfand={pfandJeSatz(
              b.posten,
              b.posten.map((p) => p.pfandBetragCent ?? 0),
            )}
          />
          {b.korrekturen.length > 0 && (
            <Text size="sm" c="dimmed">
              Korrektur:{' '}
              {b.korrekturen
                .map(
                  (k) =>
                    `${satzText(k.steuersatz)} Netto ${centAnzeigen(k.nettoCent)}, Steuer ${centAnzeigen(k.steuerCent)}`,
                )
                .join('; ')}
            </Text>
          )}
          {b.datei && (
            <Stack gap="xs">
              <Title order={4}>Datei</Title>
              <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                {b.datei.name}
              </Text>
              <BelegVorschau url={b.datei.url} typ={b.datei.typ} name={b.datei.name} />
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
