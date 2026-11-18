import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BELEG_MODI,
  BELEG_MODUS_LABELS,
  centAnzeigen,
  STEUERSAETZE,
  ZAHLWEGE,
  ZAHLWEG_LABELS,
  type BelegDatei as BelegDateiDaten,
  type BelegGebuchtDto,
  type BelegModus,
  type BelegWarnungDto,
  type Zahlweg,
} from '@c4/shared';
import { useApi, unwrap } from '../api';
import { BelegBuchenDialog } from '../BelegBuchenDialog';
import { BelegDateiFeld } from '../BelegDatei';
import {
  anzahlLesen,
  fehlerZu,
  formularFehler,
  formularSumme,
  formularZuDaten,
  hatInhalt,
  datenZuFormular,
  leeresFormular,
  neuerPosten,
  satzText,
  steuersatzVorschlag,
  stueckelungHinweis,
  verwendeteSaetze,
  type BelegFormular,
  type PostenZeile,
} from '../belegFormular';
import { BelegSummen } from '../BelegSummen';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { BetragFeld } from '../BetragFeld';
import { DatumFeld } from '../DatumFeld';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { HILFE } from '../finanzenHilfe';
import {
  BETRAG_STIL,
  belegEntwurfPfad,
  belegPfad,
  finanzenKeys,
  jsonOderFehler,
  kontoOptionen,
  useBargeld,
  useKonten,
  useRechnungssteller,
} from '../finanzenDaten';
import { schluesselFuer } from '../buchungFormular';
import { mitgliedOptionen, useMitgliederListe } from '../organisator';
import { StueckelungFeld } from '../StueckelungFeld';
import { HINWEIS_DAUER_MS } from '../gebuchtHinweis';
import { enterWeiter, useVerwerfenWarnung } from '../useVerwerfenWarnung';
import { ApiFehler, fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

type Speicherstand = 'gespeichert' | 'ungespeichert' | 'speichert' | 'fehler';

const SPEICHER_TEXT: Record<Speicherstand, string> = {
  gespeichert: 'Entwurf gespeichert',
  ungespeichert: 'Änderungen noch nicht gespeichert',
  speichert: 'Wird gespeichert …',
  fehler: 'Speichern fehlgeschlagen',
};

const SATZ_OPTIONEN = STEUERSAETZE.map((s) => ({ value: String(s), label: satzText(s) }));
const AUTOSPEICHERN_MS = 1200;

/**
 * Capture of a Beleg: file left, form right (stacked below `lg`). The draft is saved by itself
 * (debounced) and booked in a summary dialog. Desktop first with keyboard flow (`data-nav`, Enter =
 * next field, Enter in the last item row = new row, Ctrl+Enter = check and book).
 */
export function FinanzenBelegPage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const konten = useKonten(false);
  const bargeld = useBargeld();
  const rechnungssteller = useRechnungssteller(false);
  const mitglieder = useMitgliederListe();
  const entwurf = useQuery({
    queryKey: finanzenKeys.belegEntwurf(id),
    enabled: !!id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () =>
      unwrap(await api.finanzen['beleg-entwuerfe'][':id'].$get({ param: { id: id! } })),
  });

  const [form, setForm] = useState<BelegFormular | null>(id ? null : leeresFormular());
  const formRef = useRef<BelegFormular | null>(form);
  const entwurfId = useRef<string | null>(id ?? null);
  const [lokaleUrl, setLokaleUrl] = useState<string | null>(null);
  const [stand, setStand] = useState<Speicherstand>('gespeichert');
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);
  const [versucht, setVersucht] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [warnungen, setWarnungen] = useState<BelegWarnungDto[]>([]);
  const [verwerfen, setVerwerfen] = useState(false);
  const [neuerName, setNeuerName] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const kette = useRef<Promise<unknown>>(Promise.resolve());
  const wurzel = useRef<HTMLFormElement>(null);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);
  const vorbelegt = useRef(false);
  const warnung = useVerwerfenWarnung(stand !== 'gespeichert');

  // The draft of the route is loaded once; later changes come from this page.
  useEffect(() => {
    if (!id || formRef.current || !entwurf.data) return;
    const f = datenZuFormular(entwurf.data.daten);
    formRef.current = f;
    entwurfId.current = id;
    setForm(f);
  }, [id, entwurf.data]);

  // New Belege start with the most recently used Rechnungssteller.
  useEffect(() => {
    const liste = rechnungssteller.data;
    if (id || vorbelegt.current || !liste || !formRef.current) return;
    vorbelegt.current = true;
    const letzter = [...liste]
      .filter((r) => r.zuletztAm)
      .sort((a, b) => (b.zuletztAm ?? '').localeCompare(a.zuletztAm ?? ''))[0];
    if (letzter && !formRef.current.rechnungsstellerId) {
      const f = { ...formRef.current, rechnungsstellerId: letzter.id };
      formRef.current = f;
      setForm(f);
    }
  }, [id, rechnungssteller.data]);

  const speichernJetzt = (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    const lauf = kette.current.then(async () => {
      const f = formRef.current;
      if (!f) return true;
      if (!entwurfId.current && !hatInhalt(f)) {
        setStand('gespeichert');
        return true;
      }
      setStand('speichert');
      try {
        const daten = formularZuDaten(f);
        if (entwurfId.current) {
          await unwrap(
            await api.finanzen['beleg-entwuerfe'][':id'].$put({
              param: { id: entwurfId.current },
              json: { daten },
            }),
          );
        } else {
          const neu = await jsonOderFehler<{ id: string }>(
            await api.finanzen['beleg-entwuerfe'].$post({ json: { daten } }),
          );
          entwurfId.current = neu.id;
          warnung.ohneWarnung(() => void navigate(belegEntwurfPfad(neu.id), { replace: true }));
        }
        setSpeicherFehler(null);
        setStand(formRef.current === f ? 'gespeichert' : 'ungespeichert');
        void qc.invalidateQueries({ queryKey: ['finanzen', 'belege'] });
        return true;
      } catch (e) {
        setSpeicherFehler(fehlerText(e, 'Der Entwurf konnte nicht gespeichert werden.'));
        setStand('fehler');
        return false;
      }
    });
    kette.current = lauf;
    return lauf;
  };

  const aendern = (fn: (f: BelegFormular) => BelegFormular) => {
    if (!formRef.current) return;
    const neu = fn(formRef.current);
    formRef.current = neu;
    setForm(neu);
    setStand('ungespeichert');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void speichernJetzt(), AUTOSPEICHERN_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const buchen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (bestaetigt: string[]) => {
      const f = formRef.current!;
      const inhalt = JSON.stringify([formularZuDaten(f), [...bestaetigt].sort()]);
      schluessel.current = schluesselFuer(schluessel.current, inhalt, () => crypto.randomUUID());
      const res = await api.finanzen['beleg-entwuerfe'][':id'].buchen.$post({
        param: { id: entwurfId.current! },
        json: { idempotenzSchluessel: schluessel.current.schluessel, bestaetigt },
      });
      if ((res as { status: number }).status === 409) {
        const body = (await res.json()) as { error?: string; warnungen?: BelegWarnungDto[] };
        setWarnungen(body.warnungen ?? []);
        throw new ApiFehler(409, body.error ?? 'Bitte bestätige die Hinweise.');
      }
      return jsonOderFehler<BelegGebuchtDto>(res);
    },
    onSuccess: (ergebnis) => {
      warnung.abgeschlossen();
      schluessel.current = null;
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      notifications.show({
        color: 'green',
        autoClose: HINWEIS_DAUER_MS,
        message: ergebnis.wiederholt
          ? `Beleg ${ergebnis.nummer} war schon gebucht.`
          : `Beleg ${ergebnis.nummer} gebucht (Buchung Nr. ${ergebnis.buchungSeq}).`,
      });
      void navigate(belegPfad(ergebnis.id), { replace: true });
    },
  });

  const anlegen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (name: string) =>
      jsonOderFehler<{ id: string }>(await api.finanzen.rechnungssteller.$post({ json: { name } })),
    onSuccess: async ({ id: neu }) => {
      await qc.invalidateQueries({ queryKey: ['finanzen', 'rechnungssteller'] });
      aendern((f) => ({ ...f, rechnungsstellerId: neu }));
      setNeuerName(null);
    },
  });

  if (!form) {
    return entwurf.isError ? (
      <Alert color="red">Der Entwurf konnte nicht geladen werden.</Alert>
    ) : (
      <Loader m="md" aria-label="Wird geladen" />
    );
  }

  const aufwand = (konten.data ?? []).filter((k) => k.art === 'aufwand' && !k.archiviert);
  const faecher = bargeld.data?.faecher ?? [];
  const fach = faecher.find((x) => x.id === form.fachId);
  const berechnung = formularSumme(form);
  const fehler = formularFehler(form);
  const fz = (feld: string) => (versucht ? fehlerZu(fehler, feld) : undefined);
  const stueckHinweis = stueckelungHinweis(berechnung.summe, form.gegeben, form.wechselgeld);
  const zahler = (mitglieder.data ?? []).find((m) => m.sub === form.mitgliedId);
  const dateiUrl = lokaleUrl ?? entwurf.data?.dateiUrl ?? null;

  const setPosten = (key: string, patch: Partial<PostenZeile>) =>
    aendern((f) => ({
      ...f,
      posten: f.posten.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    }));
  const postenHinzu = () => {
    aendern((f) => ({
      ...f,
      posten: [...f.posten, neuerPosten(f.posten.at(-1)?.steuersatz ?? STEUERSAETZE[0])],
    }));
    setTimeout(() => {
      const felder = wurzel.current?.querySelectorAll<HTMLElement>('[data-kategorie]');
      felder?.[felder.length - 1]?.focus();
    }, 0);
  };

  const pruefenOeffnen = async () => {
    setVersucht(true);
    if (fehler.length > 0) {
      document.getElementById('beleg-fehler')?.scrollIntoView({ block: 'center' });
      return;
    }
    buchen.reset();
    schluessel.current = null;
    if (!(await speichernJetzt()) || !entwurfId.current) return;
    try {
      const aktuell = await qc.fetchQuery({
        queryKey: finanzenKeys.belegEntwurf(entwurfId.current),
        staleTime: 0,
        queryFn: async () =>
          unwrap(
            await api.finanzen['beleg-entwuerfe'][':id'].$get({
              param: { id: entwurfId.current! },
            }),
          ),
      });
      setWarnungen(aktuell.warnungen);
      setDialog(true);
    } catch (e) {
      setSpeicherFehler(fehlerText(e, 'Die Prüfung ist fehlgeschlagen.'));
    }
  };

  const nameVon = (konto: string | null) =>
    (konten.data ?? []).find((k) => k.id === konto)?.name ?? '';

  return (
    <Stack maw={1500}>
      <ZurueckLink to="/finanzen/belege">Belege</ZurueckLink>
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={2}>{id ? 'Beleg-Entwurf' : 'Neuer Beleg'}</Title>
        <Text size="sm" c={stand === 'fehler' ? 'red' : 'dimmed'} role="status">
          {SPEICHER_TEXT[stand]}
        </Text>
      </Group>
      {speicherFehler && <Alert color="red">{speicherFehler}</Alert>}
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'start' }}>
        <Stack style={{ position: 'sticky', top: 16 }}>
          <BelegDateiFeld
            datei={form.datei}
            vorschauUrl={dateiUrl}
            fehler={fz('datei') && !form.eigenbeleg ? fz('datei') : undefined}
            onDatei={(datei: BelegDateiDaten, url) => {
              setLokaleUrl(url);
              aendern((f) => ({ ...f, datei, eigenbeleg: false }));
              void speichernJetzt();
            }}
            onEntfernen={() => {
              setLokaleUrl(null);
              aendern((f) => ({ ...f, datei: null }));
            }}
          />
          {!form.datei && (
            <Stack gap="xs">
              <Group gap={2}>
                <Switch
                  label="Eigenbeleg (ohne Datei)"
                  checked={form.eigenbeleg}
                  onChange={(e) => {
                    const an = e.currentTarget.checked;
                    aendern((f) => ({ ...f, eigenbeleg: an }));
                  }}
                />
                <InfoHinweis feld="Eigenbeleg" text={HILFE.belege.eigenbeleg} />
              </Group>
              {form.eigenbeleg && (
                <Textarea
                  label="Begründung"
                  description="Warum gibt es keinen Beleg?"
                  autosize
                  minRows={2}
                  maxLength={500}
                  value={form.eigenbelegBegruendung}
                  onChange={(e) => {
                    const wert = e.currentTarget.value;
                    aendern((f) => ({ ...f, eigenbelegBegruendung: wert }));
                  }}
                  error={fz('datei')}
                />
              )}
            </Stack>
          )}
        </Stack>

        <form
          ref={wurzel}
          noValidate
          onKeyDown={(e) => {
            const ziel = e.target as HTMLElement;
            if (
              e.key === 'Enter' &&
              !e.ctrlKey &&
              !e.metaKey &&
              ziel.hasAttribute('data-posten-ende') &&
              ziel.getAttribute('aria-expanded') !== 'true'
            ) {
              e.preventDefault();
              postenHinzu();
              return;
            }
            enterWeiter(e, wurzel.current, () => void pruefenOeffnen());
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void pruefenOeffnen();
          }}
        >
          <Stack gap="lg">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Stack gap={4}>
                <Select
                  label={
                    <FeldLabel text="Rechnungssteller" hilfe={HILFE.belege.rechnungssteller} />
                  }
                  placeholder="Rechnungssteller suchen"
                  searchable
                  selectFirstOptionOnChange
                  data={(rechnungssteller.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
                  value={form.rechnungsstellerId}
                  onChange={(v) => aendern((f) => ({ ...f, rechnungsstellerId: v }))}
                  nothingFoundMessage="Keiner gefunden, lege ihn neu an"
                  error={fz('rechnungssteller')}
                  data-nav=""
                />
                {neuerName === null ? (
                  <Button
                    variant="subtle"
                    size="compact-md"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setNeuerName('')}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Neuen Rechnungssteller anlegen
                  </Button>
                ) : (
                  <Group align="flex-start" gap="xs" wrap="nowrap">
                    <TextInput
                      style={{ flex: 1 }}
                      aria-label="Name des neuen Rechnungsstellers"
                      placeholder="Name"
                      value={neuerName}
                      maxLength={120}
                      onChange={(e) => setNeuerName(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (neuerName.trim()) anlegen.mutate(neuerName.trim());
                        }
                      }}
                      error={anlegen.isError ? fehlerText(anlegen.error) : undefined}
                      data-autofocus
                    />
                    <Button
                      onClick={() => anlegen.mutate(neuerName.trim())}
                      loading={anlegen.isPending}
                      disabled={neuerName.trim() === ''}
                    >
                      Anlegen
                    </Button>
                    <Button variant="default" onClick={() => setNeuerName(null)}>
                      Abbrechen
                    </Button>
                  </Group>
                )}
              </Stack>
              <DatumFeld
                label="Belegdatum"
                value={form.belegdatum}
                onWert={(wert) =>
                  aendern((f) => ({
                    ...f,
                    belegdatum: wert,
                    bezahldatum:
                      f.bezahldatum === '' || f.bezahldatum === f.belegdatum ? wert : f.bezahldatum,
                  }))
                }
                loeschbar={false}
                error={fz('belegdatum')}
                data-nav=""
              />
            </SimpleGrid>

            <Stack gap="xs">
              <Group justify="space-between" align="center" gap="xs">
                <Group gap={2}>
                  <Text fw={600}>Posten</Text>
                  <InfoHinweis feld="Brutto und Netto" text={HILFE.belege.modus} />
                </Group>
                <SegmentedControl
                  aria-label="Preise sind"
                  value={form.modus}
                  onChange={(v) => aendern((f) => ({ ...f, modus: v as BelegModus }))}
                  data={BELEG_MODI.map((m) => ({ value: m, label: BELEG_MODUS_LABELS[m] }))}
                />
              </Group>
              {form.posten.map((p, i) => {
                const letzte = i === form.posten.length - 1;
                return (
                  <Paper key={p.key} withBorder p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="sm" fw={600}>
                          Posten {i + 1}
                        </Text>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size={42}
                          aria-label={`Posten ${i + 1} entfernen`}
                          disabled={form.posten.length === 1}
                          onClick={() =>
                            aendern((f) => ({
                              ...f,
                              posten: f.posten.filter((x) => x.key !== p.key),
                            }))
                          }
                        >
                          <IconTrash size={20} />
                        </ActionIcon>
                      </Group>
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                        <Select
                          label="Kategorie"
                          placeholder="Kategorie suchen"
                          searchable
                          selectFirstOptionOnChange
                          data={kontoOptionen(aufwand)}
                          value={p.kategorieId}
                          onChange={(v) =>
                            setPosten(p.key, {
                              kategorieId: v,
                              ...(steuersatzVorschlag(aufwand.find((k) => k.id === v)) !== null && {
                                steuersatz: steuersatzVorschlag(aufwand.find((k) => k.id === v))!,
                              }),
                            })
                          }
                          nothingFoundMessage="Keine Kategorie gefunden"
                          error={
                            versucht && !p.kategorieId ? 'Bitte wähle eine Kategorie.' : undefined
                          }
                          data-nav=""
                          data-kategorie=""
                        />
                        <TextInput
                          label="Text"
                          placeholder="optional"
                          maxLength={200}
                          value={p.text}
                          onChange={(e) => setPosten(p.key, { text: e.currentTarget.value })}
                          data-nav=""
                        />
                      </SimpleGrid>
                      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                        <TextInput
                          label={<FeldLabel text="Anzahl" hilfe={HILFE.belege.anzahl} />}
                          inputMode="decimal"
                          autoComplete="off"
                          value={p.anzahl}
                          onChange={(e) => setPosten(p.key, { anzahl: e.currentTarget.value })}
                          error={
                            p.anzahl.trim() !== '' && anzahlLesen(p.anzahl) === null
                              ? 'Ungültig, z. B. 1,5'
                              : undefined
                          }
                          styles={{ input: { textAlign: 'right' } }}
                          data-nav=""
                        />
                        <BetragFeld
                          label={`Einzelpreis (${form.modus === 'netto' ? 'netto' : 'brutto'})`}
                          negativ
                          value={p.einzelpreisCent}
                          onWert={(c) => setPosten(p.key, { einzelpreisCent: c })}
                          error={
                            versucht && p.einzelpreisCent === null ? 'Bitte angeben.' : undefined
                          }
                          data-nav=""
                        />
                        <Select
                          label={<FeldLabel text="Steuersatz" hilfe={HILFE.belege.steuersatz} />}
                          allowDeselect={false}
                          data={SATZ_OPTIONEN}
                          value={String(p.steuersatz)}
                          onChange={(v) => v && setPosten(p.key, { steuersatz: Number(v) })}
                          data-nav=""
                          {...(letzte && { 'data-posten-ende': '' })}
                        />
                        <Stack gap={2} justify="flex-end">
                          <Text size="sm" fw={500}>
                            Betrag
                          </Text>
                          <Text
                            style={{ ...BETRAG_STIL, minHeight: 42, lineHeight: '42px' }}
                            fw={600}
                          >
                            {centAnzeigen(berechnung.postenBetraege[i] ?? 0)}
                          </Text>
                        </Stack>
                      </SimpleGrid>
                    </Stack>
                  </Paper>
                );
              })}
              <Group>
                <Button variant="light" leftSection={<IconPlus size={18} />} onClick={postenHinzu}>
                  Posten hinzufügen
                </Button>
                <Text size="sm" c="dimmed" visibleFrom="sm">
                  Enter im letzten Feld legt den nächsten Posten an.
                </Text>
              </Group>
            </Stack>

            {form.modus === 'netto' && (
              <Stack gap="xs">
                <Group gap={2}>
                  <Text fw={600}>Korrektur je Steuersatz</Text>
                  <InfoHinweis feld="Korrektur" text={HILFE.belege.korrektur} />
                </Group>
                {verwendeteSaetze(form).map((satz) => (
                  <SimpleGrid key={satz} cols={{ base: 2, sm: 3 }} spacing="xs">
                    <Text size="sm" fw={500} style={{ alignSelf: 'center' }}>
                      {satzText(satz)}
                    </Text>
                    <BetragFeld
                      aria-label={`Korrektur Netto bei ${satzText(satz)}`}
                      label="Netto ±"
                      negativ
                      value={form.korrekturen[satz]?.nettoCent ?? null}
                      onWert={(c) =>
                        aendern((f) => ({
                          ...f,
                          korrekturen: {
                            ...f.korrekturen,
                            [satz]: {
                              nettoCent: c,
                              steuerCent: f.korrekturen[satz]?.steuerCent ?? null,
                            },
                          },
                        }))
                      }
                      data-nav=""
                    />
                    <BetragFeld
                      aria-label={`Korrektur Steuer bei ${satzText(satz)}`}
                      label="Steuer ±"
                      negativ
                      value={form.korrekturen[satz]?.steuerCent ?? null}
                      onWert={(c) =>
                        aendern((f) => ({
                          ...f,
                          korrekturen: {
                            ...f.korrekturen,
                            [satz]: {
                              nettoCent: f.korrekturen[satz]?.nettoCent ?? null,
                              steuerCent: c,
                            },
                          },
                        }))
                      }
                      data-nav=""
                    />
                  </SimpleGrid>
                ))}
              </Stack>
            )}

            <Stack gap="xs">
              <BelegSummen jeSteuersatz={berechnung.jeSteuersatz} summeCent={berechnung.summe} />
              {berechnung.fehler.map((m) => (
                <Text key={m} size="sm" c="red">
                  {m}
                </Text>
              ))}
            </Stack>

            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select
                  label={<FeldLabel text="Zahlweg" hilfe={HILFE.belege.zahlweg} />}
                  placeholder="Zahlweg wählen"
                  allowDeselect={false}
                  data={ZAHLWEGE.map((z) => ({ value: z, label: ZAHLWEG_LABELS[z] }))}
                  value={form.zahlweg}
                  onChange={(v) =>
                    aendern((f) => ({
                      ...f,
                      zahlweg: v as Zahlweg | null,
                      bezahldatum: f.bezahldatum || f.belegdatum,
                    }))
                  }
                  error={fz('zahlweg')}
                  data-nav=""
                />
                {form.zahlweg && form.zahlweg !== 'auslage' && (
                  <DatumFeld
                    label={<FeldLabel text="Bezahldatum" hilfe={HILFE.belege.bezahldatum} />}
                    value={form.bezahldatum}
                    onWert={(wert) => aendern((f) => ({ ...f, bezahldatum: wert }))}
                    loeschbar={false}
                    error={fz('bezahldatum')}
                    data-nav=""
                  />
                )}
                {form.zahlweg === 'auslage' && (
                  <Select
                    label={<FeldLabel text="Mitglied (hat bezahlt)" hilfe={HILFE.belege.auslage} />}
                    placeholder="Mitglied suchen"
                    searchable
                    selectFirstOptionOnChange
                    data={mitgliedOptionen((mitglieder.data ?? []).filter((m) => !m.deaktiviert))}
                    value={form.mitgliedId}
                    onChange={(v) => aendern((f) => ({ ...f, mitgliedId: v }))}
                    nothingFoundMessage="Kein Mitglied gefunden"
                    error={fz('mitglied')}
                    data-nav=""
                  />
                )}
              </SimpleGrid>
              {form.zahlweg === 'bar' && (
                <Stack gap="xs">
                  <Select
                    label={<FeldLabel text="Fach" hilfe={HILFE.bargeld.fach} />}
                    placeholder="Fach suchen"
                    searchable
                    selectFirstOptionOnChange
                    data={faecher.map((x) => ({ value: x.id, label: x.name }))}
                    value={form.fachId}
                    onChange={(v) => aendern((f) => ({ ...f, fachId: v }))}
                    nothingFoundMessage="Kein Fach gefunden"
                    error={fz('fach')}
                    data-nav=""
                    maw={{ base: '100%', sm: 360 }}
                  />
                  <Group gap={2}>
                    <Text fw={500} size="sm">
                      Münzen und Scheine
                    </Text>
                    <InfoHinweis feld="Stückelung" text={HILFE.belege.stueckelung} />
                  </Group>
                  <StueckelungFeld
                    label="Münzen und Scheine, die du gibst, und Wechselgeld"
                    bestand={fach?.bestand}
                    spalten={[
                      {
                        id: 'ab',
                        label: 'Abgang (gegeben)',
                        value: form.gegeben,
                        onChange: (m) => aendern((f) => ({ ...f, gegeben: m })),
                        richtung: 'ab',
                        begrenzen: !!fach,
                      },
                      {
                        id: 'zu',
                        label: 'Wechselgeld',
                        value: form.wechselgeld,
                        onChange: (m) => aendern((f) => ({ ...f, wechselgeld: m })),
                        richtung: 'zu',
                      },
                    ]}
                  />
                  {(stueckHinweis ?? fz('stueckelung')) && (
                    <Text size="sm" c="orange.8" role="status">
                      {stueckHinweis ?? fz('stueckelung')}
                    </Text>
                  )}
                </Stack>
              )}
            </Stack>

            {versucht && fehler.length > 0 && (
              <Alert id="beleg-fehler" color="red" title="Noch nicht buchbar">
                <Stack gap={2}>
                  {fehler.map((x) => (
                    <Text key={x.meldung} size="sm">
                      {x.meldung}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}

            <Group align="center" gap="md">
              <Button type="button" onClick={() => void pruefenOeffnen()}>
                Prüfen und buchen
              </Button>
              <Text size="sm" c="dimmed" visibleFrom="sm">
                Tastenkürzel: Strg+Enter
              </Text>
              <Button
                type="button"
                variant="subtle"
                color="red"
                onClick={() =>
                  entwurfId.current ? setVerwerfen(true) : void navigate('/finanzen/belege')
                }
              >
                Entwurf verwerfen
              </Button>
            </Group>
          </Stack>
        </form>
      </SimpleGrid>

      {dialog && form.rechnungsstellerId && form.zahlweg && (
        <BelegBuchenDialog
          form={form}
          rechnungssteller={
            (rechnungssteller.data ?? []).find((r) => r.id === form.rechnungsstellerId)?.name ?? ''
          }
          zahlwegZusatz={
            form.zahlweg === 'bar'
              ? (fach?.name ?? null)
              : form.zahlweg === 'auslage' && zahler
                ? (zahler.username ?? `${zahler.vorname} ${zahler.nachname}`)
                : null
          }
          posten={form.posten.map((p, i) => ({
            key: p.key,
            kategorie: nameVon(p.kategorieId),
            text: p.text.trim(),
            betragCent: berechnung.postenBetraege[i] ?? 0,
          }))}
          berechnung={berechnung}
          warnungen={warnungen}
          laeuft={buchen.isPending}
          fehler={
            buchen.isError && !(buchen.error instanceof ApiFehler && buchen.error.status === 409)
              ? fehlerText(buchen.error, 'Das Buchen ist fehlgeschlagen.')
              : buchen.isError
                ? fehlerText(buchen.error)
                : null
          }
          onBuchen={(bestaetigt) => buchen.mutate(bestaetigt)}
          onClose={() => setDialog(false)}
        />
      )}
      {verwerfen && (
        <BestaetigenDialog
          titel="Entwurf verwerfen?"
          bestaetigenText="Verwerfen"
          onClose={() => setVerwerfen(false)}
          onBestaetigt={async () => {
            await unwrap(
              await api.finanzen['beleg-entwuerfe'][':id'].$delete({
                param: { id: entwurfId.current! },
              }),
            );
            window.clearTimeout(timer.current);
            warnung.abgeschlossen();
            void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
            void navigate('/finanzen/belege', { replace: true });
          }}
        >
          <Text>
            Der Entwurf wird gelöscht. Eine hochgeladene Datei bleibt im Archiv, das ist so gewollt.
          </Text>
        </BestaetigenDialog>
      )}
      {warnung.dialog}
    </Stack>
  );
}
