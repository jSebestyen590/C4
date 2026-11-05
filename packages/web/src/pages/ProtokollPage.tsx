import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLock, IconLockOpen, IconPrinter, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ProtokollDokument, ProtokollDto, ProtokollKopf as KopfDaten } from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { useAuth } from '../auth';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { PROTOKOLL_STATUS_LABELS } from '../i18n';
import { tagAnzeigen } from '../kalenderZeit';
import { effektiveTeilnahme } from '../protokoll/anwesenheit';
import { mitLiveKopf } from '../protokoll/dokumentDaten';
import { ProtokollDokumentAnsicht } from '../protokoll/ProtokollDokumentAnsicht';
import { ProtokollEditor } from '../protokoll/ProtokollEditor';
import { useProtokoll, useProtokollLoeschen, useProtokollStatus } from '../protokollDaten';
import { PROTOKOLL_DRUCK_CSS, ProtokollKopf } from '../ProtokollKopf';
import { useProtokollAutosave, type SpeicherZustand } from '../useProtokollAutosave';
import { ApiFehler, fehlerAnzeigen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const uhrzeit = (d: Date) =>
  d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

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
    text = 'Speichern fehlgeschlagen.';
    farbe = 'red';
  }
  return (
    <Group gap="xs" mih={24} aria-live="polite">
      <Text size="sm" c={farbe}>
        {text}
      </Text>
      {zustand.art === 'fehler' && (
        <Anchor component="button" type="button" size="sm" onClick={onErneut}>
          Erneut versuchen
        </Anchor>
      )}
    </Group>
  );
}

type Dialog = 'abschliessen' | 'loeschen' | null;
type Ansicht = 'bearbeiten' | 'dokument';

/** The loaded protocol; remounted (via `key`) whenever the server version replaces the local state. */
function ProtokollAnsicht({
  dto,
  neuLaden,
}: Readonly<{ dto: ProtokollDto; neuLaden: () => Promise<unknown> }>) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const darfSchreiben = can('protokolle:schreiben');
  const entwurf = dto.status === 'entwurf';
  const editierbar = darfSchreiben && entwurf;

  const [kopf, setKopf] = useState<KopfDaten>(dto.kopf);
  const [inhalt, setInhalt] = useState<ProtokollDokument>(dto.inhalt);
  // Live attendance (incl. local Kopf overrides) for the quorum in the editor.
  const teilnahme = useMemo(() => effektiveTeilnahme(dto, kopf), [dto, kopf]);
  const ems = useMemo(() => mitLiveKopf(dto, kopf).ems, [dto, kopf]);
  const [ansicht, setAnsicht] = useState<Ansicht>('bearbeiten');
  const [druckAuftrag, setDruckAuftrag] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [ladeNeu, setLadeNeu] = useState(false);
  const status = useProtokollStatus();
  const loeschen = useProtokollLoeschen();

  const { zustand, aendern, jetzt } = useProtokollAutosave({
    id: dto.id,
    version: dto.version,
    inhalt: dto.inhalt,
    kopf: dto.kopf,
    aktiv: editierbar,
  });

  const kopfAendern = (k: KopfDaten) => {
    setKopf(k);
    aendern({ kopf: k });
  };
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
  const drucken = () => {
    setAnsicht('dokument');
    setDruckAuftrag((n) => n + 1);
  };

  /** Saves pending changes first, then changes the status; the refetch remounts this view. */
  const statusSetzen = async (neu: 'entwurf' | 'abgeschlossen') => {
    if (editierbar && !(await jetzt())) {
      throw new ApiFehler(0, 'Das Protokoll konnte nicht gespeichert werden.');
    }
    await status.mutateAsync({ id: dto.id, status: neu });
  };

  const wiederOeffnen = async () => {
    try {
      await statusSetzen('entwurf');
    } catch (e) {
      fehlerAnzeigen(e);
    }
  };

  const konflikt = zustand.art === 'konflikt';

  return (
    <Stack maw="60rem">
      <style>{PROTOKOLL_DRUCK_CSS}</style>
      <div data-druck="aus">
        <ZurueckLink to="/protokolle">Protokolle</ZurueckLink>
      </div>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs" data-druck="aus">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Title order={2} style={{ overflowWrap: 'anywhere' }}>
            {dto.sitzung.titel}
          </Title>
          <Anchor
            component={Link}
            to={`/kalender/events/${encodeURIComponent(dto.sitzung.id)}`}
            size="sm"
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
            <Button leftSection={<IconLock size={18} />} onClick={() => setDialog('abschliessen')}>
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
            ]}
          />
        </Group>
      )}
      {!darfSchreiben && (
        <Group data-druck="aus">
          <Button variant="default" leftSection={<IconPrinter size={18} />} onClick={drucken}>
            Drucken
          </Button>
        </Group>
      )}

      {konflikt && (
        <Alert
          color="red"
          title="Jemand anderes hat das Protokoll inzwischen geändert."
          data-druck="aus"
        >
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              Deine letzten Änderungen wurden nicht gespeichert. Lade die neue Version, um
              weiterzuarbeiten. Deine ungespeicherten Änderungen gehen dabei verloren.
            </Text>
            <Button
              color="red"
              loading={ladeNeu}
              onClick={() => {
                setLadeNeu(true);
                void neuLaden().finally(() => setLadeNeu(false));
              }}
            >
              Neu laden
            </Button>
          </Stack>
        </Alert>
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
          <ProtokollKopf dto={dto} kopf={kopf} editierbar={editierbar} onChange={kopfAendern} />
          <ProtokollEditor
            inhalt={dto.inhalt}
            editierbar={editierbar}
            onChange={inhaltAendern}
            sitzungBeginn={dto.sitzung.beginn}
            art={dto.sitzung.art}
            teilnahme={teilnahme}
            ems={ems}
          />
        </Stack>
      )}
      {dokumentSichtbar && (
        <ProtokollDokumentAnsicht
          eingabe={{
            inhalt,
            kopf,
            ...mitLiveKopf(dto, kopf),
            sitzung: dto.sitzung,
          }}
        />
      )}

      {dialog === 'abschliessen' && (
        <BestaetigenDialog
          titel="Protokoll abschließen"
          color="blue"
          bestaetigenText="Abschließen"
          onClose={() => setDialog(null)}
          onBestaetigt={() => statusSetzen('abgeschlossen')}
        >
          <Text>
            Beim Abschließen wird die Teilnahme eingefroren: Spätere Zu- oder Absagen ändern sie
            nicht mehr. Das Protokoll lässt sich nicht mehr bearbeiten, bis du es wieder öffnest.
          </Text>
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
        <ProtokollAnsicht key={q.dataUpdatedAt} dto={q.data} neuLaden={() => q.refetch()} />
      )}
    </>
  );
}
