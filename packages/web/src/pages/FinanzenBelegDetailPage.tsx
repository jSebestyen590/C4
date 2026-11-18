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
  ZAHLWEG_LABELS,
  type BelegPostenDto,
} from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { anzahlText, satzText } from '../belegFormular';
import { BelegVorschau } from '../BelegDatei';
import { BelegSummen } from '../BelegSummen';
import {
  BETRAG_STIL,
  belegEntwurfPfad,
  detailPfad,
  finanzenKeys,
  jsonOderFehler,
  useBeleg,
} from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { KartenOderTabelle } from '../KartenOderTabelle';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

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
                <Zeile label="Eigenbeleg">{b.eigenbelegBegruendung}</Zeile>
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
                      {p.kategorieName}
                    </Text>
                    {p.text && (
                      <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                        {p.text}
                      </Text>
                    )}
                    <Text size="sm" c="dimmed">
                      {anzahlText(p.anzahlMilli)} × {centAnzeigen(p.einzelpreisCent)} ·{' '}
                      {satzText(p.steuersatz)}
                    </Text>
                  </Stack>
                  <Text fw={600} style={BETRAG_STIL}>
                    {centAnzeigen(p.betragCent)}
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
                <Table.Td>{p.kategorieName}</Table.Td>
                <Table.Td style={{ overflowWrap: 'anywhere' }}>{p.text}</Table.Td>
                <Table.Td style={BETRAG_STIL}>{anzahlText(p.anzahlMilli)}</Table.Td>
                <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.einzelpreisCent)}</Table.Td>
                <Table.Td style={BETRAG_STIL}>{satzText(p.steuersatz)}</Table.Td>
                <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.betragCent)}</Table.Td>
              </Table.Tr>
            )}
          />
          <BelegSummen jeSteuersatz={b.jeSteuersatz} summeCent={b.summeCent} />
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
