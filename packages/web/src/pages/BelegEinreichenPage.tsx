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
  Textarea,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BELEG_POSTEN_ANZAHL_MAX, type BelegDatei as BelegDateiDaten } from '@c4/shared';
import { useApi } from '../api';
import { BelegDateiFeld } from '../BelegDatei';
import { BetragFeld } from '../BetragFeld';
import { DatumFeld } from '../DatumFeld';
import { ZahlFeld } from '../ZahlFeld';
import {
  artikelNamen,
  kategorieOptionenMitVorschlaegen,
  standardGebindeWaehlen,
  vorgeschlageneKategorie,
  wareFilter,
  wareOptionen,
} from '../belegAuswahl';
import { finanzenKeys, jsonOderFehler, useEinreichungAuswahl } from '../finanzenDaten';
import { lokalLesen, lokalLoeschen, lokalSpeichern } from '../entwurfSpeicher';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

interface PostenZeile {
  key: number;
  art: 'kategorie' | 'ware';
  kategorieId: string | null;
  /** Ware items: the Ware, the Gebinde, the number of Gebinde and the deposit per Gebinde (null = none). */
  wareId: string | null;
  gebindeId: string | null;
  anzahl: number | string;
  pfandCent: number | null;
  text: string;
  betragCent: number | null;
  steuersatz: string;
}

const STEUER_OPTIONEN = [
  { value: '1900', label: '19 %' },
  { value: '700', label: '7 %' },
  { value: '0', label: '0 %' },
];

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
  const [datum, setDatum] = useState(start?.datum ?? heute());
  const [betrag, setBetrag] = useState<number | null>(start?.betrag ?? null);
  const [steller, setSteller] = useState(start?.steller ?? '');
  const [notiz, setNotiz] = useState(start?.notiz ?? '');
  const auswahl = useEinreichungAuswahl();
  const waren = auswahl.data?.waren ?? [];
  const kategorien = auswahl.data?.kategorien ?? [];
  const artikelVorschlaege = auswahl.data?.artikelVorschlaege ?? [];
  const [aufteilen, setAufteilen] = useState(start?.aufteilen ?? false);
  const [posten, setPosten] = useState<PostenZeile[]>(start?.posten ?? []);
  const [naechsterKey, setNaechsterKey] = useState(start?.naechsterKey ?? 1);
  // Set after a submit or a restart, so the cleared storage is not written again by the next render.
  const [verworfen, setVerworfen] = useState(false);
  const [versucht, setVersucht] = useState(false);

  const gewaehlt = auswahl.data?.rechnungssteller.find(
    (r) => r.name.toLowerCase() === steller.trim().toLowerCase(),
  );
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
              p.art === 'ware'
                ? {
                    art: 'ware' as const,
                    wareId: p.wareId,
                    gebindeId: p.gebindeId,
                    anzahlMilli: Math.round(Number(p.anzahl) * 1000),
                    einzelpreisCent: p.betragCent as number,
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
    betrag: betrag === null || betrag <= 0,
  };
  const postenFehlt = (p: PostenZeile) =>
    (p.art === 'ware'
      ? p.wareId === null || p.gebindeId === null || !(Number(p.anzahl) >= 1)
      : p.kategorieId === null || p.text.trim() === '') ||
    p.betragCent === null ||
    p.betragCent <= 0;
  const postenOk = !posten.some(postenFehlt);
  const gueltig = !fehlt.datei && !fehlt.datum && !fehlt.betrag && postenOk;

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
        error={versucht && fehlt.datum ? 'Bitte gib das Datum an.' : undefined}
      />
      <BetragFeld
        label="Betrag"
        size="md"
        value={betrag}
        onWert={setBetrag}
        error={versucht && fehlt.betrag ? 'Bitte gib den Betrag an.' : undefined}
      />
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
            <Paper key={p.key} withBorder p="sm">
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
                    })
                  }
                  data={[
                    { value: 'ware', label: 'Ware' },
                    { value: 'kategorie', label: 'Kategorie' },
                  ]}
                />
                {p.art === 'kategorie' ? (
                  <>
                    <Autocomplete
                      label="Artikel"
                      size="md"
                      placeholder="z. B. Deko"
                      maxLength={100}
                      data={artikelNamen(artikelVorschlaege)}
                      value={p.text}
                      onChange={(v) =>
                        aendern(p.key, {
                          text: v,
                          ...(p.kategorieId === null && {
                            kategorieId: vorgeschlageneKategorie(kategorien, artikelVorschlaege, v),
                          }),
                        })
                      }
                      error={
                        versucht && p.text.trim() === '' ? 'Bitte gib den Artikel an.' : undefined
                      }
                    />
                    <Select
                      label="Kategorie"
                      size="md"
                      searchable
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
                ) : (
                  <>
                    <Select
                      label="Ware"
                      size="md"
                      searchable
                      nothingFoundMessage="Keine Ware gefunden"
                      data={wareOptionen(waren)}
                      filter={wareFilter(waren)}
                      value={p.wareId}
                      onChange={(v) => {
                        const w = waren.find((x) => x.id === v);
                        const { gebindeId, pfandCent } = standardGebindeWaehlen(w);
                        aendern(p.key, { wareId: v, gebindeId, pfandCent });
                      }}
                      error={versucht && p.wareId === null ? 'Bitte wähle eine Ware.' : undefined}
                    />
                    <Select
                      label="Gebinde"
                      size="md"
                      allowDeselect={false}
                      placeholder={p.wareId ? 'Gebinde wählen' : 'Erst die Ware wählen'}
                      disabled={!p.wareId}
                      data={(auswahl.data?.waren.find((w) => w.id === p.wareId)?.gebinde ?? []).map(
                        (g) => ({ value: g.id, label: g.bezeichnung }),
                      )}
                      value={p.gebindeId}
                      onChange={(v) =>
                        aendern(p.key, {
                          gebindeId: v,
                          pfandCent:
                            auswahl.data?.waren
                              .find((w) => w.id === p.wareId)
                              ?.gebinde.find((g) => g.id === v)?.pfandGesamtCent ?? null,
                        })
                      }
                      error={
                        versucht && p.wareId !== null && p.gebindeId === null
                          ? 'Bitte wähle ein Gebinde.'
                          : undefined
                      }
                    />
                    <ZahlFeld
                      label="Anzahl Gebinde"
                      size="md"
                      min={1}
                      max={9999}
                      allowDecimal={false}
                      value={p.anzahl}
                      onChange={(v) => aendern(p.key, { anzahl: v })}
                      error={
                        versucht && !(Number(p.anzahl) >= 1)
                          ? 'Bitte gib die Anzahl an.'
                          : undefined
                      }
                    />
                  </>
                )}
                <Group align="flex-end" grow wrap="wrap" gap="xs">
                  <BetragFeld
                    label={p.art === 'ware' ? 'Preis je Gebinde (brutto)' : 'Betrag (brutto)'}
                    size="md"
                    value={p.betragCent}
                    onWert={(c) => aendern(p.key, { betragCent: c })}
                    error={
                      versucht && (p.betragCent === null || p.betragCent <= 0)
                        ? 'Bitte gib den Betrag an.'
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
                    data={STEUER_OPTIONEN}
                    value={p.steuersatz}
                    onChange={(v) => aendern(p.key, { steuersatz: v ?? '1900' })}
                  />
                </Group>
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
                    anzahl: 1,
                    pfandCent: null,
                    text: '',
                    betragCent: null,
                    steuersatz: '1900',
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
