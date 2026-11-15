import {
  Alert,
  Button,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { centAnzeigen, heuteBerlin, type BuchungEingabeInput } from '@c4/shared';
import { useApi } from '../api';
import { zeigeGebucht } from '../gebuchtHinweis';
import {
  andereKonten,
  faecherAus,
  mengenLeer,
  mengenStueckelung,
  mengenSumme,
  stueckelungText,
  umbuchenFehler,
  umbuchenZeilen,
  type Mengen,
} from '../bargeldFormular';
import { schluesselFuer, warnungen as buchungsWarnungen } from '../buchungFormular';
import { BuchungsZusammenfassung } from '../BuchungsZusammenfassung';
import { DatumFeld } from '../DatumFeld';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { HILFE } from '../finanzenHilfe';
import { FINANZEN_KEY, jsonOderFehler, useBargeld, useKonten } from '../finanzenDaten';
import { StueckelungFeld } from '../StueckelungFeld';
import { enterWeiter, useVerwerfenWarnung } from '../useVerwerfenWarnung';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/**
 * Umbuchen between Fächer, or between a Fach and another account (bank, Geldtransit, ...): the
 * denominations are typed once; Von gets the negated, Nach the positive Stückelung. Desktop first.
 */
export function FinanzenBargeldUmbuchenPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const konten = useKonten(false);
  const bargeld = useBargeld();
  const [datum, setDatum] = useState(heuteBerlin());
  const [text, setText] = useState('');
  const [von, setVon] = useState<string | null>(null);
  const [nach, setNach] = useState<string | null>(null);
  const [mengen, setMengen] = useState<Mengen>({});
  const [versucht, setVersucht] = useState(false);
  const [pruefen, setPruefen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const vonRef = useRef<HTMLInputElement>(null);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);

  const alle = useMemo(() => konten.data ?? [], [konten.data]);
  const faecher = useMemo(() => faecherAus(alle), [alle]);
  const andere = useMemo(() => andereKonten(alle), [alle]);
  const optionen = [
    { group: 'Fächer', items: faecher.map((k) => ({ value: k.id, label: k.name })) },
    { group: 'Andere Konten', items: andere.map((k) => ({ value: k.id, label: k.name })) },
  ].filter((g) => g.items.length > 0);
  const name = (id: string | null) => alle.find((k) => k.id === id)?.name ?? '';

  const bestandVon = bargeld.data?.faecher.find((f) => f.id === von)?.bestand ?? null;
  const stand = { von, nach, mengen };
  const f = umbuchenFehler(stand, alle, bestandVon);
  const buchbar = f.alle.length === 0 && datum !== '';
  const buchText = text.trim() || `Umbuchung ${name(von)} → ${name(nach)}`;
  const ungespeichert = text.trim() !== '' || !mengenLeer(mengen);
  const warnung = useVerwerfenWarnung(ungespeichert);

  const body = (key: string): BuchungEingabeInput => ({
    idempotenzSchluessel: key,
    datum,
    text: buchText,
    quelleTyp: 'umbuchung',
    zeilen: umbuchenZeilen(stand, alle),
  });

  const buchen = useMutation({
    mutationFn: async () => {
      const inhalt = JSON.stringify(body(''));
      schluessel.current = schluesselFuer(schluessel.current, inhalt, () => crypto.randomUUID());
      return jsonOderFehler<{ id: string; seq: number; wiederholt?: boolean }>(
        await api.finanzen.buchungen.$post({ json: body(schluessel.current.schluessel) }),
      );
    },
    onSuccess: ({ id, seq, wiederholt }) => {
      warnung.abgeschlossen();
      schluessel.current = null;
      void qc.invalidateQueries({ queryKey: FINANZEN_KEY });
      zeigeGebucht(navigate, { id, seq, wiederholt });
      setText('');
      setNach(null);
      setMengen({});
      setVersucht(false);
      setPruefen(false);
      setTimeout(() => vonRef.current?.focus(), 0);
    },
  });

  const pruefenOeffnen = () => {
    setVersucht(true);
    if (!buchbar) return;
    buchen.reset();
    // The stock may have changed since the page was opened.
    void bargeld.refetch().then(() => setPruefen(true));
  };

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen/bargeld">Bargeld</ZurueckLink>
      <Title order={2}>Umbuchen</Title>
      <Text c="dimmed" size="sm">
        Bewegt Münzen und Scheine zwischen Fächern oder zwischen einem Fach und einem anderen Konto
        (z. B. Bank).
      </Text>
      {(konten.isPending || bargeld.isPending) && <Loader m="md" aria-label="Wird geladen" />}
      {(konten.isError || bargeld.isError) && (
        <Alert color="red">Die Konten konnten nicht geladen werden.</Alert>
      )}
      {konten.data && bargeld.data && (
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
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
              <DatumFeld
                label="Datum"
                value={datum}
                onWert={setDatum}
                loeschbar={false}
                data-nav=""
              />
              <Select
                ref={vonRef}
                selectFirstOptionOnChange
                label={<FeldLabel text="Von" hilfe={HILFE.bargeld.umbuchenVon} />}
                description="Hier geht das Geld ab."
                placeholder="Fach oder Konto suchen"
                searchable
                data={optionen}
                value={von}
                onChange={setVon}
                nothingFoundMessage="Nichts gefunden"
                error={versucht ? f.von : undefined}
                data-nav=""
              />
              <Select
                selectFirstOptionOnChange
                label={<FeldLabel text="Nach" hilfe={HILFE.bargeld.umbuchenNach} />}
                description="Hier kommt das Geld an."
                placeholder="Fach oder Konto suchen"
                searchable
                data={optionen}
                value={nach}
                onChange={setNach}
                nothingFoundMessage="Nichts gefunden"
                error={versucht ? f.nach : undefined}
                data-nav=""
              />
              <TextInput
                label={<FeldLabel text="Buchungstext" hilfe={HILFE.buchen.text} />}
                description="Leer lassen für den Standardtext."
                placeholder={`Umbuchung ${name(von) || 'Von'} → ${name(nach) || 'Nach'}`}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                maxLength={500}
                data-nav=""
              />
            </SimpleGrid>
            <Stack gap={4}>
              <Group gap={2}>
                <Text fw={500} size="sm">
                  Was wird umgebucht?
                </Text>
                <InfoHinweis feld="Bestand" text={HILFE.bargeld.bestand} />
              </Group>
              <StueckelungFeld
                label="Umzubuchende Münzen und Scheine"
                value={mengen}
                onChange={setMengen}
                bestand={bestandVon ?? undefined}
                bestandLabel={`Bestand ${name(von)}`}
                begrenzen={bestandVon !== null}
              />
              {versucht && f.mengen && (
                <Text size="sm" c="red" role="alert">
                  {f.mengen}
                </Text>
              )}
            </Stack>
            <Group align="center" gap="md">
              <Button type="button" onClick={pruefenOeffnen} disabled={!buchbar}>
                Prüfen und buchen
              </Button>
              {buchbar ? (
                <Text size="sm" c="dimmed">
                  Betrag {centAnzeigen(mengenSumme(mengen))} · Tastenkürzel: Strg+Enter
                </Text>
              ) : (
                <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 200 }}>
                  Noch nicht möglich: {f.alle[0] ?? 'Bitte gib ein Datum an.'}
                </Text>
              )}
            </Group>
          </Stack>
        </form>
      )}
      {pruefen && (
        <BuchungsZusammenfassung
          datum={datum}
          text={buchText}
          zeilen={umbuchenZeilen(stand, alle).map((z, i) => ({
            key: i,
            konto: name(z.kontoId),
            betragCent: z.betragCent,
          }))}
          extra={<Text size="sm">{stueckelungText(mengenStueckelung(mengen))}</Text>}
          warnungen={buchungsWarnungen(
            { datum, text: buchText },
            { modus: 'umbuchung', von, nach, betrag: mengenSumme(mengen), zeilen: [] },
            heuteBerlin(),
          )}
          laeuft={buchen.isPending}
          fehler={
            buchen.isError ? fehlerText(buchen.error, 'Das Buchen ist fehlgeschlagen.') : null
          }
          onBuchen={() => buchen.mutate()}
          onClose={() => setPruefen(false)}
        />
      )}
      {warnung.dialog}
    </Stack>
  );
}
