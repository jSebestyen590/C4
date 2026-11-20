import { Alert, Group, Loader, Paper, Select, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo } from 'react';
import { STEUERSAETZE, type ArtikelDto } from '@c4/shared';
import { useAuth } from '../auth';
import { satzText } from '../belegFormular';
import { useArtikel, useArtikelSteuersatz, useKonten } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import { KartenOderTabelle } from '../KartenOderTabelle';
import { fehlerAnzeigen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const SATZ_OPTIONEN = STEUERSAETZE.map((s) => ({ value: String(s), label: satzText(s) }));

const datumText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Berlin',
      })
    : 'noch nie';

/** Artikel (names of Posten): default tax rate, Kategorien booked on and booking statistics. */
export function FinanzenArtikelPage() {
  const { can } = useAuth();
  const darf = can('finanzen:buchen');
  const liste = useArtikel();
  const konten = useKonten(true);
  const setzen = useArtikelSteuersatz();
  const kontoName = useMemo(
    () => new Map((konten.data ?? []).map((k) => [k.id, k.name])),
    [konten.data],
  );

  const kategorienText = (a: ArtikelDto) =>
    a.kategorien.length === 0
      ? '–'
      : a.kategorien
          .map((k) => `${kontoName.get(k.kategorieId) ?? 'Unbekannt'} (${k.anzahl})`)
          .join(', ');

  const satzFeld = (a: ArtikelDto) => (
    <Select
      aria-label={`Standard-Steuersatz von ${a.name}`}
      data={SATZ_OPTIONEN}
      value={String(a.steuersatz)}
      allowDeselect={false}
      readOnly={!darf}
      disabled={setzen.isPending && setzen.variables?.id === a.id}
      w={{ base: '100%', sm: 130 }}
      onChange={(v) => {
        if (!v || Number(v) === a.steuersatz) return;
        setzen.mutate(
          { id: a.id, steuersatz: Number(v) },
          {
            onSuccess: () =>
              notifications.show({
                color: 'green',
                message: `Standard-Steuersatz von „${a.name}“ gespeichert.`,
              }),
            onError: (e) => fehlerAnzeigen(e, 'Das Speichern ist fehlgeschlagen.'),
          },
        );
      }}
    />
  );

  return (
    <Stack>
      <ZurueckLink to="/finanzen/belege">Belege</ZurueckLink>
      <Group gap={4}>
        <Title order={2}>Artikel</Title>
        <InfoHinweis feld="Artikel" text={HILFE.artikel.erklaerung} />
      </Group>
      {liste.isPending && <Loader m="md" aria-label="Wird geladen" />}
      {liste.isError && <Alert color="red">Die Artikel konnten nicht geladen werden.</Alert>}
      {liste.data && liste.data.length === 0 && (
        <Text c="dimmed">
          Noch keine Artikel. Sie entstehen, sobald ein Beleg mit Kategorie-Posten gebucht wird.
        </Text>
      )}
      {liste.data && (
        <KartenOderTabelle
          zeilen={liste.data}
          zeilenKey={(a) => a.id}
          karte={(a) => (
            <Paper withBorder p="md">
              <Stack gap="xs">
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  {a.name}
                </Text>
                {satzFeld(a)}
                <Text size="sm">Kategorien: {kategorienText(a)}</Text>
                <Text size="sm" c="dimmed">
                  {a.postenAnzahl} gebuchte Posten, zuletzt gebucht: {datumText(a.zuletztAm)}
                </Text>
              </Stack>
            </Paper>
          )}
          kopf={
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>
                <Group gap={4} wrap="nowrap">
                  Standard-Steuersatz
                  <InfoHinweis feld="Standard-Steuersatz" text={HILFE.artikel.steuersatz} />
                </Group>
              </Table.Th>
              <Table.Th>Kategorien</Table.Th>
              <Table.Th ta="right">Posten</Table.Th>
              <Table.Th>Zuletzt gebucht</Table.Th>
            </Table.Tr>
          }
          zeile={(a) => (
            <Table.Tr>
              <Table.Td style={{ overflowWrap: 'anywhere' }}>{a.name}</Table.Td>
              <Table.Td>{satzFeld(a)}</Table.Td>
              <Table.Td>{kategorienText(a)}</Table.Td>
              <Table.Td ta="right">{a.postenAnzahl}</Table.Td>
              <Table.Td style={{ whiteSpace: 'nowrap' }}>{datumText(a.zuletztAm)}</Table.Td>
            </Table.Tr>
          )}
        />
      )}
    </Stack>
  );
}
