import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconChevronLeft,
  IconCloudUpload,
  IconLock,
  IconLockOpen,
  IconPrinter,
  IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  anwesenheitsZeiten,
  stimmenPruefen,
  type ProtokollDokument,
  type ProtokollDto,
  type ProtokollKopf as KopfDaten,
} from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { useAuth } from '../auth';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { protokollLink, useOffiziellesProtokollAnlegen } from '../protokollDaten';
import { PROTOKOLL_STATUS_LABELS } from '../i18n';
import { tagAnzeigen } from '../kalenderZeit';
import { mitgliedName } from '../mitglied';
import { useEigeneSub, useMitgliederListe } from '../organisator';
import { AktionenAuswahl, AktionenKarte } from '../protokoll/AktionenAnsicht';
import {
  ergebnisZusammenfassung,
  gueltigeAuswahl,
  vorgewaehlteAktionen,
} from '../protokoll/aktionenLogik';
import { zuBausteinIdScrollen } from '../protokoll/GliederungBaum';
import { effektiveTeilnahme, kopfNachAnwesenheit } from '../protokoll/anwesenheit';
import { druckTitel, mitLiveKopf } from '../protokoll/dokumentDaten';
import { ProtokollDokumentAnsicht } from '../protokoll/ProtokollDokumentAnsicht';
import { NaechsteSitzungKarte } from '../protokoll/NaechsteSitzungKarte';
import { KonfliktHinweis } from '../protokoll/KonfliktHinweis';
import { SperreFreiHinweis, SperreHinweis } from '../protokoll/SperreHinweis';
import { useKategorieNamen } from '../protokoll/useKategorieNamen';
import { ProtokollEditor } from '../protokoll/ProtokollEditor';
import { useProtokollBilder } from '../protokoll/bilderDaten';
import { useProtokollPdfSpeichern } from '../protokoll/usePdfSpeichern';
import {
  useProtokoll,
  useProtokollAktionen,
  useProtokollAktionenAusfuehren,
  useProtokollLoeschen,
  useProtokollStatus,
} from '../protokollDaten';
import { formatZeit } from '../datum';
import { PROTOKOLL_DRUCK_CSS, ProtokollKopf } from '../ProtokollKopf';
import { useProtokollAutosave, type SpeicherZustand } from '../useProtokollAutosave';
import { useProtokollSperre, type SperreZustand } from '../useProtokollSperre';
import { ApiFehler, fehlerAnzeigen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const uhrzeit = formatZeit;

function SpeicherZeile({
  zustand,
  onErneut,
}: Readonly<{ zustand: SpeicherZustand; onErneut: () => void }>) {
  let text = '';
  let farbe = 'dimmed';
  if (zustand.art === 'geaendert') text = 'Änderungen werden gleich gespeichert …';
  else if (zustand.art === 'laeuft') text = 'Wird gespeichert …';
  else if (zustand.art === 'sauber' && zustand.um) text = `Gespeichert · ${uhrzeit(zustand.um)}`;
  else if (zustand.art === 'fehler') {
    text = zustand.erneut
      ? 'Nicht gespeichert. Neuer Versuch folgt gleich …'
      : 'Nicht gespeichert.';
    farbe = 'red';
  }
  return (
    <Group gap="xs" mih={24} aria-live="polite">
      <Text size="sm" c={farbe}>
        {text}
      </Text>
      {zustand.art === 'fehler' && !zustand.erneut && (
        <Anchor component="button" type="button" size="sm" onClick={onErneut}>
          Erneut versuchen
        </Anchor>
      )}
    </Group>
  );
}

type Dialog = 'abschliessen' | 'loeschen' | null;
type Ansicht = 'bearbeiten' | 'dokument';

/** Tells what the Aktionen did (nothing when none ran). */
const aktionenMelden = (ausgang: Parameters<typeof ergebnisZusammenfassung>[0]) => {
  const text = ergebnisZusammenfassung(ausgang);
  if (!text) return;
  const fehler = ausgang.some((a) => a.status === 'fehler');
  notifications.show({ color: fehler ? 'orange' : 'green', message: text });
};

/** Content of the closing dialog below the explanation: loading state, error or the list of Aktionen. */
function AbschliessenAktionen({
  gespeichert,
  q,
  auswahl,
  onAuswahl,
}: Readonly<{
  /** Whether the draft is saved (null = still saving). */
  gespeichert: boolean | null;
  q: Pick<ReturnType<typeof useProtokollAktionen>, 'data' | 'isLoading' | 'isError'>;
  auswahl: readonly string[];
  onAuswahl: (ids: string[]) => void;
}>) {
  if (gespeichert === null || (gespeichert === true && q.isLoading)) {
    return (
      <Group gap="xs">
        <Loader size="sm" aria-label="Aktionen werden geladen" />
        <Text size="sm" c="dimmed">
          Aktionen werden geladen …
        </Text>
      </Group>
    );
  }
  if (gespeichert === false) {
    return (
      <Alert color="red">
        Das Protokoll konnte nicht gespeichert werden. Die Aktionen lassen sich daher nicht
        anzeigen; abschließen kannst du trotzdem, sobald das Speichern klappt.
      </Alert>
    );
  }
  if (q.isError) {
    return (
      <Alert color="red" title="Die Aktionen konnten nicht geladen werden">
        Du kannst das Protokoll trotzdem ohne Aktionen abschließen.
      </Alert>
    );
  }
  if (!q.data || q.data.length === 0) return null;
  return (
    <Stack gap="xs">
      <Title order={5}>Aktionen</Title>
      <Text size="sm" c="dimmed">
        Beim Abschließen werden die angehakten Aktionen ausgeführt.
      </Text>
      <AktionenAuswahl
        aktionen={q.data}
        auswahl={auswahl}
        onAuswahl={(neu) => onAuswahl(gueltigeAuswahl(neu, q.data ?? []))}
      />
    </Stack>
  );
}

/** The loaded protocol; remounted (via `key`) whenever the server version replaces the local state. */
function ProtokollAnsicht({
  dto,
  neuLaden,
  sperre,
  sperreVerloren,
  freiHinweisSchliessen,
}: Readonly<{
  dto: ProtokollDto;
  neuLaden: () => Promise<unknown>;
  /** The edit lock of this tab (writers of a draft only). */
  sperre: SperreZustand;
  sperreVerloren: ReturnType<typeof useProtokollSperre>['verloren'];
  freiHinweisSchliessen: () => void;
}>) {
  const { can } = useAuth();
  const eigeneSub = useEigeneSub();
  const mitgliederListe = useMitgliederListe().data;
  // The viewer with their CURRENT status: @mentions of groups are matched against it.
  const ich = useMemo(() => {
    const m = mitgliederListe?.find((x) => x.sub === eigeneSub);
    return m ? { sub: m.sub, status: m.status } : null;
  }, [mitgliederListe, eigeneSub]);
  const navigate = useNavigate();
  const darfSchreiben = can('protokolle:schreiben');
  const offiziell = dto.offiziellVon !== null;
  const entwurf = dto.status === 'entwurf';
  // Writers edit a draft only while this tab holds the edit lock; without it they see the document.
  const editierbar = darfSchreiben && entwurf && sperre.art === 'eigen';
  // Closing only makes sense once the Sitzung has begun (the API enforces it too).
  const [geoeffnetUm] = useState(() => Date.now());
  const nochNichtBegonnen = !offiziell && Date.parse(dto.sitzung.beginn) > geoeffnetUm;
  const sperrePrueft =
    darfSchreiben && entwurf && (sperre.art === 'pruefe' || sperre.art === 'inaktiv');

  const bilder = useProtokollBilder(dto.id, dto.bilder);
  const [kopf, setKopf] = useState<KopfDaten>(dto.kopf);
  const [inhalt, setInhalt] = useState<ProtokollDokument>(dto.inhalt);
  // Live attendance (incl. local Kopf overrides) for the quorum in the editor.
  const zeiten = useMemo(() => anwesenheitsZeiten(inhalt), [inhalt]);
  const teilnahme = useMemo(() => effektiveTeilnahme(dto, kopf, zeiten), [dto, kopf, zeiten]);
  const ems = useMemo(() => mitLiveKopf(dto, kopf).ems, [dto, kopf]);
  // Binding votes that do not match the members present: they block closing.
  const stimmenProbleme = useMemo(
    () =>
      offiziell
        ? []
        : stimmenPruefen(inhalt, {
            art: dto.sitzung.art,
            teilnahme,
            ems: ems.filter((e) => e.ausgewaehlt),
            personName: (sub) => {
              const m = [...teilnahme, ...ems].find((p) => p.sub === sub);
              return m ? mitgliedName(m) : undefined;
            },
          }).problems,
    [inhalt, dto.sitzung.art, teilnahme, ems, offiziell],
  );
  const kategorien = useKategorieNamen(dto.sitzung.beginn);
  // The document view and the preview drawer of the editor show the same live data.
  const dokumentEingabe = useMemo(
    () => ({
      inhalt,
      kopf,
      ...mitLiveKopf(dto, kopf),
      sitzung: dto.sitzung,
      naechsteSitzungVorschlag: dto.naechsteSitzungVorschlag,
      mitglieder: mitgliederListe,
      ich,
      bilder: bilder.urls,
      bilderErneuern: bilder.erneuern,
      kategorien,
      offiziell,
    }),
    [inhalt, kopf, dto, mitgliederListe, ich, bilder.urls, bilder.erneuern, kategorien, offiziell],
  );
  const [vorschauOffen, vorschau] = useDisclosure(false);
  const [ansicht, setAnsicht] = useState<Ansicht>('bearbeiten');
  const [druckAuftrag, setDruckAuftrag] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [ladeNeu, setLadeNeu] = useState(false);
  const status = useProtokollStatus();
  const loeschen = useProtokollLoeschen();
  const aktionenAusfuehren = useProtokollAktionenAusfuehren();
  const pdfSpeichern = useProtokollPdfSpeichern();
  // Closing dialog: the draft is saved first (null = saving), then the Aktionen load.
  const [entwurfGespeichert, setEntwurfGespeichert] = useState<boolean | null>(null);
  const dialogAktionen = useProtokollAktionen(
    dto.id,
    dialog === 'abschliessen' && entwurfGespeichert === true && !offiziell,
  );
  // The user's choice; until they touch it the executable open Aktionen are checked.
  const [eigeneAuswahl, setEigeneAuswahl] = useState<string[] | null>(null);
  const gewaehlteAktionen =
    eigeneAuswahl ?? (dialogAktionen.data ? vorgewaehlteAktionen(dialogAktionen.data) : []);
  const aktionenLaden =
    entwurfGespeichert === null || (entwurfGespeichert === true && dialogAktionen.isLoading);
  // The Aktionen card of a closed protocol (writers only).
  const kartenAktionen = useProtokollAktionen(dto.id, darfSchreiben && !entwurf && !offiziell);
  const offiziellAnlegen = useOffiziellesProtokollAnlegen();

  const { zustand, aendern, jetzt } = useProtokollAutosave({
    id: dto.id,
    version: dto.version,
    inhalt: dto.inhalt,
    kopf: dto.kopf,
    aktiv: editierbar,
  });

  // The latest Kopf, also between renders (several changes in one tick must not overwrite each other).
  const kopfRef = useRef(kopf);
  const kopfAendern = (k: KopfDaten) => {
    kopfRef.current = k;
    setKopf(k);
    aendern({ kopf: k });
  };
  /** Somebody got an Erscheint / Geht block: they are locked to "da" in the Kopf. */
  const anwesenheit = useCallback(
    (sub: string) => {
      const neu = kopfNachAnwesenheit(dto, kopfRef.current, sub);
      if (!neu) return;
      kopfRef.current = neu;
      setKopf(neu);
      aendern({ kopf: neu });
    },
    [dto, aendern],
  );
  const inhaltAendern = (doc: ProtokollDokument) => {
    setInhalt(doc);
    aendern({ inhalt: doc });
  };

  /** Readers and closed protocols only have the document view; writers print it, too. */
  const dokumentSichtbar = !editierbar || ansicht === 'dokument';
  // Prints after the render that switched to the document view.
  useEffect(() => {
    if (druckAuftrag > 0) window.print();
  }, [druckAuftrag]);
  // Printing to PDF proposes the page title as file name (and PDF title): "2026-11-04_Sitzung".
  const druckName = druckTitel(dto.sitzung, offiziell);
  useEffect(() => {
    let vorher = document.title;
    const vor = () => {
      vorher = document.title;
      document.title = druckName;
    };
    const nach = () => {
      document.title = vorher;
    };
    window.addEventListener('beforeprint', vor);
    window.addEventListener('afterprint', nach);
    return () => {
      window.removeEventListener('beforeprint', vor);
      window.removeEventListener('afterprint', nach);
    };
  }, [druckName]);
  const drucken = () => {
    setAnsicht('dokument');
    setDruckAuftrag((n) => n + 1);
  };

  /** Saves pending changes first, then changes the status; the refetch remounts this view. */
  const statusSetzen = async (neu: 'entwurf' | 'abgeschlossen', aktionen?: string[]) => {
    if (editierbar && !(await jetzt())) {
      throw new ApiFehler(0, 'Das Protokoll konnte nicht gespeichert werden.');
    }
    const antwort = await status.mutateAsync({ id: dto.id, status: neu, aktionen });
    aktionenMelden(antwort.aktionen ?? []);
    // The PDF of the closed protocol goes to OneDrive (or is downloaded); closing is done either way.
    if (neu === 'abgeschlossen') void pdfSpeichern(dto.id);
  };

  /** Saves the draft, then the closing dialog may load the Aktionen. */
  const abschliessenOeffnen = () => {
    setEigeneAuswahl(null);
    setEntwurfGespeichert(null);
    setDialog('abschliessen');
    void jetzt().then(setEntwurfGespeichert, () => setEntwurfGespeichert(false));
  };

  const aktionenStarten = async (aktionId: string) => {
    try {
      const antwort = await aktionenAusfuehren.mutateAsync({ id: dto.id, aktionen: [aktionId] });
      aktionenMelden(antwort.ergebnisse);
    } catch (e) {
      fehlerAnzeigen(e);
    }
  };

  /** Closes the dialog, shows the editor and scrolls to the Baustein with the wrong vote count. */
  const zuBaustein = (id: string) => {
    setDialog(null);
    setAnsicht('bearbeiten');
    // Wait until the dialog has closed and released the page scroll.
    setTimeout(() => zuBausteinIdScrollen(id), 350);
  };

  const offiziellErstellen = async () => {
    try {
      const neuId = await offiziellAnlegen.mutateAsync(dto.id);
      void navigate(protokollLink(neuId));
    } catch (e) {
      fehlerAnzeigen(e);
    }
  };

  const wiederOeffnen = async () => {
    try {
      await statusSetzen('entwurf');
    } catch (e) {
      fehlerAnzeigen(e);
    }
  };

  const konflikt = zustand.art === 'konflikt';

  // A save was refused because the lock is gone: show the read-only view and check for the lock again.
  const gesperrtVon = zustand.art === 'gesperrt' ? zustand : null;
  useEffect(() => {
    if (gesperrtVon) sperreVerloren(gesperrtVon.von, gesperrtVon.eigene);
  }, [gesperrtVon, sperreVerloren]);

  return (
    <Stack>
      <style>{PROTOKOLL_DRUCK_CSS}</style>
      <div data-druck="aus">
        <ZurueckLink to="/protokolle">Protokolle</ZurueckLink>
      </div>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs" data-druck="aus">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Group gap="xs" align="center">
            <Title order={2} style={{ overflowWrap: 'anywhere' }}>
              {dto.sitzung.titel}
            </Title>
            {offiziell && (
              <Badge color="indigo" variant="light">
                Offiziell
              </Badge>
            )}
          </Group>
          <Anchor
            component={Link}
            to={`/kalender/events/${encodeURIComponent(dto.sitzung.id)}`}
            size="sm"
            display="block"
            py={{ base: 11, md: 0 }}
          >
            {tagAnzeigen(dto.sitzung.beginn)}
          </Anchor>
        </Stack>
        <Badge color={entwurf ? 'yellow' : 'green'} variant="light" style={{ flexShrink: 0 }}>
          {PROTOKOLL_STATUS_LABELS[dto.status]}
        </Badge>
      </Group>

      {darfSchreiben && (
        <Group gap="xs" data-druck="aus">
          {entwurf ? (
            <Button
              leftSection={<IconLock size={18} />}
              disabled={!editierbar || nochNichtBegonnen}
              onClick={abschliessenOeffnen}
            >
              Abschließen
            </Button>
          ) : (
            <Button
              variant="default"
              leftSection={<IconLockOpen size={18} />}
              loading={status.isPending}
              onClick={() => void wiederOeffnen()}
            >
              Wieder öffnen
            </Button>
          )}
          <Button variant="default" leftSection={<IconPrinter size={18} />} onClick={drucken}>
            Drucken
          </Button>
          <AktionsMenue
            label="Weitere Aktionen"
            aktionen={[
              {
                text: 'Löschen',
                icon: <IconTrash size={18} />,
                color: 'red',
                sichtbar: entwurf,
                onClick: () => setDialog('loeschen'),
              },
              {
                text: 'PDF erneut in OneDrive speichern',
                icon: <IconCloudUpload size={18} />,
                sichtbar: !entwurf,
                onClick: () => void pdfSpeichern(dto.id),
              },
            ]}
          />
        </Group>
      )}
      {offiziell && dto.offiziellVon && (
        <Anchor component={Link} to={protokollLink(dto.offiziellVon)} size="sm" data-druck="aus">
          Zum Original-Protokoll
        </Anchor>
      )}
      {!offiziell && !entwurf && dto.offiziellId && (
        <Anchor component={Link} to={protokollLink(dto.offiziellId)} size="sm" data-druck="aus">
          Offizielles Protokoll öffnen
        </Anchor>
      )}
      {darfSchreiben && !offiziell && !entwurf && !dto.offiziellId && (
        <Stack gap="xs" align="flex-start" data-druck="aus">
          <Button
            variant="default"
            loading={offiziellAnlegen.isPending}
            onClick={() => void offiziellErstellen()}
          >
            Offizielles Protokoll erstellen
          </Button>
          <Text size="sm" c="dimmed">
            Erstellt eine Kopie, die du bearbeiten kannst. Dokument und PDF zeigen darin Klarnamen
            statt Spitznamen und keine Statusfarben.
          </Text>
        </Stack>
      )}
      {darfSchreiben && entwurf && nochNichtBegonnen && (
        <Text size="sm" c="dimmed" data-druck="aus">
          Abschließen geht ab Beginn der Sitzung.
        </Text>
      )}
      {!darfSchreiben && (
        <Group data-druck="aus">
          <Button variant="default" leftSection={<IconPrinter size={18} />} onClick={drucken}>
            Drucken
          </Button>
        </Group>
      )}

      {darfSchreiben && sperre.art === 'gesperrt' && (
        <SperreHinweis von={sperre.von} eigene={sperre.eigene} />
      )}
      {darfSchreiben && sperre.art === 'eigen' && sperre.frei && (
        <SperreFreiHinweis onSchliessen={freiHinweisSchliessen} />
      )}
      {zustand.art === 'konflikt' && (
        <KonfliktHinweis
          von={zustand.geaendertVon}
          ladeNeu={ladeNeu}
          onNeuLaden={() => {
            setLadeNeu(true);
            void neuLaden().finally(() => setLadeNeu(false));
          }}
        />
      )}
      {editierbar && !konflikt && (
        <div data-druck="aus">
          <SpeicherZeile zustand={zustand} onErneut={() => void jetzt()} />
        </div>
      )}

      {editierbar && (
        <div data-druck="aus">
          <SegmentedControl
            fullWidth
            size="md"
            value={ansicht}
            onChange={(v) => setAnsicht(v as Ansicht)}
            data={[
              { value: 'bearbeiten', label: 'Bearbeiten' },
              { value: 'dokument', label: 'Dokument' },
            ]}
          />
        </div>
      )}

      {editierbar && (
        // Stays mounted (only hidden) in the document view, so the editor keeps its state.
        <Stack style={{ display: dokumentSichtbar ? 'none' : undefined }}>
          <ProtokollKopf
            dto={dto}
            kopf={kopf}
            inhalt={inhalt}
            editierbar={editierbar}
            onChange={kopfAendern}
          />
          <ProtokollEditor
            inhalt={dto.inhalt}
            editierbar={editierbar}
            onChange={inhaltAendern}
            sitzungBeginn={dto.sitzung.beginn}
            art={dto.sitzung.art}
            teilnahme={teilnahme}
            ems={ems}
            mitglieder={mitgliederListe}
            onAnwesenheit={anwesenheit}
            bilder={bilder}
          />
          <NaechsteSitzungKarte
            kopf={kopf}
            vorschlag={dto.naechsteSitzungVorschlag}
            optionen={dto.naechsteSitzungen}
            editierbar={editierbar}
            onChange={kopfAendern}
          />
        </Stack>
      )}
      {darfSchreiben && !entwurf && kartenAktionen.data && kartenAktionen.data.length > 0 && (
        <AktionenKarte
          aktionen={kartenAktionen.data}
          laeuftId={
            aktionenAusfuehren.isPending
              ? (aktionenAusfuehren.variables?.aktionen[0] ?? null)
              : null
          }
          gesperrt={aktionenAusfuehren.isPending}
          onAusfuehren={(aktionId) => void aktionenStarten(aktionId)}
        />
      )}
      {sperrePrueft && <Loader m="md" aria-label="Bearbeitung wird vorbereitet" />}
      {dokumentSichtbar && !sperrePrueft && <ProtokollDokumentAnsicht eingabe={dokumentEingabe} />}
      {editierbar && !dokumentSichtbar && !sperrePrueft && (
        <>
          <Box
            data-druck="aus"
            style={{
              position: 'fixed',
              top: '50%',
              right: 'env(safe-area-inset-right)',
              transform: 'translateY(-50%)',
              zIndex: 100,
            }}
          >
            <ActionIcon
              variant="default"
              size={48}
              aria-label="Dokument-Vorschau"
              title="Dokument-Vorschau"
              onClick={vorschau.open}
              style={{
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                boxShadow: 'var(--mantine-shadow-md)',
              }}
            >
              <IconChevronLeft size={24} />
            </ActionIcon>
          </Box>
          <Drawer
            opened={vorschauOffen}
            onClose={vorschau.close}
            position="right"
            size="min(52rem, 100%)"
            title="Dokument-Vorschau"
            zIndex={300}
            padding="sm"
          >
            <ProtokollDokumentAnsicht eingabe={dokumentEingabe} ohneGliederung />
          </Drawer>
        </>
      )}

      {dialog === 'abschliessen' && (
        <BestaetigenDialog
          titel="Protokoll abschließen"
          color="blue"
          bestaetigenText="Abschließen"
          gesperrt={stimmenProbleme.length > 0 || aktionenLaden}
          onClose={() => setDialog(null)}
          onBestaetigt={() => statusSetzen('abgeschlossen', gewaehlteAktionen)}
        >
          <Text>
            Beim Abschließen wird die Teilnahme eingefroren: Spätere Zu- oder Absagen ändern sie
            nicht mehr. Das Protokoll lässt sich nicht mehr bearbeiten, bis du es wieder öffnest.
          </Text>
          {stimmenProbleme.length > 0 && (
            <Alert color="orange" title="Die Stimmen passen nicht zur Anwesenheit">
              <Stack gap="xs" align="flex-start">
                <Text size="sm">
                  Jede Abstimmung und Wahl braucht genau so viele Stimmen, wie Mitglieder anwesend
                  waren. Korrigiere diese Stellen, dann kannst du abschließen:
                </Text>
                {stimmenProbleme.map((p, i) => (
                  <Anchor
                    key={`${p.bausteinId}-${i}`}
                    component="button"
                    type="button"
                    size="sm"
                    ta="left"
                    style={{ minHeight: 42, overflowWrap: 'anywhere' }}
                    onClick={() => zuBaustein(p.bausteinId)}
                  >
                    {p.text}
                  </Anchor>
                ))}
              </Stack>
            </Alert>
          )}
          {stimmenProbleme.length === 0 && (
            <AbschliessenAktionen
              gespeichert={entwurfGespeichert}
              q={dialogAktionen}
              auswahl={gewaehlteAktionen}
              onAuswahl={setEigeneAuswahl}
            />
          )}
        </BestaetigenDialog>
      )}
      {dialog === 'loeschen' && (
        <BestaetigenDialog
          titel="Protokoll löschen"
          bestaetigenText="Löschen"
          onClose={() => setDialog(null)}
          onBestaetigt={async () => {
            await loeschen.mutateAsync(dto.id);
            notifications.show({ color: 'green', message: 'Das Protokoll wurde gelöscht.' });
            void navigate('/protokolle', { replace: true });
          }}
        >
          <Text>
            Das Protokoll zu „{dto.sitzung.titel}“ wird endgültig gelöscht. Das lässt sich nicht
            rückgängig machen.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}

/** One protocol: Kopf, document, autosave for writers of a draft. */
export function ProtokollPage() {
  const { id } = useParams();
  const q = useProtokoll(id);
  const { can } = useAuth();
  const refetch = q.refetch;
  // The edit lock lives here (not in the remounted view): it survives reloading the latest version.
  const sperre = useProtokollSperre({
    id: id ?? '',
    aktiv: !!id && can('protokolle:schreiben') && q.data?.status === 'entwurf',
    beiFrei: refetch,
  });
  return (
    <>
      {q.isPending && <Loader m="md" aria-label="Protokoll wird geladen" />}
      {q.isError && (
        <Stack>
          <ZurueckLink to="/protokolle">Protokolle</ZurueckLink>
          <Alert color="red">Das Protokoll konnte nicht geladen werden.</Alert>
        </Stack>
      )}
      {q.data && (
        <ProtokollAnsicht
          key={q.dataUpdatedAt}
          dto={q.data}
          neuLaden={() => q.refetch()}
          sperre={sperre.zustand}
          sperreVerloren={sperre.verloren}
          freiHinweisSchliessen={sperre.hinweisSchliessen}
        />
      )}
    </>
  );
}
