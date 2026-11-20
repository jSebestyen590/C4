import { Alert, Button, Group, Modal, Select, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { centAnzeigen, datumAnzeigen, heuteBerlin, type AuslageBelegEintrag } from '@c4/shared';
import { useApi } from './api';
import { mengenLeer, type Mengen } from './bargeldFormular';
import { bezahltCent, stueckelungAus, stueckelungHinweis } from './belegFormular';
import { schluesselFuer } from './buchungFormular';
import { DatumFeld } from './DatumFeld';
import { BETRAG_STIL, finanzenKeys, jsonOderFehler, useBargeld } from './finanzenDaten';
import { HINWEIS_DAUER_MS } from './gebuchtHinweis';
import { HILFE } from './finanzenHilfe';
import { FeldLabel } from './InfoHinweis';
import { StatusName } from './StatusAnzeige';
import { StueckelungFeld } from './StueckelungFeld';
import { mitgliedName } from './mitglied';
import { fehlerText } from './warenApi';
import type { FinanzMitgliedDto } from '@c4/shared';

/**
 * Summary and form of a collective Erstattung of the selected Auslagen of one member: date, paid in
 * cash (Fach with denominations) or by bank. Books `Auslagen` against the Fach or the bank.
 */
export function ErstattungDialog({
  mitglied,
  mitgliedId,
  belege,
  onClose,
}: Readonly<{
  mitglied: FinanzMitgliedDto | null;
  mitgliedId: string;
  belege: readonly AuslageBelegEintrag[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const bargeld = useBargeld();
  const [datum, setDatum] = useState(heuteBerlin());
  const [zahlweg, setZahlweg] = useState<'bar' | 'bank'>('bank');
  const [fachId, setFachId] = useState<string | null>(null);
  const [gegeben, setGegeben] = useState<Mengen>({});
  const [wechselgeld, setWechselgeld] = useState<Mengen>({});
  const [versucht, setVersucht] = useState(false);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);

  const summe = belege.reduce((s, b) => s + b.summeCent, 0);
  const faecher = bargeld.data?.faecher ?? [];
  const fach = faecher.find((f) => f.id === fachId);
  const hinweis = stueckelungHinweis(summe, gegeben, wechselgeld);
  const gruende = [
    ...(summe === 0
      ? ['Die Summe der gewählten Belege ist 0 €: Es gibt nichts zu erstatten.']
      : []),
    ...(datum === '' ? ['Bitte gib das Datum an.'] : []),
    ...(zahlweg === 'bar' && !fachId
      ? [
          summe < 0
            ? 'Bitte wähle das Fach, in das bar eingezahlt wird.'
            : 'Bitte wähle das Fach, aus dem bar gezahlt wird.',
        ]
      : []),
    ...(zahlweg === 'bar' && mengenLeer(gegeben) && mengenLeer(wechselgeld)
      ? ['Bitte gib die Stückelung an.']
      : zahlweg === 'bar' && bezahltCent(gegeben, wechselgeld) !== summe
        ? ['Die Stückelung passt nicht zur Summe.']
        : []),
  ];

  const erstatten = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      const body = {
        mitgliedId,
        belegIds: belege.map((b) => b.id),
        datum,
        zahlweg,
        ...(zahlweg === 'bar' && { fachId, stueckelung: stueckelungAus(gegeben, wechselgeld) }),
      };
      schluessel.current = schluesselFuer(schluessel.current, JSON.stringify(body), () =>
        crypto.randomUUID(),
      );
      return jsonOderFehler<{ buchungSeq: number; wiederholt?: boolean }>(
        await api.finanzen.erstattungen.$post({
          json: { ...body, idempotenzSchluessel: schluessel.current.schluessel },
        }),
      );
    },
    onSuccess: ({ buchungSeq, wiederholt }) => {
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      notifications.show({
        color: 'green',
        autoClose: HINWEIS_DAUER_MS,
        message: wiederholt
          ? `${summe < 0 ? 'Einlage' : 'Erstattung'} war schon gebucht (Buchung Nr. ${buchungSeq}).`
          : `${summe < 0 ? 'Einlage' : 'Erstattung'} gebucht (Buchung Nr. ${buchungSeq}).`,
      });
      onClose();
    },
  });

  return (
    <Modal
      opened
      onClose={erstatten.isPending ? () => undefined : onClose}
      title={summe < 0 ? 'Einlage verbuchen' : 'Auslagen erstatten'}
      size="lg"
    >
      <Stack>
        <Text>
          An{' '}
          {mitglied ? (
            <StatusName status={mitglied.status}>{mitgliedName(mitglied)}</StatusName>
          ) : (
            'unbekanntes Mitglied'
          )}
          :
        </Text>
        <Table verticalSpacing={4} tabularNums>
          <Table.Tbody>
            {belege.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td>{b.nummer}</Table.Td>
                <Table.Td style={{ overflowWrap: 'anywhere' }}>
                  {b.rechnungssteller}, {datumAnzeigen(b.belegdatum)}
                </Table.Td>
                <Table.Td style={BETRAG_STIL}>{centAnzeigen(b.summeCent)}</Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr fw={700}>
              <Table.Td colSpan={2}>{summe < 0 ? 'Summe (Mitglied zahlt ein)' : 'Summe'}</Table.Td>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(summe)}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
        {summe < 0 && (
          <Alert color="blue" variant="light">
            {mitglied ? (
              <StatusName status={mitglied.status}>{mitgliedName(mitglied)}</StatusName>
            ) : (
              'Das Mitglied'
            )}{' '}
            schuldet dem Verein {centAnzeigen(-summe)}. {HILFE.belege.erstattungEinlage}
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          {HILFE.belege.erstattung}
        </Text>
        <Group align="flex-end" grow>
          <DatumFeld
            label="Datum der Erstattung"
            value={datum}
            onWert={setDatum}
            loeschbar={false}
          />
          <Select
            label={
              <FeldLabel
                text={summe < 0 ? 'Eingezahlt per' : 'Gezahlt per'}
                hilfe={HILFE.belege.zahlweg}
              />
            }
            allowDeselect={false}
            data={[
              { value: 'bank', label: 'Bank' },
              { value: 'bar', label: summe < 0 ? 'Bar (in den Safe)' : 'Bar (aus dem Safe)' },
            ]}
            value={zahlweg}
            onChange={(v) => setZahlweg(v === 'bar' ? 'bar' : 'bank')}
          />
        </Group>
        {zahlweg === 'bar' && (
          <Stack gap="xs">
            <Select
              label={<FeldLabel text="Fach" hilfe={HILFE.bargeld.fach} />}
              placeholder="Fach suchen"
              searchable
              data={faecher.map((f) => ({ value: f.id, label: f.name }))}
              value={fachId}
              onChange={setFachId}
              error={versucht && !fachId ? 'Bitte wähle ein Fach.' : undefined}
            />
            <StueckelungFeld
              label={
                summe < 0
                  ? 'Münzen und Scheine, die du erhältst'
                  : 'Münzen und Scheine, die du gibst, und Wechselgeld'
              }
              bestand={fach?.bestand}
              spalten={[
                {
                  id: 'ab',
                  label: summe < 0 ? 'Abgang (zurückgegeben)' : 'Abgang (gegeben)',
                  value: gegeben,
                  onChange: setGegeben,
                  richtung: 'ab',
                  begrenzen: !!fach,
                },
                {
                  id: 'zu',
                  label: summe < 0 ? 'Eingang (erhalten)' : 'Wechselgeld',
                  value: wechselgeld,
                  onChange: setWechselgeld,
                  richtung: 'zu',
                },
              ]}
            />
            {hinweis && (
              <Text size="sm" c="orange.8" role="status">
                {hinweis}
              </Text>
            )}
          </Stack>
        )}
        {versucht && gruende.length > 0 && <Alert color="red">{gruende[0]}</Alert>}
        {erstatten.isError && (
          <Alert color="red">{fehlerText(erstatten.error, 'Das Buchen ist fehlgeschlagen.')}</Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={erstatten.isPending}>
            Abbrechen
          </Button>
          <Button
            loading={erstatten.isPending}
            onClick={() => {
              setVersucht(true);
              if (gruende.length === 0) erstatten.mutate();
            }}
          >
            {summe < 0 ? 'Einlage buchen' : 'Erstattung buchen'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
