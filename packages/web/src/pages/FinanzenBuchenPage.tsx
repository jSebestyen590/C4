import {
  Alert,
  Anchor,
  Button,
  Grid,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import { heuteBerlin, saldoWarnungen } from '@c4/shared';
import { useApi } from '../api';
import { zeigeGebucht } from '../gebuchtHinweis';
import { BetragFeld } from '../BetragFeld';
import { uebernahmeLesen, umbuchenPfad } from '../bargeldFormular';
import { BuchungsZusammenfassung } from '../BuchungsZusammenfassung';
import { BuchungszeilenTabelle } from '../BuchungszeilenTabelle';
import {
  buchbareKonten,
  buchungBody,
  fehlendeRichtung,
  formularFehler,
  formularLeer,
  leereZeile,
  schluesselFuer,
  summen,
  umbuchungFehler,
  warnungen,
  zeilenFuer,
  type FormularModus,
  type FreieZeile,
} from '../buchungFormular';
import { DatumFeld } from '../DatumFeld';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { HILFE } from '../finanzenHilfe';
import { finanzenKeys, jsonOderFehler, kontoOptionen, useKonten } from '../finanzenDaten';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const neueZeilen = (): FreieZeile[] => [leereZeile('zugang'), leereZeile('abgang')];

/**
 * Create a booking: a simple Umbuchung (Von -> Nach) or a free booking with any number of lines.
 * Desktop first: dense, keyboard driven (Enter moves on), live sum, summary before booking.
 */
export function FinanzenBuchenPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const konten = useKonten(false);
  const [datum, setDatum] = useState(heuteBerlin());
  const [text, setText] = useState('');
  const [modus, setModus] = useState<FormularModus>('umbuchung');
  const [von, setVon] = useState<string | null>(null);
  const [nach, setNach] = useState<string | null>(null);
  const [betrag, setBetrag] = useState<number | null>(null);
  const [zeilen, setZeilen] = useState<FreieZeile[]>(neueZeilen);
  const [beruehrt, setBeruehrt] = useState<ReadonlySet<string>>(new Set());
  const [versucht, setVersucht] = useState(false);
  const [pruefen, setPruefen] = useState(false);
  const [fokusKey, setFokusKey] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);
  const gebuchtRef = useRef(false);

  const wahl = useMemo(() => buchbareKonten(konten.data ?? []), [konten.data]);
  // Preselect mode and accounts from a link (`?modus=umbuchung&von=…&nach=…`) once; bad ids are ignored.
  const [parameter] = useSearchParams();
  const [vorbelegt, setVorbelegt] = useState(false);
  if (!vorbelegt && konten.data) {
    setVorbelegt(true);
    const gueltig = (id: string | null) =>
      id !== null && wahl.some((k) => k.id === id) ? id : null;
    if (parameter.get('modus') === 'frei') setModus('frei');
    if (parameter.get('modus') === 'umbuchung') setModus('umbuchung');
    const v = gueltig(parameter.get('von'));
    const n = gueltig(parameter.get('nach'));
    if (v) setVon(v);
    if (n && n !== v) setNach(n);
    const u = uebernahmeLesen(parameter);
    if (u.text) setText(u.text);
    if (u.datum) setDatum(u.datum);
  }
  const optionen = kontoOptionen(wahl);

  const stand = { modus, von, nach, betrag, zeilen };
  const kopf = { datum, text };
  const fehler = formularFehler(stand, wahl);
  const textLeer = text.trim() === '';
  // Accounts with Stückelung need denominations: they are booked on the Bargeld pages.
  const gewaehlt = modus === 'umbuchung' ? [von, nach] : zeilen.map((z) => z.kontoId);
  const stueckelungKonten = gewaehlt.filter((id) => wahl.find((k) => k.id === id)?.stueckelung);
  const umbuchungUebernehmen = modus === 'umbuchung' && !!von && !!nach;
  const gruende = [
    ...(datum ? [] : ['Bitte gib ein Datum an.']),
    ...(stueckelungKonten.length > 0
      ? ['Konten mit Stückelung buchst du unter „Bargeld“ mit Münzen und Scheinen.']
      : []),
    ...(textLeer ? ['Bitte gib einen Buchungstext ein.'] : []),
    ...fehler,
  ];
  const buchbar = gruende.length === 0;
  const uf = umbuchungFehler(stand);
  const zeigt = (feld: string) => versucht || beruehrt.has(feld);
  const anfassen = (feld: string) => setBeruehrt((alt) => new Set(alt).add(feld));

  // Unsaved input: warn on reload/close and on in-app navigation (the app uses a data router).
  const ungespeichert = !formularLeer(kopf, stand);
  const blocker = useBlocker(() => ungespeichert && !gebuchtRef.current);
  useEffect(() => {
    if (!ungespeichert) return;
    gebuchtRef.current = false;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [ungespeichert]);

  const buchen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      // Same content keeps the key (retry, double click); changed content gets a new one.
      const inhalt = JSON.stringify(buchungBody(kopf, stand, ''));
      schluessel.current = schluesselFuer(schluessel.current, inhalt, () => crypto.randomUUID());
      return jsonOderFehler<{ id: string; seq: number; wiederholt?: boolean }>(
        await api.finanzen.buchungen.$post({
          json: buchungBody(kopf, stand, schluessel.current.schluessel),
        }),
      );
    },
    onSuccess: async ({ id, seq, wiederholt }) => {
      gebuchtRef.current = true;
      schluessel.current = null;
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      zeigeGebucht(navigate, { id, seq, wiederholt });
      // Next Erfassung: keep date and mode, clear the rest, focus the first field.
      setText('');
      setVon(null);
      setNach(null);
      setBetrag(null);
      setZeilen(neueZeilen());
      setBeruehrt(new Set());
      setVersucht(false);
      setPruefen(false);
      setTimeout(() => textRef.current?.focus(), 0);
    },
  });

  const neueZeile = () => {
    if (zeilen.length >= 50) return;
    const z = leereZeile(fehlendeRichtung(summen(zeilen).differenz));
    setZeilen((alt) => [...alt, z]);
    setFokusKey(z.key);
  };
  const fokusErledigt = useCallback(() => setFokusKey(null), []);

  const pruefenOeffnen = () => {
    setVersucht(true);
    if (!buchbar) return;
    buchen.reset();
    // Balances change with every booking: reload them before the warnings are computed.
    void konten.refetch().then(() => setPruefen(true));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      pruefenOeffnen();
      return;
    }
    const el = e.target as HTMLElement;
    if (!el.matches('[data-nav]')) return;
    // An open account dropdown uses Enter to pick the highlighted entry.
    if (el.getAttribute('aria-expanded') === 'true') return;
    const felder = [...(formRef.current?.querySelectorAll<HTMLElement>('[data-nav]') ?? [])];
    const i = felder.indexOf(el);
    const naechstes = felder[i + 1];
    e.preventDefault();
    if (naechstes) naechstes.focus();
    else if (modus === 'frei') neueZeile();
    else pruefenOeffnen();
  };

  const kontoName = (id: string) => wahl.find((k) => k.id === id)?.name ?? id;
  const uebersicht = zeilenFuer(stand).map((z, i) => ({
    key: i,
    konto: kontoName(z.kontoId),
    betragCent: z.betragCent,
  }));

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Title order={2}>Buchen</Title>
      {konten.isPending && <Loader m="md" aria-label="Konten werden geladen" />}
      {konten.isError && <Alert color="red">Die Konten konnten nicht geladen werden.</Alert>}
      {konten.data && (
        <form
          ref={formRef}
          noValidate
          onKeyDown={onKeyDown}
          onSubmit={(e) => {
            e.preventDefault();
            pruefenOeffnen();
          }}
        >
          <Stack>
            <Group gap={2} align="center">
              <Text fw={500} size="sm">
                Art der Buchung
              </Text>
              <InfoHinweis feld="Art der Buchung" text={HILFE.buchen.modus} />
            </Group>
            <SegmentedControl
              size="md"
              aria-label="Art der Buchung"
              value={modus}
              onChange={(v) => setModus(v as FormularModus)}
              data={[
                { value: 'umbuchung', label: 'Umbuchung' },
                { value: 'frei', label: 'Frei' },
              ]}
              w={{ base: '100%', sm: 320 }}
            />
            <Grid align="flex-end" gap="md">
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <DatumFeld
                  label={<FeldLabel text="Datum" hilfe={HILFE.buchen.datum} />}
                  value={datum}
                  onWert={setDatum}
                  loeschbar={false}
                  onBlur={() => anfassen('datum')}
                  error={zeigt('datum') && !datum ? 'Bitte gib ein Datum an.' : undefined}
                  data-nav=""
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <TextInput
                  ref={textRef}
                  label={<FeldLabel text="Buchungstext" hilfe={HILFE.buchen.text} />}
                  value={text}
                  onChange={(e) => setText(e.currentTarget.value)}
                  onBlur={() => anfassen('text')}
                  maxLength={500}
                  error={
                    zeigt('text') && textLeer ? 'Bitte gib einen Buchungstext ein.' : undefined
                  }
                  data-nav=""
                />
              </Grid.Col>
            </Grid>

            {modus === 'umbuchung' ? (
              <SimpleGrid style={{ alignItems: 'end' }} cols={{ base: 1, md: 3 }} spacing="md">
                <Select
                  selectFirstOptionOnChange
                  label="Von Konto"
                  description="Hier geht der Betrag ab (Abgang)."
                  placeholder="Konto suchen"
                  searchable
                  inputMode="text"
                  data={optionen}
                  value={von}
                  onChange={setVon}
                  onBlur={() => anfassen('von')}
                  nothingFoundMessage="Kein Konto gefunden"
                  error={zeigt('von') ? uf.von : undefined}
                  data-nav=""
                />
                <Select
                  selectFirstOptionOnChange
                  label="Nach Konto"
                  description="Hier kommt der Betrag an (Zugang)."
                  placeholder="Konto suchen"
                  searchable
                  inputMode="text"
                  data={optionen}
                  value={nach}
                  onChange={setNach}
                  onBlur={() => anfassen('nach')}
                  nothingFoundMessage="Kein Konto gefunden"
                  error={zeigt('nach') ? uf.nach : undefined}
                  data-nav=""
                />
                <BetragFeld
                  label="Betrag"
                  value={betrag}
                  onWert={setBetrag}
                  onBlur={() => anfassen('betrag')}
                  error={zeigt('betrag') ? uf.betrag : undefined}
                  data-nav=""
                />
              </SimpleGrid>
            ) : (
              <BuchungszeilenTabelle
                zeilen={zeilen}
                onZeilen={setZeilen}
                konten={wahl}
                optionen={optionen}
                zeigeFehler={versucht}
                fokusKey={fokusKey}
                onFokusErledigt={fokusErledigt}
                onNeueZeile={neueZeile}
              />
            )}

            {stueckelungKonten.length > 0 && (
              <Alert color="orange">
                Dies ist eine{' '}
                <Anchor
                  component={Link}
                  // Umbuchung with both accounts carries accounts, text and date; Frei stays plain.
                  to={
                    umbuchungUebernehmen
                      ? umbuchenPfad({ von, nach, text: text.trim(), datum })
                      : umbuchenPfad()
                  }
                  onClick={() => {
                    // Nothing else typed (no amount): everything is carried, so do not warn.
                    if (umbuchungUebernehmen && betrag === null) gebuchtRef.current = true;
                  }}
                >
                  Bargeld-Umbuchung
                </Anchor>
                : Konten mit Stückelung buchst du dort mit Münzen und Scheinen.
              </Alert>
            )}
            <Group align="center" gap="md">
              <Button type="button" onClick={pruefenOeffnen} disabled={!buchbar}>
                Prüfen und buchen
              </Button>
              <InfoHinweis feld="Prüfen und buchen" text={HILFE.buchen.warnungen} />
              {buchbar ? (
                <Text size="sm" c="dimmed">
                  Tastenkürzel: Strg+Enter
                </Text>
              ) : (
                <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 200 }}>
                  Noch nicht möglich: {gruende[0]}
                  {gruende.length > 1 && ` (und ${gruende.length - 1} weitere Hinweise)`}
                </Text>
              )}
            </Group>
          </Stack>
        </form>
      )}
      {pruefen && (
        <BuchungsZusammenfassung
          datum={datum}
          text={text.trim()}
          zeilen={uebersicht}
          warnungen={[
            ...warnungen(kopf, stand, heuteBerlin()),
            ...saldoWarnungen(zeilenFuer(stand), konten.data ?? []),
          ]}
          laeuft={buchen.isPending}
          fehler={
            buchen.isError ? fehlerText(buchen.error, 'Das Buchen ist fehlgeschlagen.') : null
          }
          onBuchen={() => buchen.mutate()}
          onClose={() => setPruefen(false)}
        />
      )}
      <Modal
        opened={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Eingabe verwerfen?"
        centered
      >
        <Stack>
          <Text>
            Du hast noch nicht gebucht. Wenn du die Seite verlässt, gehen deine Eingaben verloren.
          </Text>
          <Button fullWidth color="red" onClick={() => blocker.proceed?.()}>
            Verwerfen
          </Button>
          <Button fullWidth variant="default" onClick={() => blocker.reset?.()}>
            Weiter bearbeiten
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
