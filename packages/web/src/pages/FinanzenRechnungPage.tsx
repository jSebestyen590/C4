import {
  Alert,
  Button,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BELEG_MODI,
  BELEG_MODUS_LABELS,
  RECHNUNG_ZAHLUNGSZIEL_MAX,
  datumAnzeigen,
  faelligAm,
  heuteBerlin,
  rechnungEntwurfSchema,
  steuersaetzeAm,
  type BelegModus,
  type BelegWarnungDto,
  type RechnungEmpfaengerAnzeigeDto,
  type RechnungGestelltDto,
  type RechnungPostenArt,
} from '@c4/shared';
import { useApi, unwrap } from '../api';
import { useAuth } from '../auth';
import { pfandJeSatz } from '../belegFormular';
import { BelegSummen } from '../BelegSummen';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { schluesselFuer } from '../buchungFormular';
import { DatumFeld } from '../DatumFeld';
import { lokalIstNeuer, lokalLesen, lokalLoeschen, lokalSpeichern } from '../entwurfSpeicher';
import { FeldZeile } from '../FeldZeile';
import { VerschiebHinweis } from '../FestschreibungHinweise';
import {
  finanzenKeys,
  jsonOderFehler,
  rechnungEntwurfPfad,
  rechnungPfad,
  rechnungenPfad,
  useBelegWaren,
  useKonten,
  useRechnungEinstellungen,
  useRechnungsempfaenger,
  useSteuersatzZeitraeume,
} from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { HINWEIS_DAUER_MS } from '../gebuchtHinweis';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { mitgliedName } from '../mitglied';
import { useMitgliederListe } from '../organisator';
import { RechnungEmpfaengerFeld } from '../RechnungEmpfaengerFeld';
import { RechnungPostenTabellen, type RechnungsBetraege } from '../RechnungPosten';
import {
  datenZuFormular,
  erloesKonten,
  formularFehler,
  formularSumme,
  formularZuDaten,
  gefuellteZeilen,
  hatInhalt,
  leeresFormular,
  neueZeile,
  zeileHinzufuegen,
  zeileLeer,
  zeilenSortieren,
  type RechnungFormular,
  type RechnungsZeile,
} from '../rechnungFormular';
import { RechnungStellenDialog } from '../RechnungStellenDialog';
import { useRechnungPdfErzeugen } from '../rechnung/useRechnungPdf';
import { StatusName } from '../StatusAnzeige';
import { SteuersaetzeKontext } from '../steuersaetze';
import { dropdownOffen, enterWeiter, useVerwerfenWarnung } from '../useVerwerfenWarnung';
import { ApiFehler, fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

type Speicherstand = 'gespeichert' | 'ungespeichert' | 'speichert' | 'fehler';

const SPEICHER_TEXT: Record<Speicherstand, string> = {
  gespeichert: 'Entwurf gespeichert',
  ungespeichert: 'Änderungen noch nicht gespeichert',
  speichert: 'Wird gespeichert …',
  fehler: 'Speichern fehlgeschlagen',
};

const AUTOSPEICHERN_MS = 1200;

/** Key of the not yet created draft in the local storage. */
const NEU = 'rechnung-neu';
const lokalSchluessel = (id: string) => `rechnung-${id}`;

type LeereZeilen = Record<RechnungPostenArt, RechnungsZeile>;
const neueLeere = (satz?: number): LeereZeilen => ({
  ware: neueZeile('ware', satz),
  frei: neueZeile('frei', satz),
});

/** The locally stored form, when it still has the shape of one. */
function lokalesFormular(schluessel: string) {
  const l = lokalLesen<RechnungFormular>(schluessel);
  return l && Array.isArray(l.wert.posten) ? l : null;
}

/**
 * Writing a Rechnung: recipient, dates, subject and the two item tables (desktop first, with the
 * keyboard flow of the Belege form: Enter = next field, Enter in the last row = new row, Strg+Enter =
 * check and issue). The draft is saved by itself (debounced); issuing happens in a summary dialog.
 */
export function FinanzenRechnungPage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const konten = useKonten(false);
  const waren = useBelegWaren();
  const mitglieder = useMitgliederListe();
  const extern = useRechnungsempfaenger(true);
  const einstellungen = useRechnungEinstellungen();
  const zeitraeume = useSteuersatzZeitraeume();
  const pdfErzeugen = useRechnungPdfErzeugen();
  // Set once the draft is issued or deleted, so the removed query is not fetched again (404).
  const [erledigt, setErledigt] = useState(false);
  const entwurf = useQuery({
    queryKey: finanzenKeys.rechnungEntwurf(id),
    enabled: !!id && !erledigt,
    // Always load fresh when the page opens; changes made on this page are written into the cache.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    queryFn: async () =>
      unwrap(await api.finanzen['rechnung-entwuerfe'][':id'].$get({ param: { id: id! } })),
  });

  const [form, setForm] = useState<RechnungFormular | null>(() =>
    id ? null : (lokalesFormular(NEU)?.wert ?? leeresFormular()),
  );
  const formRef = useRef<RechnungFormular | null>(form);
  const entwurfId = useRef<string | null>(id ?? null);
  const [stand, setStand] = useState<Speicherstand>('gespeichert');
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);
  const [versucht, setVersucht] = useState(false);
  const [pruefung, setPruefung] = useState<{
    warnungen: BelegWarnungDto[];
    empfaenger: RechnungEmpfaengerAnzeigeDto | null;
  } | null>(null);
  const [verwerfen, setVerwerfen] = useState(false);
  // The empty row at the end of each table: view state, joins the form once something is typed into it.
  const [leere, setLeereState] = useState(() => neueLeere());
  const leereRef = useRef(leere);
  const setLeere = (l: LeereZeilen) => {
    leereRef.current = l;
    setLeereState(l);
  };
  const timer = useRef<number | undefined>(undefined);
  const kette = useRef<Promise<unknown>>(Promise.resolve());
  const wurzel = useRef<HTMLDivElement>(null);
  const theme = useMantineTheme();
  // From md: item tables; below: item cards.
  const breit = useMediaQuery(`(min-width: ${theme.breakpoints.md})`, true, {
    getInitialValueInEffect: false,
  });
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);
  const nachspeichern = useRef(false);
  // Why the last save was skipped (the draft is not valid yet), else null.
  const ungueltig = useRef<string | null>(null);
  // Set while the save before leaving runs: a new draft then stays on this page.
  const verlassen = useRef(false);
  const speichernVorWeg = useRef<() => Promise<boolean>>(async () => true);
  const warnung = useVerwerfenWarnung(stand !== 'gespeichert', () => speichernVorWeg.current());

  // The draft of the route is loaded once; later changes come from this page.
  useEffect(() => {
    if (!id || formRef.current || !entwurf.data || !entwurf.isFetchedAfterMount) return;
    let f = datenZuFormular(entwurf.data.daten);
    const lokal = lokalesFormular(lokalSchluessel(id));
    if (lokal && lokalIstNeuer(lokal.zeit, entwurf.data.geaendertAm)) {
      f = lokal.wert;
      notifications.show({ color: 'blue', message: 'Ungespeicherte Eingaben wiederhergestellt.' });
      nachspeichern.current = true;
    }
    formRef.current = f;
    entwurfId.current = id;
    setForm(f);
  }, [id, entwurf.data, entwurf.isFetchedAfterMount]);

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
        // Never send a draft the API would refuse (400): keep it locally until it is valid.
        const geprueft = rechnungEntwurfSchema.safeParse({ daten });
        if (!geprueft.success) {
          setStand('ungespeichert');
          setSpeicherFehler(null);
          ungueltig.current = geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.';
          return false;
        }
        ungueltig.current = null;
        if (entwurfId.current) {
          await unwrap(
            await api.finanzen['rechnung-entwuerfe'][':id'].$put({
              param: { id: entwurfId.current },
              json: { daten },
            }),
          );
        } else {
          const neu = await jsonOderFehler<{ id: string }>(
            await api.finanzen['rechnung-entwuerfe'].$post({ json: { daten } }),
          );
          entwurfId.current = neu.id;
          lokalLoeschen(NEU);
          if (formRef.current !== f) lokalSpeichern(lokalSchluessel(neu.id), formRef.current);
          if (!verlassen.current)
            warnung.ohneWarnung(
              () => void navigate(rechnungEntwurfPfad(neu.id), { replace: true }),
            );
        }
        setSpeicherFehler(null);
        if (formRef.current === f && entwurfId.current)
          lokalLoeschen(lokalSchluessel(entwurfId.current));
        setStand(formRef.current === f ? 'gespeichert' : 'ungespeichert');
        // The draft query must not keep the state from before this save; a changed recipient is
        // reloaded (the server knows its address).
        const gespeichertId = entwurfId.current;
        if (gespeichertId) {
          const alt = qc.getQueryData<NonNullable<typeof entwurf.data>>(
            finanzenKeys.rechnungEntwurf(gespeichertId),
          );
          if (JSON.stringify(alt?.daten.empfaenger ?? null) !== JSON.stringify(daten.empfaenger))
            void qc.invalidateQueries({ queryKey: finanzenKeys.rechnungEntwurf(gespeichertId) });
          else
            qc.setQueryData(
              finanzenKeys.rechnungEntwurf(gespeichertId),
              (a: typeof entwurf.data) =>
                a
                  ? {
                      ...a,
                      daten: daten as NonNullable<typeof entwurf.data>['daten'],
                      geaendertAm: new Date().toISOString(),
                    }
                  : a,
            );
        }
        void qc.invalidateQueries({ queryKey: ['finanzen', 'rechnungen'] });
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

  useEffect(() => {
    speichernVorWeg.current = async () => {
      verlassen.current = true;
      try {
        return await speichernJetzt();
      } finally {
        verlassen.current = false;
      }
    };
  });

  // A restored local state is saved right after it is shown.
  useEffect(() => {
    if (!form || !nachspeichern.current) return;
    nachspeichern.current = false;
    setStand('ungespeichert');
    void speichernJetzt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const aendern = (fn: (f: RechnungFormular) => RechnungFormular) => {
    if (!formRef.current) return;
    const neu = fn(formRef.current);
    formRef.current = neu;
    setForm(neu);
    // Mirror every change locally right away: the autosave below waits, a reload must not lose it.
    lokalSpeichern(entwurfId.current ? lokalSchluessel(entwurfId.current) : NEU, neu);
    setStand('ungespeichert');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void speichernJetzt(), AUTOSPEICHERN_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const stellen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (bestaetigt: string[]) => {
      const inhalt = JSON.stringify([formularZuDaten(formRef.current!), [...bestaetigt].sort()]);
      schluessel.current = schluesselFuer(schluessel.current, inhalt, () => crypto.randomUUID());
      const res = await api.finanzen['rechnung-entwuerfe'][':id'].stellen.$post({
        param: { id: entwurfId.current! },
        json: { idempotenzSchluessel: schluessel.current.schluessel, bestaetigt },
      });
      if ((res as { status: number }).status === 409) {
        const body = (await res.json()) as { error?: string; warnungen?: BelegWarnungDto[] };
        setPruefung((p) => (p ? { ...p, warnungen: body.warnungen ?? p.warnungen } : p));
        throw new ApiFehler(409, body.error ?? 'Bitte bestätige die Hinweise.');
      }
      return jsonOderFehler<RechnungGestelltDto>(res);
    },
    onSuccess: async (ergebnis) => {
      warnung.abgeschlossen();
      const gestellt = entwurfId.current;
      lokalLoeschen(NEU, lokalSchluessel(gestellt ?? ''));
      schluessel.current = null;
      setErledigt(true);
      qc.removeQueries({ queryKey: ['finanzen', 'rechnungEntwurf'] });
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      // The PDF is rendered in the browser from the stored Rechnung; if that fails the detail page offers it again.
      let pdfFehler = false;
      try {
        await pdfErzeugen(ergebnis.id);
      } catch {
        pdfFehler = true;
      }
      notifications.show({
        color: pdfFehler ? 'orange' : 'green',
        autoClose: pdfFehler ? false : HINWEIS_DAUER_MS,
        message: pdfFehler
          ? `Rechnung ${ergebnis.nummer} gestellt, aber das PDF konnte nicht abgelegt werden. Erzeuge es auf der Rechnungsseite erneut.`
          : ergebnis.wiederholt
            ? `Rechnung ${ergebnis.nummer} war schon gestellt.`
            : `Rechnung ${ergebnis.nummer} gestellt (Buchung Nr. ${ergebnis.buchungSeq}).`,
      });
      void navigate(rechnungPfad(ergebnis.id), { replace: true });
    },
  });

  // The rates of today (the Rechnungsdatum is the day of Stellen).
  const heute = heuteBerlin();
  const saetzeHeute = steuersaetzeAm(zeitraeume.data ?? [], heute);
  const saetzeVorher = useRef(saetzeHeute);
  useEffect(() => {
    const alt = saetzeVorher.current;
    saetzeVorher.current = saetzeHeute;
    if (alt.regel === saetzeHeute.regel) return;
    setLeere(neueLeere(saetzeHeute.regel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saetzeHeute.regel]);

  if (!form) {
    return entwurf.isError ? (
      <Alert color="red">Der Entwurf konnte nicht geladen werden.</Alert>
    ) : (
      <Loader m="md" aria-label="Wird geladen" />
    );
  }

  const erloes = erloesKonten(konten.data ?? []);
  const standardKonto = einstellungen.data?.erloesKontoWaren ?? null;
  const berechnung = formularSumme(form);
  const fehler = formularFehler(form, zeitraeume.data ?? []);
  const fz = (feld: string) =>
    versucht ? fehler.find((x) => x.feld === feld)?.meldung : undefined;
  const gefuellt = gefuellteZeilen(form.posten);
  const betraege: RechnungsBetraege = new Map(
    gefuellt.map((p, i) => [
      p.key,
      {
        betragCent: berechnung.postenBetraege[i] ?? 0,
        pfandCent: berechnung.pfandBetraege[i] ?? 0,
      },
    ]),
  );
  const betragVon = (p: RechnungsZeile) => {
    const b = betraege.get(p.key);
    return (b?.betragCent ?? 0) + (b?.pfandCent ?? 0);
  };
  const zahlungsziel = form.zahlungszielTage ?? einstellungen.data?.zahlungszielTage ?? 14;
  const leistungZukunft = form.leistungVon !== '' && form.leistungVon > heute;
  // The server's view of the recipient counts only while it is the one saved there.
  const gespeicherterEmpfaenger =
    entwurf.data &&
    JSON.stringify(entwurf.data.daten.empfaenger ?? null) === JSON.stringify(form.empfaenger);
  const anzeige = gespeicherterEmpfaenger ? (entwurf.data?.empfaenger ?? null) : null;
  const eingerichtet = einstellungen.data !== undefined && einstellungen.data !== null;

  const postenAendern = (key: string, patch: Partial<RechnungsZeile>) => {
    const leereArt = (['ware', 'frei'] as const).find((a) => leereRef.current[a].key === key);
    if (leereArt) {
      // The empty row of a table: it joins the form once it has content, a new empty row follows.
      const zeile = { ...leereRef.current[leereArt], ...patch };
      if (zeileLeer(zeile)) {
        setLeere({ ...leereRef.current, [leereArt]: zeile });
      } else {
        setLeere({ ...leereRef.current, [leereArt]: neueZeile(leereArt, zeile.steuersatz) });
        aendern((f) => ({ ...f, posten: zeileHinzufuegen(f.posten, zeile) }));
      }
      return;
    }
    aendern((f) => ({
      ...f,
      posten: f.posten.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    }));
  };
  const postenEntfernen = (key: string) =>
    aendern((f) => ({ ...f, posten: f.posten.filter((x) => x.key !== key) }));

  const pruefenOeffnen = async () => {
    setVersucht(true);
    if (fehler.length > 0) {
      document.getElementById('rechnung-fehler')?.scrollIntoView({ block: 'center' });
      return;
    }
    if (!eingerichtet) {
      setSpeicherFehler('Bitte erst die Rechnungs-Einstellungen ausfüllen.');
      return;
    }
    stellen.reset();
    schluessel.current = null;
    if (!(await speichernJetzt()) || !entwurfId.current) {
      if (ungueltig.current)
        setSpeicherFehler(`Der Entwurf kann nicht gespeichert werden: ${ungueltig.current}`);
      return;
    }
    try {
      const aktuell = await qc.fetchQuery({
        queryKey: finanzenKeys.rechnungEntwurf(entwurfId.current),
        staleTime: 0,
        queryFn: async () =>
          unwrap(
            await api.finanzen['rechnung-entwuerfe'][':id'].$get({
              param: { id: entwurfId.current! },
            }),
          ),
      });
      if (aktuell.empfaenger?.adresseFehlt) {
        const m = aktuell.empfaenger.mitglied;
        setSpeicherFehler(
          `Für ${m ? mitgliedName(m) : aktuell.empfaenger.name} ist im Profil keine Adresse hinterlegt.`,
        );
        return;
      }
      setSpeicherFehler(null);
      setPruefung({ warnungen: aktuell.warnungen, empfaenger: aktuell.empfaenger });
    } catch (e) {
      setSpeicherFehler(fehlerText(e, 'Die Prüfung ist fehlgeschlagen.'));
    }
  };

  const postenName = (p: RechnungsZeile) => {
    if (p.art === 'frei') return p.text.trim();
    const w = (waren.data ?? []).find((x) => x.id === p.wareId);
    const g = w?.gebinde.find((x) => x.id === p.gebindeId);
    return `${w?.name ?? 'Ware'}${g ? ` (${g.bezeichnung})` : ''}, ${p.anzahl} ×`;
  };
  const dialogEmpfaenger = pruefung?.empfaenger;

  return (
    <SteuersaetzeKontext.Provider value={saetzeHeute}>
      <Stack>
        <ZurueckLink to={rechnungenPfad}>Rechnungen</ZurueckLink>
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Title order={2}>{id ? 'Rechnungs-Entwurf' : 'Neue Rechnung'}</Title>
          {(id || stand !== 'gespeichert') && (
            <Text size="sm" c={stand === 'fehler' ? 'red' : 'dimmed'} role="status">
              {SPEICHER_TEXT[stand]}
            </Text>
          )}
        </Group>
        {einstellungen.data === null && (
          <Alert color="orange" title="Rechnungs-Einstellungen fehlen">
            Bitte erst die{' '}
            {can('finanzen:verwalten') ? (
              <Link to="/finanzen/rechnungen/einstellungen">Rechnungs-Einstellungen</Link>
            ) : (
              'Rechnungs-Einstellungen'
            )}{' '}
            ausfüllen, sonst lässt sich keine Rechnung stellen. Den Entwurf kannst du trotzdem schon
            schreiben.
          </Alert>
        )}
        {speicherFehler && <Alert color="red">{speicherFehler}</Alert>}
        <div
          ref={wurzel}
          onKeyDown={(e) => {
            const ziel = e.target as HTMLElement;
            if (
              e.key === 'Enter' &&
              !e.ctrlKey &&
              !e.metaKey &&
              ziel.hasAttribute('data-posten-ende') &&
              !dropdownOffen(ziel)
            ) {
              e.preventDefault();
              const art = ziel.getAttribute('data-posten-ende');
              // On to the empty row of the table.
              wurzel.current
                ?.querySelector<HTMLElement>(`[data-tabelle="${art}"] [data-leer] [data-nav]`)
                ?.focus();
              return;
            }
            enterWeiter(e, wurzel.current, () => void pruefenOeffnen());
          }}
        >
          <Stack gap="lg">
            <Stack gap="md" maw={760}>
              <RechnungEmpfaengerFeld
                wert={form.empfaenger}
                mitglieder={mitglieder.data ?? []}
                extern={extern.data ?? []}
                anzeige={anzeige}
                fehler={fz('empfaenger')}
                autoFocus={!id}
                onWert={(e) => aendern((f) => ({ ...f, empfaenger: e }))}
              />
              <FeldZeile cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" verticalSpacing={0}>
                <TextInput
                  label={
                    <FeldLabel text="Rechnungsdatum" hilfe={HILFE.rechnungen.leistungsdatum} />
                  }
                  value={`${datumAnzeigen(heute)} (heute)`}
                  readOnly
                  tabIndex={-1}
                />
                <DatumFeld
                  label={
                    <FeldLabel text="Leistungsdatum" hilfe={HILFE.rechnungen.leistungsdatum} />
                  }
                  tippbar
                  value={form.leistungVon}
                  onWert={(wert) => aendern((f) => ({ ...f, leistungVon: wert }))}
                  loeschbar={false}
                  error={fz('leistung')}
                  data-nav=""
                />
                <DatumFeld
                  label="Leistung bis (optional)"
                  tippbar
                  value={form.leistungBis}
                  onWert={(wert) => aendern((f) => ({ ...f, leistungBis: wert }))}
                  min={form.leistungVon || undefined}
                  data-nav=""
                />
                <TextInput
                  label={
                    <FeldLabel text="Zahlungsziel in Tagen" hilfe={HILFE.rechnungen.zahlungsziel} />
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={3}
                  placeholder={`Standard: ${einstellungen.data?.zahlungszielTage ?? 14}`}
                  value={form.zahlungszielTage === null ? '' : String(form.zahlungszielTage)}
                  onChange={(e) => {
                    const t = e.currentTarget.value.replace(/\D/g, '');
                    const n = t === '' ? null : Math.min(Number(t), RECHNUNG_ZAHLUNGSZIEL_MAX);
                    aendern((f) => ({ ...f, zahlungszielTage: n }));
                  }}
                  data-nav=""
                />
              </FeldZeile>
              {leistungZukunft && (
                <Text size="sm" c="orange.8" role="status">
                  Das Leistungsdatum liegt in der Zukunft. Beim Stellen musst du das bestätigen.
                </Text>
              )}
              <VerschiebHinweis datum={heute} />
              <TextInput
                label="Betreff"
                placeholder="z. B. Rechnung für die Getränke zur Feier am 12.12."
                maxLength={200}
                value={form.betreff}
                onChange={(e) => {
                  const wert = e.currentTarget.value;
                  aendern((f) => ({ ...f, betreff: wert }));
                }}
                error={fz('betreff')}
                data-nav=""
              />
            </Stack>

            <Stack gap="xs">
              <Group justify="space-between" align="center" gap="xs">
                <Text fw={600}>Posten</Text>
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" fw={500}>
                    Preise sind
                  </Text>
                  <InfoHinweis feld="Brutto und Netto" text={HILFE.rechnungen.modus} />
                  <SegmentedControl
                    aria-label="Preise sind"
                    // Rarely changed: stays clickable but Tab goes straight to the Posten.
                    ref={(el) => el?.querySelectorAll('input').forEach((i) => (i.tabIndex = -1))}
                    value={form.modus}
                    onChange={(v) => aendern((f) => ({ ...f, modus: v as BelegModus }))}
                    data={BELEG_MODI.map((m) => ({ value: m, label: BELEG_MODUS_LABELS[m] }))}
                  />
                </Group>
              </Group>
              <RechnungPostenTabellen
                posten={zeilenSortieren(form.posten)}
                leere={leere}
                betraege={betraege}
                modus={form.modus}
                erloes={erloes}
                standardKonto={standardKonto}
                waren={waren.data ?? []}
                versucht={versucht}
                breit={breit}
                onAendern={postenAendern}
                onEntfernen={postenEntfernen}
              />
            </Stack>

            <Stack gap="xs">
              <BelegSummen
                jeSteuersatz={berechnung.jeSteuersatz}
                summeCent={berechnung.summe}
                pfand={pfandJeSatz(gefuellt, berechnung.pfandBetraege)}
                leereSpalte={breit}
              />
              {berechnung.fehler.map((m) => (
                <Text key={m} size="sm" c="red">
                  {m}
                </Text>
              ))}
            </Stack>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" maw={1100}>
              <Textarea
                label="Einleitung (optional)"
                description="Steht vor den Posten."
                autosize
                minRows={2}
                maxLength={1000}
                value={form.einleitung}
                onChange={(e) => {
                  const wert = e.currentTarget.value;
                  aendern((f) => ({ ...f, einleitung: wert }));
                }}
              />
              <Textarea
                label="Hinweis (optional)"
                description="Steht unter den Summen."
                autosize
                minRows={2}
                maxLength={1000}
                value={form.hinweis}
                onChange={(e) => {
                  const wert = e.currentTarget.value;
                  aendern((f) => ({ ...f, hinweis: wert }));
                }}
              />
            </SimpleGrid>

            {versucht && fehler.length > 0 && (
              <Alert id="rechnung-fehler" color="red" title="Noch nicht stellbar">
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
                Prüfen und stellen
              </Button>
              <Text size="sm" c="dimmed" visibleFrom="sm">
                Tastenkürzel: Strg+Enter
              </Text>
              <Button
                type="button"
                variant="subtle"
                color="red"
                onClick={() => {
                  if (entwurfId.current) return setVerwerfen(true);
                  lokalLoeschen(NEU);
                  void navigate(rechnungenPfad);
                }}
              >
                Entwurf verwerfen
              </Button>
            </Group>
          </Stack>
        </div>

        {pruefung && form.leistungVon && (
          <RechnungStellenDialog
            empfaenger={
              dialogEmpfaenger?.mitglied ? (
                <>
                  <StatusName status={dialogEmpfaenger.mitglied.status}>
                    {mitgliedName(dialogEmpfaenger.mitglied)}
                  </StatusName>
                  {` (${dialogEmpfaenger.name})`}
                </>
              ) : (
                (dialogEmpfaenger?.name ?? '')
              )
            }
            anschrift={dialogEmpfaenger?.anschrift ?? null}
            betreff={form.betreff.trim()}
            rechnungsdatum={heute}
            leistungVon={form.leistungVon}
            leistungBis={form.leistungBis || null}
            faelligAm={faelligAm(heute, zahlungsziel)}
            modus={form.modus}
            posten={gefuellt.map((p) => ({
              key: p.key,
              text: postenName(p),
              betragCent: betragVon(p),
            }))}
            berechnung={berechnung}
            pfand={pfandJeSatz(gefuellt, berechnung.pfandBetraege)}
            warnungen={pruefung.warnungen}
            laeuft={stellen.isPending}
            fehler={
              stellen.isError &&
              !(stellen.error instanceof ApiFehler && stellen.error.status === 409)
                ? fehlerText(stellen.error, 'Das Stellen ist fehlgeschlagen.')
                : stellen.isError
                  ? fehlerText(stellen.error)
                  : null
            }
            onStellen={(bestaetigt) => stellen.mutate(bestaetigt)}
            onClose={() => setPruefung(null)}
          />
        )}
        {verwerfen && (
          <BestaetigenDialog
            titel="Entwurf verwerfen?"
            bestaetigenText="Verwerfen"
            onClose={() => setVerwerfen(false)}
            onBestaetigt={async () => {
              await unwrap(
                await api.finanzen['rechnung-entwuerfe'][':id'].$delete({
                  param: { id: entwurfId.current! },
                }),
              );
              window.clearTimeout(timer.current);
              lokalLoeschen(NEU, lokalSchluessel(entwurfId.current ?? ''));
              warnung.abgeschlossen();
              setErledigt(true);
              qc.removeQueries({ queryKey: ['finanzen', 'rechnungEntwurf'] });
              void qc.invalidateQueries({ queryKey: ['finanzen', 'rechnungen'] });
              void navigate(rechnungenPfad, { replace: true });
            }}
          >
            <Text>Der Entwurf wird gelöscht.</Text>
          </BestaetigenDialog>
        )}
        {warnung.dialog}
      </Stack>
    </SteuersaetzeKontext.Provider>
  );
}
