import {
  ActionIcon,
  Alert,
  Box,
  Button,
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
import { ausleiheSchema, blockierungen, type Blockierung, type OffenePosition } from '@c4/shared';
import { useApi } from '../api';
import { AusleiheKopfFelder, type AusleiheKopf } from '../AusleiheKopfFelder';
import { BuchungsBestaetigung, type BestaetigungsGruppe } from '../BuchungsBestaetigung';
import { zeitpunktIso } from '../BuchungsFuss';
import { InventurLeiste } from '../InventurLeiste';
import { datumText, ifcoGruppeTitel, mengeName, verfuegbarePlaetze } from '../inventarAnzeige';
import { INVENTAR_KEY, useAusleihen, useInventar } from '../inventarDaten';
import { jetztLokal } from '../inventurDaten';
import { useEigeneSub, useMitgliederListe } from '../organisator';
import { useEnterWeiter } from '../useEnterWeiter';
import { zielWert } from '../inventarAnzeige';
import { fehlerText, pruefen } from '../warenApi';
import { zeitAnzeigen } from '../warenAnzeige';

const mengeKey = (
  gegenstandId: string,
  ziel: { lagerortId: string | null; ifcoId: string | null },
) => `${gegenstandId}|${zielWert(ziel)}`;

/** Who holds or has reserved pieces: `3 an Feuerwehr verliehen (seit 20.10.2026), 2 an … vorgemerkt (ab …)`, borrowers linked. */
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
      {b.vorgemerkt ? `vorgemerkt (ab ${b.datum})` : `verliehen (seit ${b.datum})`}
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
  const offenePositionen = useMemo<OffenePosition[]>(
    () =>
      offeneAusleihen.flatMap((a) =>
        a.positionen
          .filter((p) => p.zurueckAm === null)
          .map((p) => ({ ...p, ausleiheId: a.id, an: a.an, ausgeliehenAm: a.ausgeliehenAm })),
      ),
    [offeneAusleihen],
  );
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
  const [gegenstandIds, setGegenstandIds] = useState<string[]>([]);
  /** Ifcos added with "Ganze Ifco verleihen"; they count as whole only while their full content is entered. */
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

  /** Available amount per place of the given Ifco's content, keyed like `mengen`. */
  const ifcoInhalt = (ifcoId: string) => {
    const ifco = inv.ifcos.find((i) => i.id === ifcoId);
    const ids: string[] = [];
    const vorgabe: Record<string, number> = {};
    for (const p of ifco?.inhalt ?? []) {
      const g = verleihbar.find((x) => x.id === p.gegenstandId);
      const platz = g?.plaetze.find((x) => x.ifcoId === ifcoId);
      if (!g || !platz) continue;
      ids.push(g.id);
      const frei = platz.anzahl - platz.verliehen - platz.vorgemerkt;
      if (frei > 0) vorgabe[mengeKey(g.id, platz)] = frei;
    }
    return { ids, vorgabe };
  };

  const hinzufuegen = (ids: string[], vorgabe: Record<string, number> = {}, ifcoId?: string) => {
    if (ifcoId) setIfcoIds((alt) => (alt.includes(ifcoId) ? alt : [...alt, ifcoId]));
    setGegenstandIds((alt) => [...alt, ...ids.filter((id) => !alt.includes(id))]);
    setMengen((alt) => ({ ...vorgabe, ...alt }));
  };

  // Prefill from ?gegenstand= / ?ifco= once the Inventar is loaded.
  if (!vorbelegt && !inv.laedt && !inv.fehler) {
    setVorbelegt(true);
    const gegenstandId = params.get('gegenstand');
    const ifcoId = params.get('ifco');
    if (gegenstandId && verleihbar.some((g) => g.id === gegenstandId)) hinzufuegen([gegenstandId]);
    if (ifcoId) {
      const { ids, vorgabe } = ifcoInhalt(ifcoId);
      hinzufuegen(ids, vorgabe, ifcoId);
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
    return g ? [{ g, plaetze: verfuegbarePlaetze(g, inv.lagerorte, inv.ifcos, true) }] : [];
  });

  const menge = (gid: string, ziel: { lagerortId: string | null; ifcoId: string | null }) => {
    const wert = mengen[mengeKey(gid, ziel)];
    const zahl = typeof wert === 'number' ? wert : Number.NaN;
    return Number.isFinite(zahl) && zahl > 0 ? zahl : 0;
  };

  /** True while the entered amounts take the complete available content of the Ifco (and it has any). */
  const ifcoKomplett = (ifcoId: string) => {
    const inhalt = inv.ifcos.find((i) => i.id === ifcoId)?.inhalt ?? [];
    let etwas = false;
    for (const p of inhalt) {
      const g = inv.gegenstaende.find((x) => x.id === p.gegenstandId);
      const platz = g?.plaetze.find((x) => x.ifcoId === ifcoId);
      if (!g || !platz) continue;
      const frei = platz.anzahl - platz.verliehen - platz.vorgemerkt;
      if (frei <= 0) continue;
      if (g.archiviert || menge(g.id, platz) !== frei) return false;
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
        const anzahl = menge(g.id, p);
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
      plaetze.some((p) => menge(g.id, p) > p.verfuegbar),
    );
    if (zuViel) return setFehler('Bei mindestens einem Platz sind nicht so viele verfügbar.');
    const geprueft = ausleiheSchema.safeParse({
      an: kopf.an,
      organisiertVon: kopf.organisiertVon,
      ausgeliehenAm: iso,
      rueckgabeGeplant: kopf.rueckgabe || null,
      kommentar: kopf.kommentar,
      positionen,
    });
    if (!geprueft.success)
      return setFehler(geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setFehler(null);
    const gruppen: BestaetigungsGruppe[] = [
      {
        titel: `An ${geprueft.data.an}`,
        zeilen: [
          `${new Date(iso) > new Date() ? 'Ab' : 'Seit'} ${zeitAnzeigen(iso)}`,
          ...(geprueft.data.rueckgabeGeplant
            ? [`Rückgabe geplant: ${datumText(geprueft.data.rueckgabeGeplant)}`]
            : []),
        ],
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
          const anzahl = menge(g.id, p);
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
      <AusleiheKopfFelder kopf={kopf} onChange={(t) => setKopf((k) => ({ ...k, ...t }))} />

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
        label="Ganze Ifco verleihen"
        placeholder="Ifco wählen"
        searchable
        inputMode="text"
        nothingFoundMessage="Keine Ifco gefunden"
        data={ifcoOptionen}
        value={null}
        onChange={(id) => {
          if (!id) return;
          const { ids, vorgabe } = ifcoInhalt(id);
          if (ids.length === 0)
            notifications.show({ color: 'yellow', message: 'In der Ifco ist nichts verfügbar.' });
          else hinzufuegen(ids, vorgabe, id);
        }}
      />

      {ganzeIfcoIds.length > 0 && (
        <Text size="sm" c="dimmed">
          Wird als ganze Ifco verliehen:{' '}
          {ganzeIfcoIds
            .map((id) => ifcoGruppeTitel(id, inv.ifcos).replace(' (ganze Ifco)', ''))
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
                  Alles verliehen oder vorgemerkt. Du kannst den Gegenstand entfernen.
                </Text>
              )}
              {plaetze.map((p) => {
                const key = mengeKey(g.id, p);
                const zuViel = menge(g.id, p) > p.verfuegbar;
                const wer = blockierungen(
                  offenePositionen,
                  { gegenstandId: g.id, lagerortId: p.lagerortId, ifcoId: p.ifcoId },
                  new Date(),
                );
                return (
                  <NumberInput
                    key={key}
                    label={`Aus ${p.text}`}
                    description={
                      <>
                        Verfügbar: {p.verfuegbar}
                        {wer.length > 0 ? (
                          <>
                            {' · '}
                            <Blockiert liste={wer} />
                          </>
                        ) : (
                          p.verliehen + p.vorgemerkt > 0 &&
                          ` (${p.verliehen + p.vorgemerkt} schon verliehen oder vorgemerkt)`
                        )}
                      </>
                    }
                    placeholder={String(p.verfuegbar)}
                    disabled={p.verfuegbar <= 0}
                    allowDecimal={false}
                    allowNegative={false}
                    min={0}
                    inputMode="numeric"
                    data-zeile
                    value={mengen[key] ?? ''}
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
