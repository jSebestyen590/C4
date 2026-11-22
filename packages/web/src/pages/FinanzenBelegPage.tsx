import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  Loader,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  useMatches,
  useMantineTheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { SteuersaetzeKontext, satzProzent } from '../steuersaetze';
import {
  BELEG_MODI,
  belegEntwurfSchema,
  BELEG_MODUS_LABELS,
  centAnzeigen,
  belegdatumAlt,
  heuteBerlin,
  steuersaetzeAm,
  steuersatzUmstellen,
  ZAHLWEGE,
  ZAHLWEG_LABELS,
  type BelegDatei as BelegDateiDaten,
  type BelegGebuchtDto,
  type BelegModus,
  type BelegPostenArt,
  type BelegWareDto,
  type BelegWarnungDto,
  type Zahlweg,
} from '@c4/shared';
import { useApi, unwrap } from '../api';
import { BelegEinreichungKopf, BelegVerwerfenDialog } from '../BelegEinreichungKopf';
import { BelegPostenTabellen, type PostenBetraege } from '../BelegPostenTabellen';
import { BelegNeueWare } from '../BelegNeueWare';
import { FeldZeile } from '../FeldZeile';
import {
  blurWaehltMarkierte,
  enterWaehltErsteOption,
  fokusAnzahl,
  rechnungsstellerFilter,
  rechnungsstellerOptionen,
  rechnungsstellerWahl,
  warePatch,
} from '../belegAuswahl';
import { useAuth } from '../auth';
import { BelegPostenZeile } from '../BelegPostenZeile';
import { BelegBuchenDialog } from '../BelegBuchenDialog';
import { BelegDateiFeld } from '../BelegDatei';
import {
  EIGENBELEG_HINWEIS,
  fehlerZu,
  formularEigenbeleg,
  pfandJeSatz,
  satzText,
  formularFehler,
  formularSumme,
  formularZuDaten,
  gefuelltePosten,
  hatInhalt,
  datenZuFormular,
  leeresFormular,
  neuerPosten,
  POSTEN_REIHENFOLGE,
  postenHinzufuegen,
  postenLeer,
  postenSortieren,
  saetzeUmstellen,
  stueckelungHinweis,
  verwendeteSaetze,
  type BelegFormular,
  type PostenZeile,
} from '../belegFormular';
import { BelegSummen } from '../BelegSummen';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { BetragFeld } from '../BetragFeld';
import { DatumFeld } from '../DatumFeld';
import { VerschiebHinweis } from '../FestschreibungHinweise';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { HILFE } from '../finanzenHilfe';
import {
  belegEntwurfPfad,
  belegPfad,
  finanzenKeys,
  jsonOderFehler,
  useArtikelVorschlaege,
  useBargeld,
  useBelegWaren,
  useBelege,
  useSteuersatzZeitraeume,
  useKonten,
  useRechnungssteller,
} from '../finanzenDaten';
import { schluesselFuer } from '../buchungFormular';
import { mitgliedOptionen, useMitgliederListe } from '../organisator';
import { StueckelungFeld } from '../StueckelungFeld';
import { HINWEIS_DAUER_MS } from '../gebuchtHinweis';
import { lokalIstNeuer, lokalLesen, lokalLoeschen, lokalSpeichern } from '../entwurfSpeicher';
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
const NEU = 'beleg-neu';
const lokalSchluessel = (id: string) => `beleg-${id}`;

type LeereZeilen = Record<BelegPostenArt, PostenZeile>;
const neueLeere = (): LeereZeilen => ({
  ware: neuerPosten(undefined, 'ware'),
  kategorie: neuerPosten(undefined, 'kategorie'),
  leergut: neuerPosten(undefined, 'leergut'),
});

/** The locally stored form, when it still has the shape of one. */
function lokalesFormular(schluessel: string) {
  const l = lokalLesen<BelegFormular>(schluessel);
  return l && Array.isArray(l.wert.posten) && l.wert.posten.length > 0 ? l : null;
}

/**
 * Capture of a Beleg: file left, form right (stacked below `lg`). The draft is saved by itself
 * (debounced) and booked in a summary dialog. Desktop first with keyboard flow (`data-nav`, Enter =
 * next field, Enter in the last item row = new row, Ctrl+Enter = check and book).
 */
export function FinanzenBelegPage() {
  // The route elements of a new and an opened draft are the same component, so React keeps its state
  // across navigations; a counter as key gives the next Beleg of a series a fresh form.
  // The remount must wait for the navigation: a page mounted while the URL still names the booked
  // draft would load it (404) and never see the new route.
  const ort = useLocation();
  const [durchlauf, setDurchlauf] = useState(0);
  const [ausstehend, setAusstehend] = useState(false);
  const [gesehen, setGesehen] = useState(ort.key);
  if (gesehen !== ort.key) {
    setGesehen(ort.key);
    if (ausstehend) {
      setAusstehend(false);
      setDurchlauf((d) => d + 1);
    }
  }
  return <BelegSeite key={durchlauf} neuerDurchlauf={() => setAusstehend(true)} />;
}

function BelegSeite({ neuerDurchlauf }: Readonly<{ neuerDurchlauf: () => void }>) {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const konten = useKonten(false);
  const bargeld = useBargeld();
  const rechnungssteller = useRechnungssteller(false);
  const mitglieder = useMitgliederListe();
  const belegWaren = useBelegWaren();
  const zeitraeume = useSteuersatzZeitraeume();
  const artikelVorschlaege = useArtikelVorschlaege();
  // Set once the draft is booked or deleted, so the removed query is not fetched again (404).
  const [erledigt, setErledigt] = useState(false);
  // Sticky preview only beside the form (lg+); stacked on phones it would cover the form.
  const vorschauStil = useMatches({
    base: undefined,
    lg: { position: 'sticky' as const, top: 16 },
  });
  const entwurf = useQuery({
    queryKey: finanzenKeys.belegEntwurf(id),
    enabled: !!id && !erledigt,
    // Always load fresh when the page opens (a cached copy may predate the last save); changes made on
    // this page are written into the cache after each save.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    queryFn: async () =>
      unwrap(await api.finanzen['beleg-entwuerfe'][':id'].$get({ param: { id: id! } })),
  });

  const [form, setForm] = useState<BelegFormular | null>(() =>
    id ? null : (lokalesFormular(NEU)?.wert ?? leeresFormular()),
  );
  const formRef = useRef<BelegFormular | null>(form);
  const entwurfId = useRef<string | null>(id ?? null);
  const [lokaleUrl, setLokaleUrl] = useState<string | null>(null);
  const [stand, setStand] = useState<Speicherstand>('gespeichert');
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);
  const [versucht, setVersucht] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [warnungen, setWarnungen] = useState<BelegWarnungDto[]>([]);
  const [verwerfen, setVerwerfen] = useState(false);
  const [einreichungVerwerfen, setEinreichungVerwerfen] = useState(false);
  // Search text of the Rechnungssteller select (controlled, like the Ware search).
  const [rsSuche, setRsSuche] = useState('');
  const rsEingabe = useRef<HTMLInputElement>(null);
  // Series: "Weiteren Beleg erfassen" / "Weitere Einreichung bearbeiten"; on again for every new page.
  const [serie, setSerie] = useState(true);
  // Preview of the file: null = default (off for own Belege, on for submissions).
  const [vorschauWahl, setVorschauWahl] = useState<boolean | null>(null);
  const einreichungen = useBelege({});
  // The empty row at the end of each table: view state, joins the form once something is typed into it.
  const [leere, setLeereState] = useState(neueLeere);
  const leereRef = useRef(leere);
  const setLeere = (l: LeereZeilen) => {
    leereRef.current = l;
    setLeereState(l);
  };
  // "Neue Ware anlegen": the row (item key) and the typed name.
  const [neueWare, setNeueWare] = useState<{ key: string; name: string } | null>(null);
  const { can } = useAuth();
  const timer = useRef<number | undefined>(undefined);
  const kette = useRef<Promise<unknown>>(Promise.resolve());
  const wurzel = useRef<HTMLDivElement>(null);
  const theme = useMantineTheme();
  // From md: three item tables; below: item cards.
  const breit = useMediaQuery(`(min-width: ${theme.breakpoints.md})`, true, {
    getInitialValueInEffect: false,
  });
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);
  const nachspeichern = useRef(false);
  // Why the last save was skipped (the draft is not valid yet), else null.
  const ungueltig = useRef<string | null>(null);
  // Set while the save before leaving runs: a new draft then stays on this page (the leaving navigation goes on).
  const verlassen = useRef(false);
  const speichernVorWeg = useRef<() => Promise<boolean>>(async () => true);
  const warnung = useVerwerfenWarnung(stand !== 'gespeichert', () => speichernVorWeg.current());

  // The draft of the route is loaded once; later changes come from this page.
  useEffect(() => {
    if (!id || formRef.current || !entwurf.data || !entwurf.isFetchedAfterMount) return;
    let f = datenZuFormular(entwurf.data.daten);
    const lokal = lokalesFormular(lokalSchluessel(id));
    if (lokal && lokalIstNeuer(lokal.zeit, entwurf.data.geaendertAm)) {
      // Typed after the last save (the page was reloaded before the autosave ran): keep it and save it now.
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
        const geprueft = belegEntwurfSchema.safeParse({ daten });
        if (!geprueft.success) {
          setStand('ungespeichert');
          setSpeicherFehler(null);
          ungueltig.current = geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.';
          return false;
        }
        ungueltig.current = null;
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
          lokalLoeschen(NEU);
          if (formRef.current !== f) lokalSpeichern(lokalSchluessel(neu.id), formRef.current);
          if (!verlassen.current)
            warnung.ohneWarnung(() => void navigate(belegEntwurfPfad(neu.id), { replace: true }));
        }
        setSpeicherFehler(null);
        if (formRef.current === f && entwurfId.current)
          lokalLoeschen(lokalSchluessel(entwurfId.current));
        setStand(formRef.current === f ? 'gespeichert' : 'ungespeichert');
        // The draft query must not keep the state from before this save (a later visit would show it).
        const gespeichertId = entwurfId.current;
        if (gespeichertId)
          qc.setQueryData(finanzenKeys.belegEntwurf(gespeichertId), (alt: typeof entwurf.data) =>
            alt
              ? {
                  ...alt,
                  daten: daten as NonNullable<typeof entwurf.data>['daten'],
                  geaendertAm: new Date().toISOString(),
                }
              : alt,
          );
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

  const aendern = (fn: (f: BelegFormular) => BelegFormular) => {
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
    onSuccess: async (ergebnis) => {
      warnung.abgeschlossen();
      const gebuchtId = entwurfId.current;
      lokalLoeschen(NEU, lokalSchluessel(gebuchtId ?? ''));
      schluessel.current = null;
      void qc.invalidateQueries({
        queryKey: finanzenKeys.alle,
        predicate: (q) => q.queryKey[1] !== 'belegEntwurf',
      });
      setErledigt(true);
      qc.removeQueries({ queryKey: ['finanzen', 'belegEntwurf'] });
      const text = ergebnis.wiederholt
        ? `Beleg ${ergebnis.nummer} war schon gebucht.`
        : `Beleg ${ergebnis.nummer} gebucht (Buchung Nr. ${ergebnis.buchungSeq}).`;
      const weiter = await weiterZu(gebuchtId);
      if (weiter === null) {
        notifications.show({ color: 'green', autoClose: HINWEIS_DAUER_MS, message: text });
        void navigate(belegPfad(ergebnis.id), { replace: true });
        return;
      }
      // Series: the next form opens at once; the booked Beleg stays reachable through a link.
      const meldung = `beleg-gebucht-${ergebnis.id}`;
      notifications.show({
        id: meldung,
        color: 'green',
        autoClose: HINWEIS_DAUER_MS,
        message: (
          <Text size="sm">
            {text}{' '}
            <Anchor
              href={`/app${belegPfad(ergebnis.id)}`}
              onClick={(e) => {
                e.preventDefault();
                notifications.hide(meldung);
                void navigate(belegPfad(ergebnis.id));
              }}
            >
              ansehen
            </Anchor>
          </Text>
        ),
      });
      neuerDurchlauf();
      void navigate(weiter, { replace: true });
    },
  });

  /**
   * Where the series goes on after a booking or rejection: the next submission (oldest first, not the
   * current one) or an empty new Beleg; null when the series is off or no further submission exists.
   */
  const weiterZu = async (aktuellId: string | null): Promise<string | null> => {
    if (!serie) return null;
    if (entwurf.data?.status !== 'eingereicht') return '/finanzen/belege/neu';
    const naechste = (
      await qc
        .fetchQuery({
          queryKey: finanzenKeys.belege({}),
          staleTime: 0,
          queryFn: async () => unwrap(await api.finanzen.belege.$get({ query: {} })),
        })
        .catch(() => einreichungen.data)
    )?.belege
      .filter((b) => b.entwurfStatus === 'eingereicht' && b.id !== aktuellId)
      .sort((a, b) =>
        (a.eingereichtAm ?? a.erstelltAm).localeCompare(b.eingereichtAm ?? b.erstelltAm),
      )[0];
    return naechste ? belegEntwurfPfad(naechste.id) : null;
  };

  const anlegen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (name: string) =>
      jsonOderFehler<{ id: string }>(await api.finanzen.rechnungssteller.$post({ json: { name } })),
    onSuccess: async ({ id: neu }) => {
      await qc.invalidateQueries({ queryKey: ['finanzen', 'rechnungssteller'] });
      aendern((f) => ({ ...f, rechnungsstellerId: neu }));
      // On to the Belegdatum, after the select closed.
      setTimeout(() => wurzel.current?.querySelector<HTMLElement>('[data-belegdatum]')?.focus(), 0);
    },
  });

  // The tax rates follow the Belegdatum (today while it is empty).
  const saetzeAm = steuersaetzeAm(zeitraeume.data ?? [], form?.belegdatum || heuteBerlin());
  const saetzeVorher = useRef(saetzeAm);
  // The empty rows of the tables follow the rates of the Belegdatum (the filled items are remapped on a date change).
  useEffect(() => {
    const alt = saetzeVorher.current;
    saetzeVorher.current = saetzeAm;
    if (alt.regel === saetzeAm.regel && alt.ermaessigt === saetzeAm.ermaessigt) return;
    const l = leereRef.current;
    const um = (z: PostenZeile): PostenZeile => {
      const satz = steuersatzUmstellen(z.steuersatz, alt, saetzeAm);
      return { ...z, steuersatz: saetzeAm.saetze.includes(satz) ? satz : saetzeAm.regel };
    };
    setLeere({ ware: um(l.ware), kategorie: um(l.kategorie), leergut: um(l.leergut) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saetzeAm.regel, saetzeAm.ermaessigt]);

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
  const fehler = formularFehler(form, zeitraeume.data ?? []);
  const fz = (feld: string) => (versucht ? fehlerZu(fehler, feld) : undefined);
  const stueckHinweis = stueckelungHinweis(berechnung.summe, form.gegeben, form.wechselgeld);
  const zahler = (mitglieder.data ?? []).find((m) => m.sub === form.mitgliedId);
  const eingereicht = entwurf.data?.status === 'eingereicht';
  const dateiUrl = lokaleUrl ?? entwurf.data?.dateiUrl ?? null;
  const vorschauAn = vorschauWahl ?? eingereicht;
  const eigenbeleg = formularEigenbeleg(form);
  const heute = heuteBerlin();
  const datumZukunft =
    form.belegdatum !== '' && form.belegdatum > heute
      ? 'Das Belegdatum darf nicht in der Zukunft liegen.'
      : undefined;
  const datumAlt =
    form.belegdatum !== '' && form.belegdatum <= heute && belegdatumAlt(form.belegdatum, heute);
  const weitereEinreichung = (einreichungen.data?.belege ?? []).some(
    (b) => b.entwurfStatus === 'eingereicht' && b.id !== id,
  );
  const serieMoeglich = !eingereicht || weitereEinreichung;

  // Filled items in Beleg order = the order of the totals (`formularZuDaten` leaves empty rows out).
  const gefuellt = gefuelltePosten(form.posten);
  const betraege: PostenBetraege = new Map(
    gefuellt.map((p, i) => [
      p.key,
      {
        betragCent: berechnung.postenBetraege[i] ?? 0,
        pfandCent: berechnung.pfandBetraege[i] ?? 0,
      },
    ]),
  );
  const betragVon = (p: PostenZeile) => {
    const b = betraege.get(p.key);
    return (b?.betragCent ?? 0) + (b?.pfandCent ?? 0);
  };

  const postenAendern = (key: string, patch: Partial<PostenZeile>) => {
    const leereArt = POSTEN_REIHENFOLGE.find((a) => leereRef.current[a].key === key);
    if (leereArt) {
      // The empty row of a table: it joins the form once it has content, a new empty row follows.
      const zeile = { ...leereRef.current[leereArt], ...patch };
      if (postenLeer(zeile)) {
        setLeere({ ...leereRef.current, [leereArt]: zeile });
      } else {
        setLeere({ ...leereRef.current, [leereArt]: neuerPosten(zeile.steuersatz, leereArt) });
        aendern((f) => ({ ...f, posten: postenHinzufuegen(f.posten, zeile) }));
      }
      return;
    }
    aendern((f) => {
      const posten = f.posten.map((p) => (p.key === key ? { ...p, ...patch } : p));
      // A changed kind moves the item into its group.
      return { ...f, posten: 'art' in patch ? postenSortieren(posten) : posten };
    });
  };
  const postenEntfernen = (key: string) =>
    aendern((f) => {
      const rest = f.posten.filter((x) => x.key !== key);
      return { ...f, posten: rest.length > 0 ? rest : [neuerPosten()] };
    });
  // A Ware created in the Beleg: reload the list, then put it (with Gebinde, Pfand, Kategorie) into its row.
  const wareAngelegt = async (key: string, ware: { id: string }) => {
    await qc.invalidateQueries({ queryKey: finanzenKeys.belegWaren });
    const waren = qc.getQueryData<BelegWareDto[]>(finanzenKeys.belegWaren) ?? [];
    postenAendern(key, warePatch(waren, aufwand, ware.id, saetzeAm));
    fokusAnzahl(key);
  };
  const postenHinzu = (art: BelegPostenArt = 'ware') => {
    const neu = neuerPosten(
      form.posten.filter((p) => p.art === art).at(-1)?.steuersatz ??
        form.posten.at(-1)?.steuersatz ??
        saetzeAm.regel,
      art,
    );
    aendern((f) => ({ ...f, posten: postenHinzufuegen(f.posten, neu) }));
    setTimeout(() => {
      // First input of the new row (table) or card.
      wurzel.current?.querySelector<HTMLElement>(`[data-zeile="${neu.key}"] [data-nav]`)?.focus();
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
    if (!(await speichernJetzt()) || !entwurfId.current) {
      if (ungueltig.current)
        setSpeicherFehler(`Der Entwurf kann nicht gespeichert werden: ${ungueltig.current}`);
      return;
    }
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

  // "Neue Ware anlegen" in the Ware select: only with the right to manage Waren.
  const neueWareFn = can('waren:verwalten')
    ? (key: string, suche: string) => setNeueWare({ key, name: suche.trim() })
    : undefined;

  const postenName = (p: PostenZeile) => {
    if (p.art === 'leergut') return 'Leergut';
    if (p.art === 'ware') {
      const w = (belegWaren.data ?? []).find((x) => x.id === p.wareId);
      const g = w?.gebinde.find((x) => x.id === p.gebindeId);
      return `${w?.name ?? 'Ware'}${g ? ` (${g.bezeichnung})` : ''} – ${nameVon(p.kategorieId)}`;
    }
    return nameVon(p.kategorieId);
  };
  const nameVon = (konto: string | null) =>
    (konten.data ?? []).find((k) => k.id === konto)?.name ?? '';

  return (
    <SteuersaetzeKontext.Provider value={saetzeAm}>
      <Stack>
        <ZurueckLink to="/finanzen/belege">Belege</ZurueckLink>
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Title order={2}>{id ? 'Beleg-Entwurf' : 'Neuer Beleg'}</Title>
          {(id || stand !== 'gespeichert') && (
            <Text size="sm" c={stand === 'fehler' ? 'red' : 'dimmed'} role="status">
              {SPEICHER_TEXT[stand]}
            </Text>
          )}
        </Group>
        {speicherFehler && <Alert color="red">{speicherFehler}</Alert>}
        {eingereicht && entwurf.data && (
          <BelegEinreichungKopf
            entwurf={entwurf.data}
            betragCent={form.eingereichtBetragCent}
            notiz={form.notiz}
            rechnungsstellerName={form.rechnungsstellerName}
          />
        )}
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
              const art = ziel.getAttribute('data-posten-ende') as BelegPostenArt;
              // Tables: on to the empty row of the table; cards: a new card.
              const leer = wurzel.current?.querySelector<HTMLElement>(
                `[data-tabelle="${art}"] [data-leer] [data-nav]`,
              );
              if (leer) leer.focus();
              else postenHinzu(art);
              return;
            }
            enterWeiter(e, wurzel.current, () => void pruefenOeffnen());
          }}
        >
          <Stack gap="lg">
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'start' }}>
              <Stack style={vorschauAn ? vorschauStil : undefined}>
                <BelegDateiFeld
                  datei={form.datei}
                  vorschauUrl={dateiUrl}
                  doppeltText={
                    entwurf.data?.warnungen.find((w) => w.code === 'datei_doppelt')?.text
                  }
                  fehler={fz('datei') && !form.eigenbeleg ? fz('datei') : undefined}
                  vorschauSichtbar={vorschauAn}
                  onVorschau={setVorschauWahl}
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

              <Stack gap="lg">
                <FeldZeile
                  cols={{ base: 1, sm: 2 }}
                  spacing="md"
                  verticalSpacing={0}
                  platz="2.8rem"
                >
                  <Select
                    ref={rsEingabe}
                    label={
                      <FeldLabel text="Rechnungssteller" hilfe={HILFE.belege.rechnungssteller} />
                    }
                    placeholder="Rechnungssteller suchen"
                    onKeyDownCapture={enterWaehltErsteOption}
                    onFocus={(e) => e.currentTarget.select()}
                    allowDeselect={false}
                    autoFocus={!id}
                    searchable
                    onBlurCapture={blurWaehltMarkierte}
                    selectFirstOptionOnChange
                    data={rechnungsstellerOptionen(rechnungssteller.data ?? [], true)}
                    filter={rechnungsstellerFilter}
                    searchValue={rsSuche}
                    onSearchChange={setRsSuche}
                    value={form.rechnungsstellerId}
                    onChange={(v) => {
                      const wahl = rechnungsstellerWahl(
                        v,
                        document.activeElement === rsEingabe.current,
                      );
                      const aktuell =
                        (rechnungssteller.data ?? []).find((r) => r.id === form.rechnungsstellerId)
                          ?.name ?? '';
                      if (wahl !== 'waehlen') {
                        // "Neuen anlegen": creates at once, only when picked on purpose (never on leaving the field).
                        const name = rsSuche.trim();
                        setTimeout(() => setRsSuche(aktuell), 0);
                        if (wahl === 'anlegen' && name && !anlegen.isPending) anlegen.mutate(name);
                        return;
                      }
                      aendern((f) => ({ ...f, rechnungsstellerId: v }));
                    }}
                    nothingFoundMessage="Noch kein Rechnungssteller, tippe einen Namen zum Anlegen"
                    error={
                      fz('rechnungssteller') ??
                      (anlegen.isError ? fehlerText(anlegen.error) : undefined)
                    }
                    data-nav=""
                  />
                  <DatumFeld
                    label="Belegdatum"
                    tippbar
                    value={form.belegdatum}
                    onWert={(wert) => {
                      const neu = steuersaetzeAm(zeitraeume.data ?? [], wert || heute);
                      let umgestellt = 0;
                      aendern((f) => {
                        // Another tax rate period: items with the regular/reduced rate follow it.
                        const alt = steuersaetzeAm(zeitraeume.data ?? [], f.belegdatum || heute);
                        const r = saetzeUmstellen(f, alt, neu);
                        umgestellt = r.geaendert;
                        return {
                          ...r.form,
                          belegdatum: wert,
                          bezahldatum:
                            f.bezahldatum === '' || f.bezahldatum === f.belegdatum
                              ? wert
                              : f.bezahldatum,
                        };
                      });
                      if (umgestellt > 0)
                        notifications.show({
                          color: 'blue',
                          message: `Steuersätze der Posten auf das Belegdatum umgestellt (Regelsatz ${satzProzent(neu.regel)}, ermäßigt ${satzProzent(neu.ermaessigt)}).`,
                        });
                    }}
                    loeschbar={false}
                    error={fz('belegdatum') ?? datumZukunft}
                    data-nav=""
                    data-belegdatum=""
                  />
                  <BetragFeld
                    label={<FeldLabel text="Belegsumme (brutto)" hilfe={HILFE.belege.belegsumme} />}
                    negativ
                    value={form.belegsummeCent}
                    onWert={(c) => aendern((f) => ({ ...f, belegsummeCent: c }))}
                    error={fz('belegsumme')}
                    data-nav=""
                  />
                </FeldZeile>
                {datumAlt && (
                  <Text size="sm" c="orange.8" role="status">
                    Das Belegdatum liegt mehr als 2 Monate zurück. Prüfe es, gebucht wird trotzdem.
                  </Text>
                )}
                <VerschiebHinweis
                  datum={form.zahlweg === 'auslage' ? form.belegdatum : form.bezahldatum}
                />
              </Stack>
            </SimpleGrid>

            <Stack gap="xs">
              <Group justify="space-between" align="center" gap="xs">
                <Group gap={2}>
                  <Text fw={600}>Posten</Text>
                  <InfoHinweis feld="Postenart" text={HILFE.belege.postenArt} />
                  <InfoHinweis feld="Lager-Posten" text={HILFE.belege.lagerPosten} />
                  <InfoHinweis feld="Neue Ware" text={HILFE.belege.neueWare} />
                </Group>
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" fw={500}>
                    Preise sind
                  </Text>
                  <InfoHinweis feld="Brutto und Netto" text={HILFE.belege.modus} />
                  <SegmentedControl
                    aria-label="Preise sind"
                    // Rarely changed: stays clickable but Tab goes from Belegsumme straight to the Posten.
                    ref={(el) => el?.querySelectorAll('input').forEach((i) => (i.tabIndex = -1))}
                    value={form.modus}
                    onChange={(v) => aendern((f) => ({ ...f, modus: v as BelegModus }))}
                    data={BELEG_MODI.map((m) => ({ value: m, label: BELEG_MODUS_LABELS[m] }))}
                  />
                </Group>
              </Group>
              {breit ? (
                <BelegPostenTabellen
                  posten={form.posten}
                  leere={leere}
                  betraege={betraege}
                  modus={form.modus}
                  aufwand={aufwand}
                  waren={belegWaren.data ?? []}
                  artikelVorschlaege={artikelVorschlaege.data ?? []}
                  versucht={versucht}
                  eigenbeleg={eigenbeleg}
                  onNeueWare={neueWareFn}
                  onAendern={postenAendern}
                  onEntfernen={postenEntfernen}
                />
              ) : (
                <>
                  {form.posten.map((p, i) => (
                    <BelegPostenZeile
                      key={p.key}
                      p={p}
                      index={i}
                      letzte={i === form.posten.length - 1}
                      eigenbeleg={eigenbeleg}
                      modus={form.modus}
                      aufwand={aufwand}
                      waren={belegWaren.data ?? []}
                      artikelVorschlaege={artikelVorschlaege.data ?? []}
                      betragCent={betraege.get(p.key)?.betragCent ?? 0}
                      pfandBetragCent={betraege.get(p.key)?.pfandCent ?? 0}
                      versucht={versucht}
                      kannEntfernen={form.posten.length > 1}
                      onNeueWare={neueWareFn}
                      onAendern={(patch) => postenAendern(p.key, patch)}
                      onEntfernen={() => postenEntfernen(p.key)}
                    />
                  ))}
                  <Group>
                    <Button
                      variant="light"
                      leftSection={<IconPlus size={18} />}
                      onClick={() => postenHinzu()}
                    >
                      Posten hinzufügen
                    </Button>
                  </Group>
                </>
              )}
              <BelegsummeZeile postenCent={berechnung.summe} belegsummeCent={form.belegsummeCent} />
            </Stack>

            {form.modus === 'netto' && !eigenbeleg && (
              <Stack gap="xs">
                <Group gap={2}>
                  <Text fw={600}>Korrektur je Steuersatz</Text>
                  <InfoHinweis feld="Korrektur" text={HILFE.belege.korrektur} />
                </Group>
                {verwendeteSaetze(form).map((satz) => (
                  <FeldZeile key={satz} cols={{ base: 2, sm: 3 }} spacing="xs" verticalSpacing={0}>
                    <Text size="sm" fw={500} style={{ lineHeight: '42px' }}>
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
                  </FeldZeile>
                ))}
              </Stack>
            )}

            <Stack gap="xs">
              <BelegSummen
                jeSteuersatz={berechnung.jeSteuersatz}
                summeCent={berechnung.summe}
                pfand={pfandJeSatz(gefuellt, berechnung.pfandBetraege)}
                ohneVorsteuer={eigenbeleg}
                leereSpalte={breit}
              />
              {eigenbeleg && (
                <Text size="sm" c="dimmed" role="status">
                  {EIGENBELEG_HINWEIS}
                </Text>
              )}
              {berechnung.fehler.map((m) => (
                <Text key={m} size="sm" c="red">
                  {m}
                </Text>
              ))}
            </Stack>

            <Stack gap="md">
              <FeldZeile cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing={0}>
                <Select
                  label={<FeldLabel text="Zahlweg" hilfe={HILFE.belege.zahlweg} />}
                  placeholder="Zahlweg wählen"
                  onKeyDownCapture={enterWaehltErsteOption}
                  onBlurCapture={blurWaehltMarkierte}
                  onFocus={(e) => e.currentTarget.select()}
                  searchable
                  selectFirstOptionOnChange
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
                {form.zahlweg === 'bar' && (
                  <Select
                    label={<FeldLabel text="Fach" hilfe={HILFE.bargeld.fach} />}
                    placeholder="Fach suchen"
                    onKeyDownCapture={enterWaehltErsteOption}
                    onBlurCapture={blurWaehltMarkierte}
                    onFocus={(e) => e.currentTarget.select()}
                    allowDeselect={false}
                    searchable
                    selectFirstOptionOnChange
                    data={faecher.map((x) => ({ value: x.id, label: x.name }))}
                    value={form.fachId}
                    onChange={(v) => aendern((f) => ({ ...f, fachId: v }))}
                    nothingFoundMessage="Kein Fach gefunden"
                    error={fz('fach')}
                    data-nav=""
                  />
                )}
                {form.zahlweg && form.zahlweg !== 'auslage' && (
                  <DatumFeld
                    label={<FeldLabel text="Bezahldatum" hilfe={HILFE.belege.bezahldatum} />}
                    value={form.bezahldatum}
                    onWert={(wert) => aendern((f) => ({ ...f, bezahldatum: wert }))}
                    loeschbar={false}
                    tippbar
                    error={fz('bezahldatum')}
                    data-nav=""
                  />
                )}
                {form.zahlweg === 'auslage' && (
                  <Select
                    label={<FeldLabel text="Mitglied (hat bezahlt)" hilfe={HILFE.belege.auslage} />}
                    placeholder="Mitglied suchen"
                    onKeyDownCapture={enterWaehltErsteOption}
                    onBlurCapture={blurWaehltMarkierte}
                    onFocus={(e) => e.currentTarget.select()}
                    allowDeselect={false}
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
              </FeldZeile>
              {form.zahlweg === 'bar' && (
                <Stack gap="xs">
                  <Group gap={2}>
                    <Text fw={500} size="sm">
                      Münzen und Scheine
                    </Text>
                    <InfoHinweis feld="Stückelung" text={HILFE.belege.stueckelung} />
                  </Group>
                  <StueckelungFeld
                    label={
                      berechnung.summe < 0
                        ? 'Münzen und Scheine, die in die Kasse kommen'
                        : 'Münzen und Scheine, die du gibst, und Wechselgeld'
                    }
                    bestand={fach?.bestand}
                    spalten={[
                      {
                        id: 'ab',
                        label: berechnung.summe < 0 ? 'Abgang (zurückgegeben)' : 'Abgang (gegeben)',
                        value: form.gegeben,
                        onChange: (m) => aendern((f) => ({ ...f, gegeben: m })),
                        richtung: 'ab',
                        begrenzen: !!fach,
                      },
                      {
                        id: 'zu',
                        label: berechnung.summe < 0 ? 'Eingang (erhalten)' : 'Wechselgeld',
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

            <Stack gap="sm">
              <Group align="center" gap="md">
                <Button type="button" onClick={() => void pruefenOeffnen()}>
                  Prüfen und buchen
                </Button>
                <Text size="sm" c="dimmed" visibleFrom="sm">
                  Tastenkürzel: Strg+Enter
                </Text>
                {eingereicht ? (
                  <Button
                    type="button"
                    variant="subtle"
                    color="red"
                    onClick={() => setEinreichungVerwerfen(true)}
                  >
                    Verwerfen
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      if (entwurfId.current) return setVerwerfen(true);
                      lokalLoeschen(NEU);
                      void navigate('/finanzen/belege');
                    }}
                  >
                    Entwurf verwerfen
                  </Button>
                )}
              </Group>
              <Group gap={2} align="flex-start" wrap="nowrap">
                <Checkbox
                  size="md"
                  label={eingereicht ? 'Weitere Einreichung bearbeiten' : 'Weiteren Beleg erfassen'}
                  description={serieMoeglich ? undefined : 'Keine weitere Einreichung offen'}
                  checked={serie && serieMoeglich}
                  disabled={!serieMoeglich}
                  onChange={(e) => setSerie(e.currentTarget.checked)}
                />
                <InfoHinweis feld="Serienerfassung" text={HILFE.belege.serienerfassung} />
              </Group>
            </Stack>
          </Stack>
        </div>

        {dialog && form.rechnungsstellerId && form.zahlweg && (
          <BelegBuchenDialog
            form={form}
            rechnungssteller={
              (rechnungssteller.data ?? []).find((r) => r.id === form.rechnungsstellerId)?.name ??
              ''
            }
            zahlwegZusatz={
              form.zahlweg === 'bar'
                ? (fach?.name ?? null)
                : form.zahlweg === 'auslage' && zahler
                  ? (zahler.username ?? `${zahler.vorname} ${zahler.nachname}`)
                  : null
            }
            posten={gefuellt.map((p) => ({
              key: p.key,
              kategorie: postenName(p),
              text: p.text.trim(),
              betragCent: betragVon(p),
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
        {neueWare && (
          <BelegNeueWare
            name={neueWare.name}
            onAngelegt={(ware) => void wareAngelegt(neueWare.key, ware)}
            onClose={() => setNeueWare(null)}
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
              lokalLoeschen(NEU, lokalSchluessel(entwurfId.current ?? ''));
              warnung.abgeschlossen();
              void qc.invalidateQueries({
                queryKey: finanzenKeys.alle,
                predicate: (q) => q.queryKey[1] !== 'belegEntwurf',
              });
              setErledigt(true);
              qc.removeQueries({ queryKey: ['finanzen', 'belegEntwurf'] });
              void navigate('/finanzen/belege', { replace: true });
            }}
          >
            <Text>
              Der Entwurf wird gelöscht. Eine hochgeladene Datei bleibt im Archiv, das ist so
              gewollt.
            </Text>
          </BestaetigenDialog>
        )}
        {einreichungVerwerfen && (
          <BelegVerwerfenDialog
            onClose={() => setEinreichungVerwerfen(false)}
            onVerwerfen={async (grund) => {
              await unwrap(
                await api.finanzen['beleg-entwuerfe'][':id'].verwerfen.$post({
                  param: { id: entwurfId.current! },
                  json: { grund },
                }),
              );
              window.clearTimeout(timer.current);
              lokalLoeschen(NEU, lokalSchluessel(entwurfId.current ?? ''));
              warnung.abgeschlossen();
              void qc.invalidateQueries({
                queryKey: finanzenKeys.alle,
                predicate: (q) => q.queryKey[1] !== 'belegEntwurf',
              });
              setErledigt(true);
              qc.removeQueries({ queryKey: ['finanzen', 'belegEntwurf'] });
              notifications.show({ color: 'green', message: 'Der Beleg wurde verworfen.' });
              const weiter = await weiterZu(entwurfId.current);
              if (weiter !== null) neuerDurchlauf();
              void navigate(weiter ?? '/finanzen/belege', { replace: true });
            }}
          />
        )}
        {warnung.dialog}
      </Stack>
    </SteuersaetzeKontext.Provider>
  );
}

/** "Posten: X € · Belegsumme: Y € · Differenz: Z €"; the difference is red unless it is 0. */
function BelegsummeZeile({
  postenCent,
  belegsummeCent,
}: Readonly<{ postenCent: number; belegsummeCent: number | null }>) {
  const differenz = belegsummeCent === null ? null : belegsummeCent - postenCent;
  return (
    <Text size="sm" role="status" data-testid="belegsumme-zeile">
      Posten: <b>{centAnzeigen(postenCent)}</b> · Belegsumme:{' '}
      <b>{belegsummeCent === null ? '–' : centAnzeigen(belegsummeCent)}</b> · Differenz:{' '}
      <Text span fw={700} c={differenz === null || differenz === 0 ? undefined : 'red'}>
        {differenz === null ? '–' : centAnzeigen(differenz)}
      </Text>
    </Text>
  );
}
