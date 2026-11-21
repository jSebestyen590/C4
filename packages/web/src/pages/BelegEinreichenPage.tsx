import {
  ActionIcon,
  Alert,
  Autocomplete,
  Button,
  Collapse,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BELEG_POSTEN_ANZAHL_MAX,
  centAnzeigen,
  heuteBerlin,
  steuersaetzeAm,
  steuersatzUmstellen,
  type BelegDatei as BelegDateiDaten,
  type BelegWareDto,
} from '@c4/shared';
import { useApi } from '../api';
import { satzOptionen } from '../steuersaetze';
import { useAuth } from '../auth';
import { BelegNeueWare } from '../BelegNeueWare';
import { FeldZeile } from '../FeldZeile';
import { HILFE } from '../finanzenHilfe';
import { FeldLabel } from '../InfoHinweis';
import { gesamtAusExakt } from '../belegFormular';
import { BelegDateiFeld } from '../BelegDatei';
import { BetragFeld } from '../BetragFeld';
import { DatumFeld } from '../DatumFeld';
import { ZahlFeld } from '../ZahlFeld';
import {
  artikelNamen,
  artikelPatch,
  blurWaehltMarkierte,
  enterWaehltErsteOption,
  fokusAnzahl,
  kategorieOptionenMitVorschlaegen,
  NEUE_WARE,
  warePatch,
  wareFilter,
  wareOptionen,
} from '../belegAuswahl';
import { finanzenKeys, jsonOderFehler, useEinreichungAuswahl } from '../finanzenDaten';
import { lokalLesen, lokalLoeschen, lokalSpeichern } from '../entwurfSpeicher';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

interface PostenZeile {
  key: number;
  art: 'kategorie' | 'ware' | 'leergut';
  kategorieId: string | null;
  /** Leergut items: Anzahl = returned pieces, betragCent = deposit per piece (amount counts negative). */
  /** Ware items: the Ware, the Gebinde, the number of Gebinde and the deposit per Gebinde (null = none). */
  wareId: string | null;
  gebindeId: string | null;
  anzahl: number | string;
  /** Ware items: unrounded price (cent) of a typed calculation that is no whole cent; null = `betragCent` is exact. */
  preisExaktCent?: number | null;
  /** The typed calculation of the price, shown again after leaving the field. */
  preisFormel?: string | null;
  pfandCent: number | null;
  text: string;
  betragCent: number | null;
  steuersatz: string;
}

/** Ware select of one item: remembers its search text for "Neue Ware anlegen". */
function WareWahl({
  waren,
  zeile,
  wareId,
  neueWareErlaubt,
  error,
  onWare,
  onNeueWare,
}: Readonly<{
  waren: readonly BelegWareDto[];
  zeile: number;
  wareId: string | null;
  neueWareErlaubt: boolean;
  error?: string;
  onWare: (id: string | null) => void;
  onNeueWare: (suche: string) => void;
}>) {
  const [suche, setSuche] = useState('');
  const eingabe = useRef<HTMLInputElement>(null);
  const gewaehlt = useRef(false);
  return (
    <Select
      ref={eingabe}
      label="Ware"
      size="md"
      searchable
      onBlurCapture={blurWaehltMarkierte}
      onKeyDownCapture={enterWaehltErsteOption}
      onFocus={() => {
        gewaehlt.current = false;
      }}
      selectFirstOptionOnChange
      nothingFoundMessage="Keine Ware gefunden"
      data={wareOptionen(waren, neueWareErlaubt)}
      filter={wareFilter(waren)}
      value={wareId}
      searchValue={suche}
      onSearchChange={setSuche}
      onChange={(v) => {
        if (v === NEUE_WARE) {
          // Only a deliberate pick (Enter, tap) creates a Ware, not leaving the field.
          if (document.activeElement === eingabe.current) onNeueWare(suche);
          const alt = waren.find((w) => w.id === wareId)?.name ?? '';
          setTimeout(() => setSuche(alt), 0);
          return;
        }
        // The blur after a pick (moving on) must not pick the highlighted first option.
        if (gewaehlt.current && document.activeElement !== eingabe.current) return;
        gewaehlt.current = true;
        onWare(v);
        if (v) fokusAnzahl(String(zeile));
      }}
      error={error}
    />
  );
}

/** Patch fields of a shared item patch that the member form keeps (tax rate as text). */
const mitgliedPatch = ({
  steuersatz,
  gebindeId,
  pfandCent,
  kategorieId,
}: Partial<{
  steuersatz: number;
  gebindeId: string | null;
  pfandCent: number | null;
  kategorieId: string | null;
}>): Partial<PostenZeile> => {
  return {
    ...(steuersatz !== undefined && { steuersatz: String(steuersatz) }),
    ...(gebindeId !== undefined && { gebindeId }),
    ...(pfandCent !== undefined && { pfandCent }),
    ...(kategorieId !== undefined && { kategorieId }),
  };
};

/** Local storage key of the form being typed; cleared on submit or "Neu beginnen". */
const LOKAL = 'beleg-einreichen';

interface LokalerStand {
  datei: BelegDateiDaten | null;
  datum: string;
  betrag: number | null;
  steller: string;
  notiz: string;
  aufteilen: boolean;
  posten: PostenZeile[];
  naechsterKey: number;
}

/** The stored form, or null when absent or not shaped like one. */
function lokalerStand(): LokalerStand | null {
  const l = lokalLesen<Partial<LokalerStand>>(LOKAL)?.wert;
  if (!l || !Array.isArray(l.posten) || typeof l.datum !== 'string') return null;
  return {
    datei: l.datei ?? null,
    datum: l.datum,
    betrag: typeof l.betrag === 'number' ? l.betrag : null,
    steller: typeof l.steller === 'string' ? l.steller : '',
    notiz: typeof l.notiz === 'string' ? l.notiz : '',
    aufteilen: l.aufteilen === true,
    posten: l.posten,
    naechsterKey: typeof l.naechsterKey === 'number' ? l.naechsterKey : l.posten.length + 1,
  };
}

const heute = () => new Date().toLocaleDateString('sv-SE');

/**
 * Members submit a Beleg: photo/file, date, amount, Rechnungssteller (free text; the list needs
 * `finanzen:lesen`), note. The Finanzer:in adds Kategorien and books it.
 */
export function BelegEinreichenPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [wiederhergestellt, setWiederhergestellt] = useState(() => lokalerStand());
  const [neustart, setNeustart] = useState(0);
  const start = wiederhergestellt;
  const [datei, setDatei] = useState<BelegDateiDaten | null>(start?.datei ?? null);
  const [lokaleUrl, setLokaleUrl] = useState<string | null>(null);
  const [datum, setDatumRoh] = useState(start?.datum ?? heute());
  const [betrag, setBetrag] = useState<number | null>(start?.betrag ?? null);
  const [steller, setSteller] = useState(start?.steller ?? '');
  const [notiz, setNotiz] = useState(start?.notiz ?? '');
  const auswahl = useEinreichungAuswahl();
  const { can } = useAuth();
  const waren = auswahl.data?.waren ?? [];
  const [neueWare, setNeueWare] = useState<{ key: number; name: string } | null>(null);
  const kategorien = auswahl.data?.kategorien ?? [];
  // The tax rates follow the Belegdatum.
  const saetzeAm = steuersaetzeAm(auswahl.data?.steuersatzZeitraeume ?? [], datum || heute());
  const artikelVorschlaege = auswahl.data?.artikelVorschlaege ?? [];
  // A Belegdatum in another tax period converts the rates of the items (regular stays regular).
  const setDatum = (neu: string) => {
    const zeitraeume = auswahl.data?.steuersatzZeitraeume ?? [];
    const alt = saetzeAm;
    const neuSaetze = steuersaetzeAm(zeitraeume, neu || heute());
    setDatumRoh(neu);
    if (alt.regel === neuSaetze.regel && alt.ermaessigt === neuSaetze.ermaessigt) return;
    setPosten((ps) =>
      ps.map((p) => {
        const satz = steuersatzUmstellen(Number(p.steuersatz), alt, neuSaetze);
        return {
          ...p,
          steuersatz: String(neuSaetze.saetze.includes(satz) ? satz : neuSaetze.regel),
        };
      }),
    );
  };
  const [aufteilen, setAufteilen] = useState(start?.aufteilen ?? false);
  const [posten, setPosten] = useState<PostenZeile[]>(start?.posten ?? []);
  const [naechsterKey, setNaechsterKey] = useState(start?.naechsterKey ?? 1);
  // Set after a submit or a restart, so the cleared storage is not written again by the next render.
  const [verworfen, setVerworfen] = useState(false);
  const [versucht, setVersucht] = useState(false);

  const gewaehlt = auswahl.data?.rechnungssteller.find(
    (r) => r.name.toLowerCase() === steller.trim().toLowerCase(),
  );
  const wareAngelegt = async (key: number, ware: { id: string }) => {
    await qc.invalidateQueries({ queryKey: finanzenKeys.einreichungAuswahl });
    const neu = qc.getQueryData<typeof auswahl.data>(finanzenKeys.einreichungAuswahl);
    aendern(
      key,
      mitgliedPatch(warePatch(neu?.waren ?? [], neu?.kategorien ?? [], ware.id, saetzeAm)),
    );
    fokusAnzahl(String(key));
  };
  const aendern = (key: number, teil: Partial<PostenZeile>) =>
    setPosten((ps) => ps.map((p) => (p.key === key ? { ...p, ...teil } : p)));

  // Mirror the form into the local storage, so a reload keeps it (incl. the uploaded file).
  useEffect(() => {
    if (verworfen) return;
    const leer = !datei && betrag === null && steller === '' && notiz === '' && posten.length === 0;
    if (leer) lokalLoeschen(LOKAL);
    else
      lokalSpeichern<LokalerStand>(LOKAL, {
        datei,
        datum,
        betrag,
        steller,
        notiz,
        aufteilen,
        posten,
        naechsterKey,
      });
  }, [datei, datum, betrag, steller, notiz, aufteilen, posten, naechsterKey, verworfen]);

  const neuBeginnen = () => {
    lokalLoeschen(LOKAL);
    setWiederhergestellt(null);
    setDatei(null);
    setLokaleUrl(null);
    setDatum(heute());
    setBetrag(null);
    setSteller('');
    setNotiz('');
    setAufteilen(false);
    setPosten([]);
    setNaechsterKey(1);
    setVersucht(false);
    setNeustart((n) => n + 1);
  };

  const einreichen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      jsonOderFehler<{ id: string }>(
        await api.finanzen.einreichungen.$post({
          json: {
            datei: datei as BelegDateiDaten,
            belegdatum: datum,
            betragCent: betrag as number,
            ...(gewaehlt
              ? { rechnungsstellerId: gewaehlt.id }
              : { rechnungsstellerName: steller.trim() || undefined }),
            notiz: notiz.trim() || undefined,
            posten: posten.map((p) =>
              p.art === 'leergut'
                ? {
                    art: 'leergut' as const,
                    text: p.text.trim(),
                    anzahlMilli: Math.round(Number(p.anzahl) * 1000),
                    einzelpreisCent: p.betragCent as number,
                    steuersatz: Number(p.steuersatz),
                  }
                : p.art === 'ware'
                  ? {
                      art: 'ware' as const,
                      wareId: p.wareId,
                      gebindeId: p.gebindeId,
                      anzahlMilli: Math.round(Number(p.anzahl) * 1000),
                      einzelpreisCent: p.betragCent as number,
                      ...(p.preisExaktCent != null && {
                        gesamtCent: gesamtAusExakt(
                          p.preisExaktCent,
                          Math.round(Number(p.anzahl) * 1000),
                        ),
                      }),
                      steuersatz: Number(p.steuersatz),
                      pfandCent: p.pfandCent,
                    }
                  : {
                      art: 'kategorie' as const,
                      kategorieId: p.kategorieId,
                      text: p.text,
                      anzahlMilli: 1000,
                      einzelpreisCent: p.betragCent as number,
                      steuersatz: Number(p.steuersatz),
                    },
            ),
          },
        }),
      ),
    onSuccess: () => {
      setVerworfen(true);
      lokalLoeschen(LOKAL);
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      notifications.show({ color: 'green', message: 'Dein Beleg wurde eingereicht.' });
      void navigate('/belege');
    },
  });

  const fehlt = {
    datei: !datei,
    datum: datum === '',
    datumZukunft: datum !== '' && datum > heuteBerlin(),
    betrag: betrag === null,
  };
  const postenFehlt = (p: PostenZeile) =>
    (p.art === 'ware'
      ? p.wareId === null || p.gebindeId === null || !(Number(p.anzahl) >= 1)
      : p.art === 'leergut'
        ? p.text.trim() === '' || !(Number(p.anzahl) >= 1)
        : p.kategorieId === null || p.text.trim() === '') ||
    p.betragCent === null ||
    (p.art !== 'kategorie' && p.betragCent < 0);
  const postenOk = !posten.some(postenFehlt);
  const gueltig = !fehlt.datei && !fehlt.datum && !fehlt.datumZukunft && !fehlt.betrag && postenOk;

  return (
    <Stack gap="md" key={neustart}>
      <ZurueckLink to="/belege">Meine Belege</ZurueckLink>
      <Title order={2}>Beleg einreichen</Title>
      {wiederhergestellt && (
        <Alert color="blue" variant="light" title="Entwurf wiederhergestellt">
          <Group justify="space-between" align="center" wrap="wrap">
            Deine letzten Eingaben sind wieder da.
            <Button variant="default" size="md" onClick={neuBeginnen}>
              Neu beginnen
            </Button>
          </Group>
        </Alert>
      )}
      <BelegDateiFeld
        einreichung
        datei={datei}
        vorschauUrl={lokaleUrl}
        onDatei={(d, url) => {
          setDatei(d);
          setLokaleUrl(url);
        }}
        onEntfernen={() => {
          setDatei(null);
          setLokaleUrl(null);
        }}
        disabled={einreichen.isPending}
        fehler={versucht && fehlt.datei ? 'Bitte lade ein Foto oder eine Datei hoch.' : undefined}
      />
      <DatumFeld
        label="Belegdatum"
        size="md"
        value={datum}
        onWert={setDatum}
        loeschbar={false}
        max={heuteBerlin()}
        error={
          fehlt.datumZukunft
            ? 'Das Belegdatum darf nicht in der Zukunft liegen.'
            : versucht && fehlt.datum
              ? 'Bitte gib das Datum an.'
              : undefined
        }
      />
      <BetragFeld
        label="Betrag"
        size="md"
        value={betrag}
        onWert={setBetrag}
        negativ
        description="Auch 0 € oder ein negativer Betrag ist möglich, zum Beispiel bei einer Pfandrückgabe."
        error={versucht && fehlt.betrag ? 'Bitte gib den Betrag an.' : undefined}
      />
      {betrag !== null && betrag < 0 && (
        <Alert color="blue" variant="light">
          Du schuldest dem Verein {centAnzeigen(-betrag)}. {HILFE.belege.betragNegativ}
        </Alert>
      )}
      <Autocomplete
        label="Rechnungssteller"
        description="Wähle aus der Liste oder tippe einen anderen Namen, zum Beispiel „Metro“."
        size="md"
        maxLength={120}
        data={auswahl.data?.rechnungssteller.map((r) => r.name) ?? []}
        value={steller}
        onChange={setSteller}
        comboboxProps={{ withinPortal: true }}
      />
      <Textarea
        label="Notiz"
        description="Optional, zum Beispiel wofür der Einkauf war."
        size="md"
        autosize
        minRows={2}
        maxLength={500}
        value={notiz}
        onChange={(e) => setNotiz(e.currentTarget.value)}
      />
      {posten.length === 0 && (
        <Button
          size="md"
          variant="subtle"
          fullWidth
          onClick={() => setAufteilen((a) => !a)}
          aria-expanded={aufteilen}
        >
          {aufteilen ? 'Aufteilen ausblenden' : 'Aufteilen (optional)'}
        </Button>
      )}
      <Collapse expanded={aufteilen || posten.length > 0}>
        <Stack gap="sm">
          {posten.map((p, i) => (
            <Paper key={p.key} withBorder p="sm" data-zeile={p.key}>
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Title order={5}>Posten {i + 1}</Title>
                  <ActionIcon
                    size={42}
                    variant="subtle"
                    color="red"
                    aria-label={`Posten ${i + 1} entfernen`}
                    onClick={() => setPosten((ps) => ps.filter((x) => x.key !== p.key))}
                  >
                    <IconTrash size={20} />
                  </ActionIcon>
                </Group>
                <SegmentedControl
                  fullWidth
                  size="md"
                  aria-label={`Art von Posten ${i + 1}`}
                  value={p.art}
                  onChange={(v) =>
                    aendern(p.key, {
                      art: v as PostenZeile['art'],
                      kategorieId: null,
                      text: '',
                      wareId: null,
                      gebindeId: null,
                      pfandCent: null,
                      betragCent: null,
                      anzahl: '',
                      preisExaktCent: null,
                    })
                  }
                  data={[
                    { value: 'ware', label: 'Ware' },
                    { value: 'kategorie', label: 'Kategorie' },
                    { value: 'leergut', label: 'Leergut' },
                  ]}
                />
                <FeldZeile cols={1} spacing="xs" verticalSpacing={0}>
                  {p.art === 'kategorie' && (
                    <>
                      <Autocomplete
                        label="Artikel"
                        size="md"
                        placeholder="z. B. Deko"
                        maxLength={100}
                        data={artikelNamen(artikelVorschlaege)}
                        value={p.text}
                        onChange={(v) =>
                          aendern(
                            p.key,
                            (({ text, ...teil }) => ({ text, ...mitgliedPatch(teil) }))(
                              artikelPatch(p, kategorien, artikelVorschlaege, v, saetzeAm),
                            ),
                          )
                        }
                        error={
                          versucht && p.text.trim() === '' ? 'Bitte gib den Artikel an.' : undefined
                        }
                      />
                      <Select
                        label={<FeldLabel text="Kategorie" hilfe={HILFE.belege.kategorie} />}
                        size="md"
                        searchable
                        onBlurCapture={blurWaehltMarkierte}
                        onKeyDownCapture={enterWaehltErsteOption}
                        selectFirstOptionOnChange
                        allowDeselect={false}
                        data={kategorieOptionenMitVorschlaegen(
                          kategorien,
                          artikelVorschlaege,
                          p.text,
                        )}
                        value={p.kategorieId}
                        onChange={(v) => aendern(p.key, { kategorieId: v })}
                        error={
                          versucht && p.kategorieId === null
                            ? 'Bitte wähle eine Kategorie.'
                            : undefined
                        }
                      />
                    </>
                  )}
                  {p.art === 'leergut' && (
                    <TextInput
                      label="Beschreibung"
                      size="md"
                      placeholder="z. B. Pfandrückgabe Kästen"
                      maxLength={200}
                      value={p.text}
                      onChange={(e) => aendern(p.key, { text: e.currentTarget.value })}
                      error={
                        versucht && p.text.trim() === ''
                          ? 'Bitte beschreibe das Leergut.'
                          : undefined
                      }
                    />
                  )}
                  {p.art === 'ware' && (
                    <>
                      <WareWahl
                        waren={waren}
                        zeile={p.key}
                        wareId={p.wareId}
                        neueWareErlaubt={can('waren:verwalten')}
                        error={versucht && p.wareId === null ? 'Bitte wähle eine Ware.' : undefined}
                        onWare={(v) =>
                          aendern(p.key, {
                            wareId: v,
                            ...mitgliedPatch(warePatch(waren, kategorien, v, saetzeAm)),
                          })
                        }
                        onNeueWare={(suche) => setNeueWare({ key: p.key, name: suche.trim() })}
                      />
                      <Select
                        label="Gebinde"
                        size="md"
                        allowDeselect={false}
                        placeholder={p.wareId ? 'Gebinde wählen' : 'Erst die Ware wählen'}
                        disabled={!p.wareId}
                        data={(waren.find((w) => w.id === p.wareId)?.gebinde ?? []).map((g) => ({
                          value: g.id,
                          label: g.bezeichnung,
                        }))}
                        value={p.gebindeId}
                        onChange={(v) =>
                          aendern(p.key, {
                            gebindeId: v,
                            pfandCent:
                              waren.find((w) => w.id === p.wareId)?.gebinde.find((g) => g.id === v)
                                ?.pfandGesamtCent ?? null,
                          })
                        }
                        error={
                          versucht && p.wareId !== null && p.gebindeId === null
                            ? 'Bitte wähle ein Gebinde.'
                            : undefined
                        }
                      />
                    </>
                  )}
                  {p.art !== 'kategorie' && (
                    <ZahlFeld
                      label={
                        p.art === 'leergut' ? (
                          <FeldLabel text="Anzahl zurück" hilfe={HILFE.belege.leergutMitglied} />
                        ) : (
                          'Anzahl Gebinde'
                        )
                      }
                      size="md"
                      min={1}
                      max={9999}
                      allowDecimal={false}
                      value={p.anzahl}
                      onChange={(v) => aendern(p.key, { anzahl: v })}
                      data-anzahl=""
                      error={
                        versucht && !(Number(p.anzahl) >= 1)
                          ? p.art === 'leergut'
                            ? 'Die Anzahl muss größer als 0 sein.'
                            : 'Bitte gib die Anzahl an.'
                          : undefined
                      }
                    />
                  )}
                </FeldZeile>
                <FeldZeile
                  cols={{ base: 2, sm: p.art === 'ware' ? 3 : 2 }}
                  spacing="xs"
                  verticalSpacing={0}
                >
                  <BetragFeld
                    label={
                      <FeldLabel
                        text={
                          p.art === 'ware'
                            ? 'Preis je Gebinde (brutto)'
                            : p.art === 'leergut'
                              ? 'Pfand je Stück'
                              : 'Betrag (brutto)'
                        }
                        hilfe={HILFE.belege.preisRechnen}
                      />
                    }
                    size="md"
                    negativ={p.art === 'kategorie'}
                    rechnen
                    value={p.betragCent}
                    formel={p.preisFormel}
                    onWert={(c, exakt, formel) =>
                      aendern(p.key, {
                        betragCent: c,
                        preisFormel: formel || null,
                        preisExaktCent:
                          p.art === 'ware' && c !== null && exakt != null && exakt !== c
                            ? exakt
                            : null,
                      })
                    }
                    error={
                      versucht &&
                      (p.betragCent === null || (p.art !== 'kategorie' && p.betragCent < 0))
                        ? p.art === 'leergut'
                          ? 'Bitte gib den Pfand an (0 € oder mehr).'
                          : 'Bitte gib den Betrag an.'
                        : undefined
                    }
                  />
                  {p.art === 'ware' && (
                    <BetragFeld
                      label="Pfand je Gebinde"
                      size="md"
                      placeholder="kein Pfand"
                      value={p.pfandCent}
                      onWert={(c) => aendern(p.key, { pfandCent: c })}
                    />
                  )}
                  <Select
                    label="Steuersatz"
                    size="md"
                    allowDeselect={false}
                    data={satzOptionen(saetzeAm.saetze)}
                    value={p.steuersatz}
                    onChange={(v) => aendern(p.key, { steuersatz: v ?? String(saetzeAm.regel) })}
                  />
                </FeldZeile>
                {p.art === 'ware' && p.preisExaktCent != null && (
                  <Text size="sm" c="dimmed">
                    ≈ {centAnzeigen(p.betragCent ?? 0)} je Gebinde
                  </Text>
                )}
                {p.art === 'leergut' && p.betragCent !== null && Number(p.anzahl) >= 1 && (
                  <Text size="sm" fw={600}>
                    Betrag: {centAnzeigen(-Math.round(Number(p.anzahl) * p.betragCent))}
                  </Text>
                )}
              </Stack>
            </Paper>
          ))}
          {posten.length < BELEG_POSTEN_ANZAHL_MAX && (
            <Button
              size="md"
              variant="light"
              onClick={() => {
                setPosten((ps) => [
                  ...ps,
                  {
                    key: naechsterKey,
                    art: 'ware',
                    kategorieId: null,
                    wareId: null,
                    gebindeId: null,
                    anzahl: '',
                    pfandCent: null,
                    text: '',
                    betragCent: null,
                    steuersatz: String(saetzeAm.regel),
                  },
                ]);
                setNaechsterKey((k) => k + 1);
              }}
            >
              Posten hinzufügen
            </Button>
          )}
        </Stack>
      </Collapse>
      {neueWare && (
        <BelegNeueWare
          name={neueWare.name}
          onAngelegt={(ware) => void wareAngelegt(neueWare.key, ware)}
          onClose={() => setNeueWare(null)}
        />
      )}
      <Alert color="blue" variant="light">
        Die Finanzer:innen prüfen deinen Beleg und buchen ihn als Auslage. Den Stand siehst du unter
        „Meine Belege“; bei Rückfragen bekommst du eine Nachricht.
      </Alert>
      {einreichen.error && (
        <Alert color="red">
          {fehlerText(einreichen.error, 'Der Beleg konnte nicht eingereicht werden.')}
        </Alert>
      )}
      <Button
        size="md"
        fullWidth
        loading={einreichen.isPending}
        onClick={() => {
          setVersucht(true);
          if (gueltig) einreichen.mutate();
        }}
      >
        Einreichen
      </Button>
    </Stack>
  );
}
