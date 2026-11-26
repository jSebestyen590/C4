import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useRef, useState } from 'react';
import {
  SUMUP_ERLOES_SATZ_BP,
  centAnzeigen,
  datumAnzeigen,
  nettoSteuer,
  zeitBerlin,
  type SumupAbrufErgebnis,
  type SumupBuchenErgebnis,
  type SumupGruppeDto,
  type SumupEventDto,
} from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { schluesselFuer } from '../buchungFormular';
import { BETRAG_STIL, finanzenKeys, jsonOderFehler, useSumup } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { HINWEIS_DAUER_MS } from '../gebuchtHinweis';
import { InfoHinweis } from '../InfoHinweis';
import { tagAnzeigen } from '../kalenderZeit';
import {
  OHNE_EVENT,
  sumupAbrufText,
  sumupAuswahl,
  sumupEventOptionen,
  sumupHinweisText,
  sumupTypText,
} from '../sumupAnzeige';
import { fehlerAnzeigen, fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

interface Buchung {
  gruppe: SumupGruppeDto;
  eventId: string | null;
  eventText: string | null;
  ids: string[];
  anzahl: number;
  summeCent: number;
}

const tagText = (geschaeftstag: string) => tagAnzeigen(`${geschaeftstag}T12:00:00Z`);

/** Open SumUp payments grouped per business day / event, to check and book; plus the payouts. */
export function FinanzenSumupPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const darfBuchen = can('finanzen:buchen');
  const telefon = useMediaQuery('(max-width: 48em)');
  const uebersicht = useSumup();
  const daten = uebersicht.data;
  const [eventWahl, setEventWahl] = useState<Record<string, string>>({});
  const [abgewaehlt, setAbgewaehlt] = useState<ReadonlySet<string>>(new Set());
  const [offen, setOffen] = useState<ReadonlySet<string>>(new Set());
  const [pruefen, setPruefen] = useState<Buchung | null>(null);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);

  const abruf = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      jsonOderFehler<SumupAbrufErgebnis>(await api.finanzen.sumup.abruf.$post()),
    onSuccess: (e) => {
      void qc.invalidateQueries({ queryKey: finanzenKeys.sumup });
      notifications.show({
        color: e.uebersprungen ? 'orange' : 'green',
        message: sumupAbrufText(e),
        autoClose: e.vollstaendig ? HINWEIS_DAUER_MS : 10000,
      });
    },
    onError: (e) => fehlerAnzeigen(e, 'Der Abruf bei SumUp ist fehlgeschlagen.'),
  });

  const buchen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (b: Buchung) => {
      const inhalt = JSON.stringify([b.ids, b.eventId]);
      schluessel.current = schluesselFuer(schluessel.current, inhalt, () => crypto.randomUUID());
      return jsonOderFehler<SumupBuchenErgebnis>(
        await api.finanzen.sumup.buchen.$post({
          json: {
            transaktionIds: b.ids,
            eventId: b.eventId,
            idempotenzSchluessel: schluessel.current.schluessel,
          },
        }),
      );
    },
    onSuccess: async ({ seq, wiederholt }, b) => {
      schluessel.current = null;
      const gruppen = daten?.gruppen ?? [];
      const index = gruppen.findIndex((g) => g.key === b.gruppe.key);
      const naechste = gruppen[index + 1]?.key ?? gruppen[index - 1]?.key ?? null;
      setPruefen(null);
      notifications.show({
        color: 'green',
        autoClose: HINWEIS_DAUER_MS,
        message: wiederholt ? `Schon gebucht (Nr. ${seq})` : `Gebucht (Nr. ${seq})`,
      });
      await qc.invalidateQueries({ queryKey: finanzenKeys.sumup });
      // After the modal closed (it returns the focus to its opener), continue at the next group.
      setTimeout(() => {
        const ziel =
          (naechste && document.querySelector<HTMLElement>(`[data-sumup-buchen="${naechste}"]`)) ||
          document.querySelector<HTMLElement>('[data-sumup-buchen]');
        ziel?.focus();
      }, 50);
    },
  });

  const events: SumupEventDto[] = daten?.events ?? [];
  const gruppen = daten?.gruppen ?? [];

  const eventWert = (g: SumupGruppeDto) => eventWahl[g.key] ?? g.eventId ?? OHNE_EVENT;

  const vorbereiten = (g: SumupGruppeDto): Buchung => {
    const wahl = eventWert(g);
    const eventId = wahl === OHNE_EVENT ? null : wahl;
    const a = sumupAuswahl(g.transaktionen, abgewaehlt);
    const option = sumupEventOptionen(events, g).find((o) => o.value === wahl);
    return {
      gruppe: g,
      eventId,
      eventText: eventId ? (option?.label ?? null) : null,
      ...a,
    };
  };

  const umschalten = (setter: typeof setOffen, id: string, an: boolean) =>
    setter((alt) => {
      const neu = new Set(alt);
      if (an) neu.add(id);
      else neu.delete(id);
      return neu;
    });

  const zahlungen = (g: SumupGruppeDto) => (
    <Stack gap={4}>
      {g.transaktionen.map((t) => (
        <Group key={t.id} gap="sm" wrap="nowrap" align="center" mih={telefon ? 42 : 30}>
          <Checkbox
            size={telefon ? 'md' : 'sm'}
            checked={!abgewaehlt.has(t.id)}
            onChange={(e) => umschalten(setAbgewaehlt, t.id, !e.currentTarget.checked)}
            disabled={!darfBuchen}
            aria-label={`Zahlung ${zeitBerlin(t.zeitpunkt)} ${centAnzeigen(t.betragCent)} mitbuchen`}
          />
          <Text size="sm" w={46}>
            {zeitBerlin(t.zeitpunkt)}
          </Text>
          <Text size="sm" w={90} style={BETRAG_STIL}>
            {centAnzeigen(t.betragCent)}
          </Text>
          <Text size="sm" style={{ flex: 1 }}>
            {sumupTypText(t.typ)}
            {t.trinkgeldCent > 0 && ` (Trinkgeld ${centAnzeigen(t.trinkgeldCent)})`}
            {t.sumupBenutzer && (
              <Text span c="dimmed">
                {' '}
                · {t.sumupBenutzer}
              </Text>
            )}
          </Text>
        </Group>
      ))}
    </Stack>
  );

  const eventSelect = (g: SumupGruppeDto) => (
    <Select
      size="md"
      searchable
      allowDeselect={false}
      aria-label={`Event für ${tagText(g.geschaeftstag)}`}
      data={sumupEventOptionen(events, g)}
      value={eventWert(g)}
      onChange={(v) => v && setEventWahl((alt) => ({ ...alt, [g.key]: v }))}
      disabled={!darfBuchen}
      comboboxProps={{ withinPortal: true }}
    />
  );

  const hinweise = (g: SumupGruppeDto) =>
    g.hinweise.length > 0 && (
      <Group gap={4}>
        {g.hinweise.map((h) => (
          <Badge key={h} color={h === 'trinkgeld' ? 'blue' : 'orange'} variant="light">
            {sumupHinweisText(h)}
          </Badge>
        ))}
      </Group>
    );

  const buchenKnopf = (g: SumupGruppeDto, volleBreite: boolean) => {
    const a = sumupAuswahl(g.transaktionen, abgewaehlt);
    return (
      <Button
        size="md"
        data-sumup-buchen={g.key}
        fullWidth={volleBreite}
        disabled={a.anzahl === 0 || a.summeCent === 0}
        onClick={() => setPruefen(vorbereiten(g))}
      >
        Buchen
      </Button>
    );
  };

  const netto = pruefen ? nettoSteuer(pruefen.summeCent, SUMUP_ERLOES_SATZ_BP) : null;

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group gap={4}>
        <Title order={2}>SumUp</Title>
        <InfoHinweis feld="SumUp" text={HILFE.sumup.guthaben} />
      </Group>

      <Group justify="space-between" align="flex-end" gap="md">
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            Letzter Abruf:{' '}
            {daten?.letzterAbrufAm
              ? `${tagAnzeigen(daten.letzterAbrufAm)} ${zeitBerlin(daten.letzterAbrufAm)}`
              : 'noch nie'}
          </Text>
          <Text>
            Saldo SumUp-Guthaben:{' '}
            <Text span fw={600} style={BETRAG_STIL}>
              {daten ? centAnzeigen(daten.saldoCent) : '–'}
            </Text>
          </Text>
        </Stack>
        {darfBuchen && (
          <Button
            size="md"
            loading={abruf.isPending}
            onClick={() => abruf.mutate()}
            fullWidth={!!telefon}
          >
            Jetzt abrufen
          </Button>
        )}
      </Group>

      {uebersicht.isPending && <Loader m="md" aria-label="SumUp wird geladen" />}
      {uebersicht.isError && (
        <Alert color="red">Die SumUp-Daten konnten nicht geladen werden.</Alert>
      )}

      {daten && (
        <>
          <Group gap={4}>
            <Title order={3}>Zahlungen prüfen</Title>
            <InfoHinweis feld="Zahlungen prüfen" text={HILFE.sumup.event} />
          </Group>
          {gruppen.length === 0 && <Text c="dimmed">Keine offenen SumUp-Zahlungen.</Text>}

          {telefon ? (
            <Stack>
              {gruppen.map((g) => {
                const a = sumupAuswahl(g.transaktionen, abgewaehlt);
                return (
                  <Paper key={g.key} withBorder p="md">
                    <Stack gap="sm">
                      <Group justify="space-between" wrap="nowrap">
                        <Text fw={600}>{tagText(g.geschaeftstag)}</Text>
                        <Text fw={600} style={BETRAG_STIL}>
                          {centAnzeigen(a.summeCent)}
                        </Text>
                      </Group>
                      {eventSelect(g)}
                      <Group justify="space-between">
                        <Text size="sm" c="dimmed">
                          {a.anzahl} von {g.anzahl} Zahlungen
                        </Text>
                        {hinweise(g)}
                      </Group>
                      <Button
                        variant="subtle"
                        size="md"
                        onClick={() => umschalten(setOffen, g.key, !offen.has(g.key))}
                        aria-expanded={offen.has(g.key)}
                      >
                        {offen.has(g.key) ? 'Zahlungen ausblenden' : 'Zahlungen anzeigen'}
                      </Button>
                      {offen.has(g.key) && zahlungen(g)}
                      {darfBuchen && buchenKnopf(g, true)}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            gruppen.length > 0 && (
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={40} />
                    <Table.Th>Tag</Table.Th>
                    <Table.Th w={320}>Event</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Anzahl</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Summe</Table.Th>
                    <Table.Th>Hinweise</Table.Th>
                    <Table.Th w={110} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {gruppen.map((g) => {
                    const a = sumupAuswahl(g.transaktionen, abgewaehlt);
                    const aufgeklappt = offen.has(g.key);
                    return (
                      <Fragment key={g.key}>
                        <Table.Tr>
                          <Table.Td>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              aria-label={
                                aufgeklappt
                                  ? 'Einzelzahlungen ausblenden'
                                  : 'Einzelzahlungen anzeigen'
                              }
                              aria-expanded={aufgeklappt}
                              onClick={() => umschalten(setOffen, g.key, !aufgeklappt)}
                            >
                              {aufgeklappt ? (
                                <IconChevronDown size={18} />
                              ) : (
                                <IconChevronRight size={18} />
                              )}
                            </ActionIcon>
                          </Table.Td>
                          <Table.Td style={{ whiteSpace: 'nowrap' }}>
                            {tagText(g.geschaeftstag)}
                          </Table.Td>
                          <Table.Td>{eventSelect(g)}</Table.Td>
                          <Table.Td style={BETRAG_STIL}>
                            {a.anzahl === g.anzahl ? g.anzahl : `${a.anzahl} von ${g.anzahl}`}
                          </Table.Td>
                          <Table.Td style={BETRAG_STIL}>{centAnzeigen(a.summeCent)}</Table.Td>
                          <Table.Td>{hinweise(g)}</Table.Td>
                          <Table.Td>{darfBuchen && buchenKnopf(g, false)}</Table.Td>
                        </Table.Tr>
                        {aufgeklappt && (
                          <Table.Tr>
                            <Table.Td />
                            <Table.Td colSpan={6}>{zahlungen(g)}</Table.Td>
                          </Table.Tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )
          )}
          {gruppen.length > 0 && (
            <Group gap={4}>
              <Text size="sm" c="dimmed">
                Abgewählte Zahlungen bleiben offen.
              </Text>
              <InfoHinweis feld="Abgewählte Zahlungen" text={HILFE.sumup.auswahl} />
            </Group>
          )}

          <Group gap={4} mt="md">
            <Title order={3}>Auszahlungen</Title>
            <InfoHinweis feld="Auszahlungen" text={HILFE.sumup.auszahlungen} />
          </Group>
          {daten.auszahlungen.length === 0 && (
            <Text c="dimmed">Keine SumUp-Auszahlungen vorhanden.</Text>
          )}
          {telefon ? (
            <Stack>
              {daten.auszahlungen.map((p) => (
                <Paper key={p.datum} withBorder p="md">
                  <Group justify="space-between" mb={4}>
                    <Text fw={600}>{datumAnzeigen(p.datum)}</Text>
                    <Badge color={p.status === 'zugeordnet' ? 'green' : 'gray'} variant="light">
                      {p.status}
                    </Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Brutto</Text>
                    <Text size="sm" style={BETRAG_STIL}>
                      {centAnzeigen(p.bruttoCent)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Gebühr</Text>
                    <Text size="sm" style={BETRAG_STIL}>
                      {centAnzeigen(p.gebuehrCent)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>
                      Netto
                    </Text>
                    <Text size="sm" fw={600} style={BETRAG_STIL}>
                      {centAnzeigen(p.nettoCent)}
                    </Text>
                  </Group>
                </Paper>
              ))}
            </Stack>
          ) : (
            daten.auszahlungen.length > 0 && (
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Datum</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Brutto</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Gebühr</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Netto</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {daten.auszahlungen.map((p) => (
                    <Table.Tr key={p.datum}>
                      <Table.Td>{datumAnzeigen(p.datum)}</Table.Td>
                      <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.bruttoCent)}</Table.Td>
                      <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.gebuehrCent)}</Table.Td>
                      <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.nettoCent)}</Table.Td>
                      <Table.Td>
                        <Badge color={p.status === 'zugeordnet' ? 'green' : 'gray'} variant="light">
                          {p.status}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )
          )}
        </>
      )}

      <Modal
        opened={pruefen !== null}
        onClose={() => !buchen.isPending && setPruefen(null)}
        title="SumUp-Zahlungen buchen"
        fullScreen={!!telefon}
      >
        {pruefen && netto && (
          <Stack>
            <Table>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Th>Tag</Table.Th>
                  <Table.Td>{tagText(pruefen.gruppe.geschaeftstag)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Event</Table.Th>
                  <Table.Td>{pruefen.eventText ?? 'ohne Event'}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Zahlungen</Table.Th>
                  <Table.Td>{pruefen.anzahl}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Erlös brutto</Table.Th>
                  <Table.Td style={BETRAG_STIL}>{centAnzeigen(pruefen.summeCent)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Erlös netto</Table.Th>
                  <Table.Td style={BETRAG_STIL}>{centAnzeigen(netto.nettoCent)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>USt 19 %</Table.Th>
                  <Table.Td style={BETRAG_STIL}>{centAnzeigen(netto.steuerCent)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Konten</Table.Th>
                  <Table.Td>SumUp-Guthaben an Kartenerlöse</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
            {buchen.isError && (
              <Alert color="red">
                {fehlerText(buchen.error, 'Das Buchen ist fehlgeschlagen.')}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button
                variant="default"
                size="md"
                disabled={buchen.isPending}
                onClick={() => setPruefen(null)}
              >
                Abbrechen
              </Button>
              <Button
                size="md"
                data-autofocus
                loading={buchen.isPending}
                onClick={() => buchen.mutate(pruefen)}
              >
                Jetzt buchen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
