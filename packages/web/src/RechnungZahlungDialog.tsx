import { Alert, Button, Checkbox, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  RECHNUNG_ZAHLWEGE,
  RECHNUNG_ZAHLWEG_LABELS,
  centAnzeigen,
  heuteBerlin,
  type BelegWarnungDto,
  type RechnungDetailDto,
  type RechnungZahlungErgebnisDto,
  type RechnungZahlweg,
} from '@c4/shared';
import { useApi } from './api';
import { mengenLeer, type Mengen } from './bargeldFormular';
import { bezahltCent, stueckelungAus, stueckelungHinweis } from './belegFormular';
import { schluesselFuer } from './buchungFormular';
import { DatumFeld } from './DatumFeld';
import { VerschiebHinweis } from './FestschreibungHinweise';
import { finanzenKeys, jsonOderFehler, useBargeld } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { HINWEIS_DAUER_MS } from './gebuchtHinweis';
import { FeldLabel } from './InfoHinweis';
import { StueckelungFeld } from './StueckelungFeld';
import { ApiFehler, fehlerText } from './warenApi';

/**
 * Records the full payment of a Rechnung: date and Zahlweg (Bank, bar into a Fach with the counted
 * notes and coins, or card via SumUp). Books the money in and moves the revenue with VAT to the
 * Erlöskonten (Ist-Versteuerung). Mount it only while it is open.
 */
export function RechnungZahlungDialog({
  rechnung,
  onClose,
}: Readonly<{ rechnung: RechnungDetailDto; onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const bargeld = useBargeld();
  const heute = heuteBerlin();
  const [datum, setDatum] = useState(heute);
  const [zahlweg, setZahlweg] = useState<RechnungZahlweg>('bank');
  const [fachId, setFachId] = useState<string | null>(null);
  // Money comes in: notes received (Eingang) and change given back (Abgang).
  const [erhalten, setErhalten] = useState<Mengen>({});
  const [zurueck, setZurueck] = useState<Mengen>({});
  const [versucht, setVersucht] = useState(false);
  const [warnungen, setWarnungen] = useState<BelegWarnungDto[]>([]);
  const [bestaetigt, setBestaetigt] = useState<ReadonlySet<string>>(new Set());
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);

  const summe = rechnung.bruttoCent;
  const faecher = bargeld.data?.faecher ?? [];
  const fach = faecher.find((f) => f.id === fachId);
  // The same sign convention as the Beleg form: an inflow is a negative amount there.
  const hinweis = stueckelungHinweis(-summe, zurueck, erhalten);
  const gruende = [
    ...(datum === '' ? ['Bitte gib das Zahldatum an.'] : []),
    ...(datum > heute ? ['Das Zahldatum darf nicht in der Zukunft liegen.'] : []),
    ...(zahlweg === 'bar' && !fachId ? ['Bitte wähle das Fach, in das bar gezahlt wurde.'] : []),
    ...(zahlweg === 'bar' && mengenLeer(zurueck) && mengenLeer(erhalten)
      ? ['Bitte gib die Stückelung an.']
      : zahlweg === 'bar' && bezahltCent(zurueck, erhalten) !== -summe
        ? ['Die Stückelung passt nicht zum Rechnungsbetrag.']
        : []),
  ];
  const offen = warnungen.some((w) => !bestaetigt.has(w.code));

  const zahlen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      const body = {
        zahlweg,
        datum,
        bestaetigt: [...bestaetigt].sort(),
        ...(zahlweg === 'bar' && { fachId, stueckelung: stueckelungAus(zurueck, erhalten) }),
      };
      schluessel.current = schluesselFuer(schluessel.current, JSON.stringify(body), () =>
        crypto.randomUUID(),
      );
      const res = await api.finanzen.rechnungen[':id'].zahlung.$post({
        param: { id: rechnung.id },
        json: { ...body, idempotenzSchluessel: schluessel.current.schluessel },
      });
      if ((res as { status: number }).status === 409) {
        const antwort = (await res.json()) as { error?: string; warnungen?: BelegWarnungDto[] };
        if (antwort.warnungen) setWarnungen(antwort.warnungen);
        throw new ApiFehler(409, antwort.error ?? 'Bitte bestätige die Hinweise.');
      }
      return jsonOderFehler<RechnungZahlungErgebnisDto>(res);
    },
    onSuccess: ({ buchungSeq, wiederholt }) => {
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      notifications.show({
        color: 'green',
        autoClose: HINWEIS_DAUER_MS,
        message: wiederholt
          ? `Die Zahlung war schon gebucht (Buchung Nr. ${buchungSeq}).`
          : `Zahlung gebucht (Buchung Nr. ${buchungSeq}).`,
      });
      onClose();
    },
  });

  return (
    <Modal
      opened
      onClose={zahlen.isPending ? () => undefined : onClose}
      title={`Zahlung zu Rechnung ${rechnung.nummer}`}
      size="lg"
    >
      <Stack>
        <Text>
          Die Rechnung wird ganz bezahlt: <b>{centAnzeigen(summe)}</b>. Erst mit der Zahlung
          entstehen Erlös und Umsatzsteuer, mit dem Zahldatum.
        </Text>
        <VerschiebHinweis datum={datum} />
        <Group align="flex-start" grow>
          <DatumFeld
            label="Zahldatum"
            tippbar
            value={datum}
            onWert={(wert) => setDatum(wert)}
            loeschbar={false}
          />
          <Select
            label={<FeldLabel text="Zahlweg" hilfe={HILFE.rechnungen.zahlweg} />}
            allowDeselect={false}
            data={RECHNUNG_ZAHLWEGE.map((z) => ({ value: z, label: RECHNUNG_ZAHLWEG_LABELS[z] }))}
            value={zahlweg}
            onChange={(v) => v && setZahlweg(v as RechnungZahlweg)}
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
              label="Münzen und Scheine, die in das Fach kommen"
              bestand={fach?.bestand}
              spalten={[
                {
                  id: 'zu',
                  label: 'Eingang (erhalten)',
                  value: erhalten,
                  onChange: setErhalten,
                  richtung: 'zu',
                },
                {
                  id: 'ab',
                  label: 'Wechselgeld (zurückgegeben)',
                  value: zurueck,
                  onChange: setZurueck,
                  richtung: 'ab',
                  begrenzen: !!fach,
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
        {warnungen.length > 0 && (
          <Alert color="orange" title="Bitte prüfen">
            <Stack gap="xs">
              {warnungen.map((w) => (
                <Checkbox
                  key={w.code}
                  checked={bestaetigt.has(w.code)}
                  onChange={(e) => {
                    const an = e.currentTarget.checked;
                    setBestaetigt((alt) => {
                      const neu = new Set(alt);
                      if (an) neu.add(w.code);
                      else neu.delete(w.code);
                      return neu;
                    });
                  }}
                  label={w.text}
                  aria-label={w.text}
                  disabled={zahlen.isPending}
                />
              ))}
            </Stack>
          </Alert>
        )}
        {versucht && gruende.length > 0 && <Alert color="red">{gruende[0]}</Alert>}
        {zahlen.isError &&
          !(zahlen.error instanceof ApiFehler && warnungen.length > 0 && offen) && (
            <Alert color="red">{fehlerText(zahlen.error, 'Das Buchen ist fehlgeschlagen.')}</Alert>
          )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={zahlen.isPending}>
            Abbrechen
          </Button>
          <Button
            loading={zahlen.isPending}
            disabled={offen}
            onClick={() => {
              setVersucht(true);
              if (gruende.length === 0) zahlen.mutate();
            }}
          >
            Zahlung buchen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
