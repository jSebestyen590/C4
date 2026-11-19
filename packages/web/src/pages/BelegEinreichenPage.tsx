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
  TextInput,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BELEG_POSTEN_ANZAHL_MAX, type BelegDatei as BelegDateiDaten } from '@c4/shared';
import { useApi } from '../api';
import { BelegDateiFeld } from '../BelegDatei';
import { BetragFeld } from '../BetragFeld';
import { DatumFeld } from '../DatumFeld';
import { ZahlFeld } from '../ZahlFeld';
import { finanzenKeys, jsonOderFehler, useEinreichungAuswahl } from '../finanzenDaten';
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

const heute = () => new Date().toLocaleDateString('sv-SE');

/**
 * Members submit a Beleg: photo/file, date, amount, Rechnungssteller (free text; the list needs
 * `finanzen:lesen`), note. The Finanzer:in adds Kategorien and books it.
 */
export function BelegEinreichenPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [datei, setDatei] = useState<BelegDateiDaten | null>(null);
  const [lokaleUrl, setLokaleUrl] = useState<string | null>(null);
  const [datum, setDatum] = useState(heute());
  const [betrag, setBetrag] = useState<number | null>(null);
  const [steller, setSteller] = useState('');
  const [notiz, setNotiz] = useState('');
  const auswahl = useEinreichungAuswahl();
  const [aufteilen, setAufteilen] = useState(false);
  const [posten, setPosten] = useState<PostenZeile[]>([]);
  const [naechsterKey, setNaechsterKey] = useState(1);
  const [versucht, setVersucht] = useState(false);

  const gewaehlt = auswahl.data?.rechnungssteller.find(
    (r) => r.name.toLowerCase() === steller.trim().toLowerCase(),
  );
  const aendern = (key: number, teil: Partial<PostenZeile>) =>
    setPosten((ps) => ps.map((p) => (p.key === key ? { ...p, ...teil } : p)));

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
                    text: p.text,
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
      : p.kategorieId === null) ||
    p.betragCent === null ||
    p.betragCent <= 0;
  const postenOk = !posten.some(postenFehlt);
  const gueltig = !fehlt.datei && !fehlt.datum && !fehlt.betrag && postenOk;

  return (
    <Stack gap="md">
      <ZurueckLink to="/belege">Meine Belege</ZurueckLink>
      <Title order={2}>Beleg einreichen</Title>
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
      <Button
        size="md"
        variant="subtle"
        fullWidth
        onClick={() => setAufteilen((a) => !a)}
        aria-expanded={aufteilen}
      >
        {aufteilen ? 'Aufteilen ausblenden' : 'Aufteilen (optional)'}
      </Button>
      <Collapse expanded={aufteilen}>
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
                      wareId: null,
                      gebindeId: null,
                      pfandCent: null,
                    })
                  }
                  data={[
                    { value: 'kategorie', label: 'Kategorie' },
                    { value: 'ware', label: 'Ware' },
                  ]}
                />
                {p.art === 'kategorie' ? (
                  <Select
                    label="Kategorie"
                    size="md"
                    searchable
                    data={
                      auswahl.data?.kategorien.map((k) => ({ value: k.id, label: k.name })) ?? []
                    }
                    value={p.kategorieId}
                    onChange={(v) => aendern(p.key, { kategorieId: v })}
                    error={
                      versucht && p.kategorieId === null ? 'Bitte wähle eine Kategorie.' : undefined
                    }
                  />
                ) : (
                  <>
                    <Select
                      label="Ware"
                      size="md"
                      searchable
                      nothingFoundMessage="Keine Ware gefunden"
                      data={(auswahl.data?.waren ?? []).map((w) => ({
                        value: w.id,
                        label: w.name,
                      }))}
                      value={p.wareId}
                      onChange={(v) => {
                        const w = auswahl.data?.waren.find((x) => x.id === v);
                        const g = w?.gebinde.length === 1 ? w.gebinde[0] : undefined;
                        aendern(p.key, {
                          wareId: v,
                          gebindeId: g?.id ?? null,
                          pfandCent: g?.pfandGesamtCent ?? null,
                        });
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
                <TextInput
                  label="Text"
                  size="md"
                  maxLength={200}
                  value={p.text}
                  onChange={(e) => aendern(p.key, { text: e.currentTarget.value })}
                />
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
                    art: 'kategorie',
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
