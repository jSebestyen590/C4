import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconArrowBackUp } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  centAnzeigen,
  datumAnzeigen,
  heuteBerlin,
  QUELLE_TYP_LABELS,
  STEUER_ART_LABELS,
  type BuchungDetailDto,
  type BuchungZeileDto,
} from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { DatumFeld } from '../DatumFeld';
import { RICHTUNG_LABELS, richtungVon } from '../buchungFormular';
import { BETRAG_STIL, detailPfad, FINANZEN_KEY, jsonOderFehler } from '../finanzenDaten';
import { HashAnzeige } from '../HashAnzeige';
import { mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { ZeilenUebersicht } from '../ZeilenUebersicht';
import { ZurueckLink } from '../ZurueckLink';

const zeitText = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

const stueckelungText = (z: BuchungZeileDto) =>
  z.stueckelung.map((s) => `${s.anzahl} × ${centAnzeigen(s.nennwertCent)}`).join(', ');

function steuerText(z: BuchungZeileDto): string | null {
  if (z.steuerArt === 'keine' || z.steuerCent === null) return null;
  const satz = z.steuersatz === null ? '' : ` ${(z.steuersatz / 100).toLocaleString('de-DE')} %`;
  return `${STEUER_ART_LABELS[z.steuerArt]}${satz}: ${centAnzeigen(z.steuerCent)} (netto ${centAnzeigen(z.nettoCent ?? 0)})`;
}

function StornoDialog({
  buchung,
  onClose,
}: Readonly<{ buchung: BuchungDetailDto; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [datum, setDatum] = useState(heuteBerlin());
  const [text, setText] = useState('');
  const [beruehrt, setBeruehrt] = useState(false);
  const [geprueft, setGeprueft] = useState(false);
  // One key per opening of the dialog: a double click or a retry does not reverse twice.
  const [schluessel] = useState(() => crypto.randomUUID());
  return (
    <BestaetigenDialog
      titel={`Buchung Nr. ${buchung.seq} stornieren`}
      bestaetigenText="Stornieren"
      groesse="lg"
      gesperrt={!geprueft || !datum || text.trim() === ''}
      onClose={onClose}
      onBestaetigt={async () => {
        const neu = await jsonOderFehler<{ id: string }>(
          await api.finanzen.buchungen[':id'].storno.$post({
            param: { id: buchung.id },
            json: { idempotenzSchluessel: schluessel, datum, text },
          }),
        );
        await qc.invalidateQueries({ queryKey: FINANZEN_KEY });
        void navigate(detailPfad(neu.id));
      }}
    >
      <Text size="sm">
        Es wird diese Gegenbuchung angelegt: Zugang und Abgang sind vertauscht. Die ursprüngliche
        Buchung bleibt unverändert bestehen.
      </Text>
      <ZeilenUebersicht
        zeilen={buchung.zeilen.map((z) => ({
          key: z.id,
          konto: z.kontoName,
          betragCent: -z.betragCent,
        }))}
      />
      <DatumFeld
        label="Datum der Stornobuchung"
        value={datum}
        onWert={setDatum}
        loeschbar={false}
      />
      <TextInput
        required
        label="Begründung"
        description={`Die Buchung erhält den Text „Storno von Nr. ${buchung.seq}: …“.`}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        error={
          beruehrt && text.trim() === ''
            ? 'Bitte gib eine Begründung für das Storno an.'
            : undefined
        }
        onBlur={() => setBeruehrt(true)}
        maxLength={500}
      />
      <Checkbox
        label={`Ja, ich storniere Buchung Nr. ${buchung.seq} mit dieser Gegenbuchung.`}
        checked={geprueft}
        onChange={(e) => setGeprueft(e.currentTarget.checked)}
      />
    </BestaetigenDialog>
  );
}

/** One booking: header, lines, hashes and the link between a reversal and its original. */
export function FinanzenBuchungPage() {
  const api = useApi();
  const { id = '' } = useParams();
  const darfBuchen = useAuth().can('finanzen:buchen');
  const [storno, setStorno] = useState(false);
  const buchung = useQuery({
    queryKey: [...FINANZEN_KEY, 'buchung', id],
    queryFn: async () => unwrap(await api.finanzen.buchungen[':id'].$get({ param: { id } })),
  });
  const b = buchung.data;

  return (
    <Stack maw={900}>
      <ZurueckLink to="/finanzen/journal">Journal</ZurueckLink>
      {buchung.isPending && <Loader m="md" aria-label="Buchung wird geladen" />}
      {buchung.isError && <Alert color="red">Die Buchung konnte nicht geladen werden.</Alert>}
      {b && (
        <>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Title order={2}>Buchung Nr. {b.seq}</Title>
              <Text style={{ overflowWrap: 'anywhere' }}>{b.text}</Text>
            </Stack>
          </Group>
          <Group gap="xs">
            {b.stornoVon && (
              <Badge color="orange" variant="light">
                Storno von Nr. {b.stornoVon.seq}
              </Badge>
            )}
            {b.storniertDurch && (
              <Badge color="red" variant="light">
                Storniert durch Nr. {b.storniertDurch.seq}
              </Badge>
            )}
          </Group>
          {b.stornoVon && (
            <Anchor component={Link} to={detailPfad(b.stornoVon.id)}>
              Zur ursprünglichen Buchung Nr. {b.stornoVon.seq}
            </Anchor>
          )}
          {b.storniertDurch && (
            <Anchor component={Link} to={detailPfad(b.storniertDurch.id)}>
              Zur Stornobuchung Nr. {b.storniertDurch.seq}
            </Anchor>
          )}
          <Paper withBorder p="md">
            <Stack gap={4}>
              <Text>Datum: {datumAnzeigen(b.datum)}</Text>
              <Text>
                Art:{' '}
                {QUELLE_TYP_LABELS[b.quelleTyp as keyof typeof QUELLE_TYP_LABELS] ?? b.quelleTyp}
              </Text>
              <Text>
                Volumen: <span style={BETRAG_STIL}>{centAnzeigen(b.betragCent)}</span>
              </Text>
              <Text>
                Erstellt von:{' '}
                {b.erstelltVon ? (
                  <StatusName status={b.erstelltVon.status}>
                    {mitgliedName(b.erstelltVon)}
                  </StatusName>
                ) : (
                  '–'
                )}{' '}
                am {zeitText(b.erstelltAm)}
              </Text>
            </Stack>
          </Paper>

          <Title order={4}>Zeilen</Title>
          <Stack hiddenFrom="sm" gap="xs">
            {b.zeilen.map((z) => (
              <Paper key={z.id} withBorder p="md">
                <Stack gap={4}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                      {z.kontoName}
                    </Text>
                    <Text fw={600} style={BETRAG_STIL}>
                      {RICHTUNG_LABELS[richtungVon(z.betragCent)]}{' '}
                      {centAnzeigen(Math.abs(z.betragCent))}
                    </Text>
                  </Group>
                  {steuerText(z) && (
                    <Text size="sm" c="dimmed">
                      {steuerText(z)}
                    </Text>
                  )}
                  {z.stueckelung.length > 0 && (
                    <Text size="sm" c="dimmed">
                      {stueckelungText(z)}
                    </Text>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
          <Table.ScrollContainer minWidth={600} visibleFrom="sm">
            <Table verticalSpacing="xs" tabularNums>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Konto</Table.Th>
                  <Table.Th>Zugang/Abgang</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Betrag</Table.Th>
                  <Table.Th>Steuer</Table.Th>
                  <Table.Th>Stückelung</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {b.zeilen.map((z) => (
                  <Table.Tr key={z.id}>
                    <Table.Td>{z.kontoName}</Table.Td>
                    <Table.Td>{RICHTUNG_LABELS[richtungVon(z.betragCent)]}</Table.Td>
                    <Table.Td style={BETRAG_STIL}>{centAnzeigen(Math.abs(z.betragCent))}</Table.Td>
                    <Table.Td>{steuerText(z) ?? '–'}</Table.Td>
                    <Table.Td>{z.stueckelung.length > 0 ? stueckelungText(z) : '–'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          <HashAnzeige label="Hash" wert={b.hash} />
          <HashAnzeige label="Hash der vorigen Buchung" wert={b.prevHash} />

          {darfBuchen && !b.stornoVon && !b.storniertDurch && (
            <Button
              color="red"
              variant="light"
              leftSection={<IconArrowBackUp size={18} />}
              onClick={() => setStorno(true)}
            >
              Stornieren
            </Button>
          )}
          {storno && <StornoDialog buchung={b} onClose={() => setStorno(false)} />}
        </>
      )}
    </Stack>
  );
}
