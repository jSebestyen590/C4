import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Anchor } from '@mantine/core';
import {
  ausleiheSchema,
  ausleiheTage,
  blockierungWann,
  blockierungen,
  saetzeVerfuegbar,
  teileVon,
  type Blockierung,
  type PlatzZiel,
} from '@c4/shared';
import { useApi } from '../api';
import { AusleiheKopfFelder, type AusleiheKopf } from '../AusleiheKopfFelder';
import { BuchungsBestaetigung, type BestaetigungsGruppe } from '../BuchungsBestaetigung';
import { zeitpunktIso } from '../BuchungsFuss';
import { InventurLeiste } from '../InventurLeiste';
import {
  heuteLokal,
  ifcoGruppeTitel,
  mengeName,
  offenePositionenAus,
  positionText,
  standardMenge,
  verfuegbarePlaetze,
  verfuegbarImZeitraum,
  zeitraumZeile,
} from '../inventarAnzeige';
import { INVENTAR_KEY, useAusleihen, useInventar } from '../inventarDaten';
import { mengeVerteilen, teileGruppeTitel, teileSaetze } from '../inventarTeile';
import { jetztLokal } from '../inventurDaten';
import { useEigeneSub, useMitgliederListe } from '../organisator';
import { useEnterWeiter } from '../useEnterWeiter';
import { zielWert } from '../inventarAnzeige';
import { fehlerText, pruefen } from '../warenApi';
import { ZahlFeld } from '../ZahlFeld';

const mengeKey = (
  gegenstandId: string,
  ziel: { lagerortId: string | null; ifcoId: string | null },
) => `${gegenstandId}|${zielWert(ziel)}`;

/** Who holds or has reserved pieces in the period: `3 an Feuerwehr verliehen (20.10.–27.10.2026), 2 an … vorgemerkt (…)`, borrowers linked. */
function Blockiert({ liste }: Readonly<{ liste: Blockierung[] }>) {
  return liste.map((b, i) => (
    <span key={`${b.ausleiheId}-${b.vorgemerkt}`}>
      {i > 0 && ', '}
      {b.anzahl > 1 && `${b.anzahl} `}an{' '}
      {b.ausleiheId ? (
        <Anchor
          component={Link}
          to={`/inventar/ausleihen/${encodeURIComponent(b.ausleiheId)}`}
          inherit
          target="_blank"
        >
          {b.an}
        </Anchor>
      ) : (
        b.an
      )}{' '}
      {blockierungWann(b)}
    </span>
  ));
}

const ORANGE = 'var(--mantine-color-orange-6)';

/** Lend Gegenstände: header data plus, per Gegenstand and place, how many pieces leave. */
export function AusleihePage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inv = useInventar();
  const offeneAusleihen = useAusleihen(true).ausleihen;
  const offenePositionen = useMemo(() => offenePositionenAus(offeneAusleihen), [offeneAusleihen]);
  const enterWeiter = useEnterWeiter('verleihen-weiter');
  const [organisatorVorbelegt, setOrganisatorVorbelegt] = useState(false);
  const eigeneSub = useEigeneSub();
  const mitglieder = useMitgliederListe();
  const [kopf, setKopf] = useState<AusleiheKopf>({
    an: '',
    organisiertVon: '',
    zeitpunkt: jetztLokal(),
    rueckgabe: '',
    kommentar: '',
  });
  // Preselect the logged-in user as organiser once the Mitglieder are known (unless chosen already).
  if (
    kopf.organisiertVon === '' &&
    !organisatorVorbelegt &&
    eigeneSub &&
    mitglieder.data?.some((m) => m.sub === eigeneSub)
  ) {
    setOrganisatorVorbelegt(true);
    setKopf((k) => ({ ...k, organisiertVon: eigeneSub }));
  }
  const [rueckgabeFehler, setRueckgabeFehler] = useState<string | null>(null);
  const [gegenstandIds, setGegenstandIds] = useState<string[]>([]);
  /** IFCOs added with "Ganze IFCO verleihen"; they count as whole only while their full content is entered. */
  const [ifcoIds, setIfcoIds] = useState<string[]>([]);
  /** Parents added as a group of parts, and the number of sets (parent pieces) chosen for each. */
  const [gruppen, setGruppen] = useState<string[]>([]);
  const [saetze, setSaetze] = useState<Record<string, number | string>>({});
  const [mengen, setMengen] = useState<Record<string, number | string>>({});
  const [vorbelegt, setVorbelegt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bestaetigung, setBestaetigung] = useState<{
    daten: ReturnType<typeof ausleiheSchema.parse>;
    gruppen: BestaetigungsGruppe[];
  } | null>(null);

  const verleihbar = useMemo(
    () => inv.gegenstaende.filter((g) => !g.archiviert && !g.virtuell && g.plaetze.length > 0),
    [inv.gegenstaende],
  );

  /** The days of the chosen period; open-ended while no return day is entered. */
  const zeitraum = useMemo(() => {
    const iso = zeitpunktIso(kopf.zeitpunkt);
    return iso ? ausleiheTage(iso, kopf.rueckgabe || null) : { von: heuteLokal(), bis: null };
  }, [kopf.zeitpunkt, kopf.rueckgabe]);

  /** Free amount of a place in the chosen period. */
  const frei = (gegenstandId: string, platz: PlatzZiel & { anzahl: number }) =>
    verfuegbarImZeitraum(platz, gegenstandId, offenePositionen, zeitraum);

  /** Gegenstände in the content of the given IFCO that can be lent. */
  const ifcoInhalt = (ifcoId: string) => {
    const ifco = inv.ifcos.find((i) => i.id === ifcoId);
    const ids: string[] = [];
    for (const p of ifco?.inhalt ?? []) {
      const g = verleihbar.find((x) => x.id === p.gegenstandId);
      if (g?.plaetze.some((x) => x.ifcoId === ifcoId)) ids.push(g.id);
    }
    return { ids };
  };

  /** Parents with parts (not archived): offered as a group. */
  const eltern = useMemo(
    () =>
      inv.gegenstaende.filter(
        (g) => !g.archiviert && inv.gegenstaende.some((x) => x.teilVon === g.id),
      ),
    [inv.gegenstaende],
  );

  /** The lendable components of a parent: itself (unless virtual) first, then its parts. */
  const komponenten = (elternId: string) => {
    const e = inv.gegenstaende.find((g) => g.id === elternId);
    if (!e) return [];
    return [e, ...teileVon(inv.gegenstaende, elternId)].filter((g) =>
      verleihbar.some((v) => v.id === g.id),
    );
  };

  /** Available pieces of a Gegenstand over all its places in the chosen period. */
  const gesamtFrei = (g: (typeof inv.gegenstaende)[number]) =>
    g.archiviert
      ? 0
      : verfuegbarePlaetze(g, inv.lagerorte, inv.ifcos, true).reduce(
          (s, p) => s + Math.max(0, frei(g.id, p)),
          0,
        );

  /** Amounts per place key for `n` sets of a component: n x anzahlJe, most available place first. */
  const mengenFuer = (g: (typeof inv.gegenstaende)[number], elternId: string, n: number) =>
    mengeVerteilen(
      verfuegbarePlaetze(g, inv.lagerorte, inv.ifcos, true).map((p) => ({
        key: mengeKey(g.id, p),
        verfuegbar: frei(g.id, p),
      })),
      n * (g.id === elternId ? 1 : (g.anzahlJe ?? 1)),
    );

  /** Adds a parent as a group: all its lendable components with the amounts for one set. */
  const gruppeHinzufuegen = (elternId: string) => {
    const komp = komponenten(elternId);
    if (komp.length === 0) return;
    const neu = komp.filter((g) => !gegenstandIds.includes(g.id));
    setGruppen((alt) => (alt.includes(elternId) ? alt : [...alt, elternId]));
    setMengen((alt) => Object.assign({}, alt, ...neu.map((g) => mengenFuer(g, elternId, 1))));
    setGegenstandIds((alt) => [...alt, ...neu.map((g) => g.id).filter((id) => !alt.includes(id))]);
  };

  /** Sets the number of sets of a group and re-sets the amounts of its components. */
  const saetzeSetzen = (elternId: string, n: number) => {
    setSaetze((alt) => ({ ...alt, [elternId]: n }));
    setMengen((alt) =>
      Object.assign(
        {},
        alt,
        ...komponenten(elternId)
          .filter((g) => gegenstandIds.includes(g.id))
          .map((g) => mengenFuer(g, elternId, n)),
      ),
    );
  };

  const gruppeEntfernen = (elternId: string) => {
    const ids = komponenten(elternId).map((g) => g.id);
    setGruppen((alt) => alt.filter((x) => x !== elternId));
    setGegenstandIds((alt) => alt.filter((x) => !ids.includes(x)));
  };

  /** Parent id of the group a Gegenstand is shown in, if any. */
  const gruppeVon = (g: { id: string; teilVon: string | null }): string | null => {
    if (g.teilVon !== null && gruppen.includes(g.teilVon)) return g.teilVon;
    return gruppen.includes(g.id) ? g.id : null;
  };

  const anzahlSaetze = (elternId: string): number => {
    const w = saetze[elternId];
    return typeof w === 'number' && w >= 1 ? w : 1;
  };

  /** Adds a Gegenstand as a group when it has parts, else as a single section. */
  const auswaehlen = (id: string) => {
    if (eltern.some((e) => e.id === id)) gruppeHinzufuegen(id);
    else hinzufuegen([id]);
  };

  const hinzufuegen = (ids: string[], ifcoId?: string) => {
    if (ifcoId) setIfcoIds((alt) => (alt.includes(ifcoId) ? alt : [...alt, ifcoId]));
    setGegenstandIds((alt) => [...alt, ...ids.filter((id) => !alt.includes(id))]);
  };

  // Prefill from ?gegenstand= / ?ifco= once the Inventar is loaded.
  if (!vorbelegt && !inv.laedt && !inv.fehler) {
    setVorbelegt(true);
    const gegenstandId = params.get('gegenstand');
    const ifcoId = params.get('ifco');
    if (gegenstandId && eltern.some((e) => e.id === gegenstandId)) gruppeHinzufuegen(gegenstandId);
    else if (gegenstandId && verleihbar.some((g) => g.id === gegenstandId))
      hinzufuegen([gegenstandId]);
    if (ifcoId) {
      hinzufuegen(ifcoInhalt(ifcoId).ids, ifcoId);
    }
  }

  const ifcoOptionen = useMemo(
    () =>
      inv.ifcos
        .filter((i) => !i.archiviert && i.inhalt.length > 0)
        .map((i) => ({ value: i.id, label: i.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [inv.ifcos],
  );

  const sektionen = gegenstandIds.flatMap((id) => {
    const g = inv.gegenstaende.find((x) => x.id === id);
    if (!g) return [];
    const plaetze = verfuegbarePlaetze(g, inv.lagerorte, inv.ifcos, true).map((p) => ({
      ...p,
      verfuegbar: frei(g.id, p),
    }));
    return [{ g, plaetze }];
  });

  /** Entered amount of a place; without input the default (single piece, whole IFCO) counts. */
  const mengeWert = (
    g: { id: string; plaetze: unknown[] },
    p: { lagerortId: string | null; ifcoId: string | null; anzahl: number; verfuegbar: number },
  ): number | string | undefined =>
    mengen[mengeKey(g.id, p)] ??
    standardMenge(p, g.plaetze.length, p.ifcoId !== null && ifcoIds.includes(p.ifcoId));

  const menge = (
    g: { id: string; plaetze: unknown[] },
    p: { lagerortId: string | null; ifcoId: string | null; anzahl: number; verfuegbar: number },
  ) => {
    const wert = mengeWert(g, p);
    const zahl = typeof wert === 'number' ? wert : Number.NaN;
    return Number.isFinite(zahl) && zahl > 0 ? zahl : 0;
  };

  /** True while the entered amounts take the complete available content of the IFCO (and it has any). */
  const ifcoKomplett = (ifcoId: string) => {
    const inhalt = inv.ifcos.find((i) => i.id === ifcoId)?.inhalt ?? [];
    let etwas = false;
    for (const p of inhalt) {
      const g = inv.gegenstaende.find((x) => x.id === p.gegenstandId);
      const platz = g?.plaetze.find((x) => x.ifcoId === ifcoId);
      if (!g || !platz) continue;
      const verfuegbar = frei(g.id, platz);
      if (verfuegbar <= 0) continue;
      if (g.archiviert || menge(g, { ...platz, verfuegbar }) !== verfuegbar) return false;
      etwas = true;
    }
    return etwas;
  };
  const ganzeIfcoIds = ifcoIds.filter(ifcoKomplett);

  const verleihen = useMutation({
    mutationFn: async (json: ReturnType<typeof ausleiheSchema.parse>) => {
      const res = await api.inventar.ausleihen.$post({ json });
      await pruefen(res);
      return ((await res.json()) as { id: string }).id;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      notifications.show({ color: 'green', message: 'Die Ausleihe wurde angelegt.' });
      navigate(`/inventar/ausleihen/${encodeURIComponent(id)}`);
    },
    onError: (e) => {
      setBestaetigung(null);
      setFehler(fehlerText(e, 'Verleihen fehlgeschlagen.'));
    },
  });

  const absenden = () => {
    const iso = zeitpunktIso(kopf.zeitpunkt);
    if (!iso) return setFehler('Ungültiger Zeitpunkt.');
    const positionen = sektionen.flatMap(({ g, plaetze }) =>
      plaetze.flatMap((p) => {
        const anzahl = menge(g, p);
        if (anzahl <= 0) return [];
        const ganz = p.ifcoId !== null && ganzeIfcoIds.includes(p.ifcoId);
        return [
          {
            gegenstandId: g.id,
            lagerortId: p.lagerortId,
            ifcoId: p.ifcoId,
            anzahl,
            ...(ganz ? { ganzeIfco: true as const } : {}),
          },
        ];
      }),
    );
    const zuViel = sektionen.some(({ g, plaetze }) =>
      plaetze.some((p) => menge(g, p) > p.verfuegbar),
    );
    if (zuViel) return setFehler('Bei mindestens einem Platz sind nicht so viele verfügbar.');
    const geprueft = ausleiheSchema.safeParse({
      an: kopf.an,
      organisiertVon: kopf.organisiertVon,
      ausgeliehenAm: iso,
      rueckgabeGeplant: kopf.rueckgabe || undefined,
      kommentar: kopf.kommentar,
      positionen,
    });
    if (!geprueft.success) {
      const issues = geprueft.error.issues;
      setRueckgabeFehler(issues.find((i) => i.path[0] === 'rueckgabeGeplant')?.message ?? null);
      const anderes = issues.find((i) => i.path[0] !== 'rueckgabeGeplant');
      return setFehler(anderes ? anderes.message : null);
    }
    setFehler(null);
    setRueckgabeFehler(null);
    const bestGruppen: BestaetigungsGruppe[] = [
      {
        titel: `An ${geprueft.data.an}`,
        zeilen: [zeitraumZeile(iso, geprueft.data.rueckgabeGeplant)],
      },
      ...ganzeIfcoIds.map((ifcoId) => ({
        titel: ifcoGruppeTitel(ifcoId, inv.ifcos),
        zeilen: geprueft.data.positionen
          .filter((p) => p.ifcoId === ifcoId)
          .map((p) =>
            mengeName(
              p.anzahl,
              inv.gegenstaende.find((x) => x.id === p.gegenstandId)?.name ?? 'Unbekannt',
            ),
          ),
      })),
      ...gruppen.flatMap((elternId) => {
        const e = inv.gegenstaende.find((g) => g.id === elternId);
        const positionen = geprueft.data.positionen.filter(
          (p) =>
            !(p.ifcoId !== null && ganzeIfcoIds.includes(p.ifcoId)) &&
            gruppeVon(
              inv.gegenstaende.find((g) => g.id === p.gegenstandId) ?? { id: '', teilVon: null },
            ) === elternId,
        );
        if (!e || positionen.length === 0) return [];
        const summe = (id: string) =>
          geprueft.data.positionen
            .filter((p) => p.gegenstandId === id)
            .reduce((s, p) => s + p.anzahl, 0);
        return [
          {
            titel: teileGruppeTitel(
              e.name,
              teileSaetze(e, inv.gegenstaende, summe),
              anzahlSaetze(elternId),
            ),
            zeilen: positionen.map((p) =>
              positionText(p, inv.gegenstaende, inv.lagerorte, inv.ifcos),
            ),
          },
        ];
      }),
      ...sektionen.flatMap(({ g, plaetze }) => {
        if (gruppeVon(g) !== null) return [];
        const zeilen = plaetze.flatMap((p) => {
          const anzahl = menge(g, p);
          if (anzahl <= 0 || (p.ifcoId !== null && ganzeIfcoIds.includes(p.ifcoId))) return [];
          return [anzahl === 1 ? `Aus ${p.text}` : `${anzahl}× aus ${p.text}`];
        });
        return zeilen.length > 0 ? [{ titel: g.name, zeilen }] : [];
      }),
    ];
    setBestaetigung({ daten: geprueft.data, gruppen: bestGruppen });
  };

  /** What the page shows: single sections and groups (at the place of their first section). */
  const anzeige = (() => {
    const liste: (
      | { art: 'einzeln'; sektion: (typeof sektionen)[number] }
      | { art: 'gruppe'; elternId: string; sektionen: typeof sektionen }
    )[] = [];
    for (const sektion of sektionen) {
      const von = gruppeVon(sektion.g);
      if (von === null) liste.push({ art: 'einzeln', sektion });
      else if (!liste.some((e) => e.art === 'gruppe' && e.elternId === von))
        liste.push({
          art: 'gruppe',
          elternId: von,
          sektionen: sektionen.filter((x) => gruppeVon(x.g) === von),
        });
    }
    return liste;
  })();

  const sektionKarte = ({
    g,
    plaetze,
  }: {
    g: (typeof sektionen)[number]['g'];
    plaetze: (typeof sektionen)[number]['plaetze'];
  }) => (
    <Paper key={g.id} withBorder p="sm">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
          <Text fw={600} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
            {g.name}
          </Text>
          <ActionIcon
            variant="subtle"
            color="red"
            size={44}
            aria-label={`${g.name} entfernen`}
            onClick={() => setGegenstandIds((alt) => alt.filter((x) => x !== g.id))}
          >
            <IconTrash size={20} />
          </ActionIcon>
        </Group>
        {plaetze.every((p) => p.verfuegbar <= 0) && (
          <Text size="sm" c="dimmed">
            Im gewählten Zeitraum ist alles verliehen oder vorgemerkt. Du kannst den Gegenstand
            entfernen.
          </Text>
        )}
        {plaetze.map((p) => {
          const key = mengeKey(g.id, p);
          const aktuell = menge(g, p);
          const zuViel = aktuell > p.verfuegbar;
          const wer = blockierungen(
            offenePositionen,
            { gegenstandId: g.id, lagerortId: p.lagerortId, ifcoId: p.ifcoId },
            new Date(),
            zeitraum,
          );
          const hinweis =
            wer.length > 0 ? (
              <>
                {' · '}
                <Blockiert liste={wer} />
              </>
            ) : null;
          if (p.anzahl === 1) {
            // A piece that exists once: no amount to ask for, just lend it or not.
            return (
              <Checkbox
                key={key}
                size="md"
                label={`Verleihen aus ${p.text}`}
                description={
                  p.verfuegbar > 0 ? (
                    hinweis && <Blockiert liste={wer} />
                  ) : (
                    <>
                      Nicht verfügbar
                      {hinweis}
                    </>
                  )
                }
                disabled={p.verfuegbar <= 0}
                checked={aktuell > 0}
                data-zeile
                styles={{
                  root: { minHeight: 44, display: 'flex', alignItems: 'center' },
                  body: { alignItems: 'center', width: '100%' },
                  labelWrapper: { flex: 1, paddingBlock: 6 },
                }}
                onChange={(e) => {
                  const an = e.currentTarget.checked;
                  setMengen((alt) => ({ ...alt, [key]: an ? 1 : 0 }));
                }}
              />
            );
          }
          return (
            <ZahlFeld
              key={key}
              label={`Aus ${p.text}`}
              description={
                <>
                  Verfügbar: {p.verfuegbar}
                  {hinweis}
                </>
              }
              placeholder={String(p.verfuegbar)}
              disabled={p.verfuegbar <= 0}
              allowDecimal={false}
              allowNegative={false}
              min={0}
              inputMode="numeric"
              data-zeile
              value={mengeWert(g, p) ?? ''}
              error={
                zuViel ? (
                  <>
                    Nur {p.verfuegbar} verfügbar
                    {wer.length > 0 ? (
                      <>
                        : <Blockiert liste={wer} />.
                      </>
                    ) : (
                      '.'
                    )}
                  </>
                ) : undefined
              }
              styles={
                zuViel ? { input: { borderColor: ORANGE }, error: { color: ORANGE } } : undefined
              }
              onChange={(wert) => setMengen((alt) => ({ ...alt, [key]: wert }))}
            />
          );
        })}
      </Stack>
    </Paper>
  );

  if (inv.laedt) return <Loader m="md" aria-label="Inventar wird geladen" />;
  if (inv.fehler)
    return (
      <Alert m="md" color="red">
        Das Inventar konnte nicht geladen werden.
      </Alert>
    );

  return (
    <Stack maw={900} mih="calc(100dvh - 60px)" gap="md">
      <Stack gap={2}>
        <Title order={2}>Verleihen</Title>
        <Text size="sm" c="dimmed">
          Wähle aus, was du verleihst, und trag je Platz die Anzahl ein.
        </Text>
      </Stack>
      <AusleiheKopfFelder
        kopf={kopf}
        onChange={(t) => {
          setKopf((k) => ({ ...k, ...t }));
          setRueckgabeFehler(null);
        }}
        rueckgabeFehler={rueckgabeFehler}
      />

      <Title order={3}>Was wird verliehen?</Title>
      <Select
        label="Gegenstand hinzufügen"
        placeholder="Gegenstand suchen"
        searchable
        inputMode="text"
        nothingFoundMessage="Kein verleihbarer Gegenstand gefunden"
        data={[
          ...verleihbar
            .filter((g) => !eltern.some((e) => e.id === g.id))
            .map((g) => ({ value: g.id, label: g.name, disabled: gegenstandIds.includes(g.id) })),
          ...eltern.map((e) => {
            const teile = inv.gegenstaende.filter((x) => x.teilVon === e.id).length;
            const komp = komponenten(e.id);
            return {
              value: e.id,
              label: `${e.name} (${teile === 1 ? '1 Teil' : `${teile} Teile`})`,
              disabled: komp.length === 0 || komp.every((g) => gegenstandIds.includes(g.id)),
            };
          }),
        ].sort((a, b) => a.label.localeCompare(b.label, 'de'))}
        value={null}
        onChange={(id) => id && auswaehlen(id)}
      />
      <Select
        label="Ganze IFCO verleihen"
        placeholder="IFCO wählen"
        searchable
        inputMode="text"
        nothingFoundMessage="Keine IFCO gefunden"
        data={ifcoOptionen}
        value={null}
        onChange={(id) => {
          if (!id) return;
          const { ids } = ifcoInhalt(id);
          if (ids.length === 0)
            notifications.show({ color: 'yellow', message: 'In der IFCO ist nichts verfügbar.' });
          else hinzufuegen(ids, id);
        }}
      />

      {ganzeIfcoIds.length > 0 && (
        <Text size="sm" c="dimmed">
          Wird als ganze IFCO verliehen:{' '}
          {ganzeIfcoIds
            .map((id) => ifcoGruppeTitel(id, inv.ifcos).replace(' (ganze IFCO)', ''))
            .join(', ')}
        </Text>
      )}
      <Stack gap="sm" onKeyDown={enterWeiter}>
        {anzeige.map((e) => {
          if (e.art === 'einzeln') return sektionKarte(e.sektion);
          const el = inv.gegenstaende.find((x) => x.id === e.elternId)!;
          const verfuegbareSaetze = saetzeVerfuegbar(
            el,
            teileVon(inv.gegenstaende, el.id),
            gesamtFrei,
          );
          return (
            <Paper key={`g-${e.elternId}`} withBorder p="sm">
              <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                  <Text fw={700} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                    {el.name}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size={44}
                    aria-label={`${el.name} mit allen Teilen entfernen`}
                    onClick={() => gruppeEntfernen(el.id)}
                  >
                    <IconTrash size={20} />
                  </ActionIcon>
                </Group>
                {el.anzahl > 1 && (
                  <ZahlFeld
                    label={`Anzahl ${el.name}`}
                    description={`Verfügbar: ${verfuegbareSaetze} komplett`}
                    allowDecimal={false}
                    allowNegative={false}
                    min={1}
                    max={el.anzahl}
                    inputMode="numeric"
                    value={saetze[el.id] ?? 1}
                    onChange={(wert) => {
                      if (typeof wert === 'number')
                        saetzeSetzen(el.id, Math.min(el.anzahl, Math.max(1, wert)));
                      else setSaetze((alt) => ({ ...alt, [el.id]: wert }));
                    }}
                  />
                )}
                {e.sektionen.map(sektionKarte)}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
      {sektionen.length === 0 && <Text c="dimmed">Noch nichts ausgewählt.</Text>}

      <Box style={{ flex: 1 }} />
      {fehler && (
        <Alert color="red" role="alert">
          {fehler}
        </Alert>
      )}
      <InventurLeiste>
        <Button
          variant="default"
          size="md"
          mih={48}
          component={Link}
          to="/inventar?ansicht=verliehen"
        >
          Abbrechen
        </Button>
        <Button id="verleihen-weiter" size="md" mih={48} onClick={absenden}>
          Verleihen
        </Button>
      </InventurLeiste>
      {bestaetigung && (
        <BuchungsBestaetigung
          titel="Verleihen bestätigen"
          gruppen={bestaetigung.gruppen}
          buchenText="Verleihen"
          laedt={verleihen.isPending}
          onBuchen={() => verleihen.mutate(bestaetigung.daten)}
          onClose={() => setBestaetigung(null)}
        />
      )}
    </Stack>
  );
}
