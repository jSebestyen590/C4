import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  NumberInput,
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
  standardMenge,
  verfuegbarePlaetze,
  verfuegbarImZeitraum,
  zeitraumZeile,
} from '../inventarAnzeige';
import { INVENTAR_KEY, useAusleihen, useInventar } from '../inventarDaten';
import { jetztLokal } from '../inventurDaten';
import { useEigeneSub, useMitgliederListe } from '../organisator';
import { useEnterWeiter } from '../useEnterWeiter';
import { zielWert } from '../inventarAnzeige';
import { fehlerText, pruefen } from '../warenApi';

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
  const [mengen, setMengen] = useState<Record<string, number | string>>({});
  const [vorbelegt, setVorbelegt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bestaetigung, setBestaetigung] = useState<{
    daten: ReturnType<typeof ausleiheSchema.parse>;
    gruppen: BestaetigungsGruppe[];
  } | null>(null);

  const verleihbar = useMemo(
    () => inv.gegenstaende.filter((g) => !g.archiviert && g.plaetze.length > 0),
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

  const hinzufuegen = (ids: string[], ifcoId?: string) => {
    if (ifcoId) setIfcoIds((alt) => (alt.includes(ifcoId) ? alt : [...alt, ifcoId]));
    setGegenstandIds((alt) => [...alt, ...ids.filter((id) => !alt.includes(id))]);
  };

  // Prefill from ?gegenstand= / ?ifco= once the Inventar is loaded.
  if (!vorbelegt && !inv.laedt && !inv.fehler) {
    setVorbelegt(true);
    const gegenstandId = params.get('gegenstand');
    const ifcoId = params.get('ifco');
    if (gegenstandId && verleihbar.some((g) => g.id === gegenstandId)) hinzufuegen([gegenstandId]);
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
    const gruppen: BestaetigungsGruppe[] = [
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
      ...sektionen.flatMap(({ g, plaetze }) => {
        const zeilen = plaetze.flatMap((p) => {
          const anzahl = menge(g, p);
          if (anzahl <= 0 || (p.ifcoId !== null && ganzeIfcoIds.includes(p.ifcoId))) return [];
          return [anzahl === 1 ? `Aus ${p.text}` : `${anzahl}× aus ${p.text}`];
        });
        return zeilen.length > 0 ? [{ titel: g.name, zeilen }] : [];
      }),
    ];
    setBestaetigung({ daten: geprueft.data, gruppen });
  };

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
        data={verleihbar
          .map((g) => ({ value: g.id, label: g.name, disabled: gegenstandIds.includes(g.id) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'de'))}
        value={null}
        onChange={(id) => id && hinzufuegen([id])}
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
        {sektionen.map(({ g, plaetze }) => (
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
                  Im gewählten Zeitraum ist alles verliehen oder vorgemerkt. Du kannst den
                  Gegenstand entfernen.
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
                  <NumberInput
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
                      zuViel
                        ? { input: { borderColor: ORANGE }, error: { color: ORANGE } }
                        : undefined
                    }
                    onChange={(wert) => setMengen((alt) => ({ ...alt, [key]: wert }))}
                  />
                );
              })}
            </Stack>
          </Paper>
        ))}
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
