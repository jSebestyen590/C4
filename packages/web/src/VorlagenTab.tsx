import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconArchive, IconArchiveOff, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SCHICHT_ART_LABELS } from './i18n';
import { vorlageEingabeSchema, type VorlageDto, type VorlageEingabe } from '@c4/shared';
import { AktionsMenue } from './AktionsMenue';
import { useApi } from './api';
import { BestaetigenDialog } from './BestaetigenDialog';
import {
  bedarfFelder,
  fehlerAusIssues,
  KopfFelder,
  neueSchichtWerte,
  neuerKey,
  SchichtListeEditor,
  type KopfWerte,
  type SchichtBasis,
  type SchichtFehler,
} from './KalenderFormular';
import {
  kalenderInvalidieren,
  useDienstformen,
  useEventKategorien,
  useVorlagen,
} from './kalenderDaten';
import { fehlerAnzeigen, fehlerText, pruefen } from './warenApi';
import { ZahlFeld } from './ZahlFeld';

interface VorlageSchichtForm extends SchichtBasis {
  tagVersatz: number | '';
  beginnZeit: string;
  endeTagVersatz: number | '';
  endeZeit: string;
}

interface VorlageWerte extends KopfWerte {
  beginnZeit: string;
  endeTagVersatz: number | '';
  endeZeit: string;
  schichten: VorlageSchichtForm[];
}

const leereVorlage = (): VorlageWerte => ({
  titel: '',
  beschreibung: '',
  kategorieId: null,
  hinweisStunden: '',
  beginnZeit: '20:00',
  endeTagVersatz: 0,
  endeZeit: '23:00',
  schichten: [],
});

const werteAus = (v: VorlageDto): VorlageWerte => ({
  titel: v.titel,
  beschreibung: v.beschreibung ?? '',
  kategorieId: v.kategorieId ?? null,
  hinweisStunden: v.fehltHinweisStunden ?? '',
  beginnZeit: v.beginnZeit,
  endeTagVersatz: v.endeTagVersatz,
  endeZeit: v.endeZeit,
  schichten: v.schichten.map((s) => ({
    key: neuerKey(),
    art: s.art,
    tagVersatz: s.tagVersatz,
    beginnZeit: s.beginnZeit,
    endeTagVersatz: s.endeTagVersatz,
    endeZeit: s.endeZeit,
    bedarfe:
      s.art === 'betrieb' && s.bedarfe.length > 0
        ? s.bedarfe.map((b) => ({ ...b }))
        : neueSchichtWerte().bedarfe,
    minimum: s.art === 'betrieb' ? 1 : s.minimum,
    wunsch: s.art === 'betrieb' ? 2 : s.wunsch,
  })),
});

const zahl = (v: number | ''): number => (v === '' ? 0 : v);

/** Form values -> API input, or German error texts (general and per Schicht field). */
function eingabe(
  w: VorlageWerte,
  archiviert: boolean,
): { fehler: string; schichtFehler?: Record<number, SchichtFehler> } | { json: VorlageEingabe } {
  const schichten = w.schichten.map((s) => ({
    tagVersatz: zahl(s.tagVersatz),
    beginnZeit: s.beginnZeit,
    endeTagVersatz: zahl(s.endeTagVersatz),
    endeZeit: s.endeZeit,
    ...bedarfFelder(s),
  }));
  const json = vorlageJson(w, schichten, archiviert);
  const geprueft = vorlageEingabeSchema.safeParse(json);
  if (!geprueft.success) {
    const { schichten: schichtFehler, allgemein } = fehlerAusIssues(geprueft.error.issues);
    return { fehler: allgemein ?? 'Ungültige Eingabe.', schichtFehler };
  }
  return { json: geprueft.data };
}

function vorlageJson<S>(w: VorlageWerte, schichten: S[], archiviert: boolean) {
  return {
    titel: w.titel,
    beschreibung: w.beschreibung,
    kategorieId: w.kategorieId,
    beginnZeit: w.beginnZeit,
    endeTagVersatz: zahl(w.endeTagVersatz),
    endeZeit: w.endeZeit,
    fehltHinweisStunden: w.hinweisStunden === '' ? null : w.hinweisStunden,
    schichten,
    archiviert,
  };
}

/** A day offset and a time of day: "Tage danach" (0 = day of the event) + "Uhrzeit". */
function VersatzZeit({
  titel,
  versatz,
  zeit,
  onChange,
  fehler,
}: Readonly<{
  titel: string;
  versatz: number | '';
  zeit: string;
  onChange: (versatz: number | '', zeit: string) => void;
  fehler?: string;
}>) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {titel}
      </Text>
      <Group gap="xs" align="flex-start" wrap="nowrap">
        <ZahlFeld
          label="Tage danach"
          description="0 = am Tag des Events"
          min={0}
          allowDecimal={false}
          allowNegative={false}
          value={versatz}
          onChange={(v) => onChange(typeof v === 'number' ? v : '', zeit)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <TextInput
          label="Uhrzeit"
          type="time"
          value={zeit}
          error={fehler}
          onChange={(e) => onChange(versatz, e.currentTarget.value)}
          w={140}
          style={{ flexShrink: 0 }}
        />
      </Group>
    </Stack>
  );
}

function VorlageEditor({
  vorlage,
  onFertig,
}: Readonly<{ vorlage: VorlageDto | null; onFertig: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const dienstformen = useDienstformen();
  const kategorien = useEventKategorien();
  const [werte, setWerte] = useState(() => (vorlage ? werteAus(vorlage) : leereVorlage()));
  const [fehler, setFehler] = useState<string | null>(null);
  const [schichtFehler, setSchichtFehler] = useState<Record<number, SchichtFehler>>({});
  const [laeuft, setLaeuft] = useState(false);

  const speichern = async () => {
    const e = eingabe(werte, vorlage?.archiviert ?? false);
    if ('fehler' in e) {
      setSchichtFehler(e.schichtFehler ?? {});
      return setFehler(e.fehler);
    }
    setFehler(null);
    setSchichtFehler({});
    setLaeuft(true);
    try {
      await pruefen(
        vorlage
          ? await api.kalender.vorlagen[':id'].$put({ param: { id: vorlage.id }, json: e.json })
          : await api.kalender.vorlagen.$post({ json: e.json }),
      );
      await kalenderInvalidieren(qc);
      onFertig();
    } catch (err) {
      setFehler(fehlerText(err, 'Das Speichern ist fehlgeschlagen.'));
    } finally {
      setLaeuft(false);
    }
  };

  if (dienstformen.isPending || kategorien.isPending) return <Loader m="md" />;
  if (dienstformen.isError || kategorien.isError)
    return <Alert color="red">Die Daten konnten nicht geladen werden.</Alert>;

  return (
    <Stack>
      <Anchor component="button" type="button" size="sm" ta="left" onClick={onFertig}>
        Zurück zur Liste
      </Anchor>
      <Text fw={700} size="lg">
        {vorlage ? 'Vorlage bearbeiten' : 'Vorlage anlegen'}
      </Text>
      <KopfFelder
        werte={werte}
        onChange={(k) => setWerte({ ...werte, ...k })}
        kategorien={kategorien.liste}
      />
      <TextInput
        label="Beginn (Uhrzeit)"
        type="time"
        value={werte.beginnZeit}
        onChange={(e) => setWerte({ ...werte, beginnZeit: e.currentTarget.value })}
      />
      <VersatzZeit
        titel="Ende"
        versatz={werte.endeTagVersatz}
        zeit={werte.endeZeit}
        onChange={(endeTagVersatz, endeZeit) => setWerte({ ...werte, endeTagVersatz, endeZeit })}
      />
      <SchichtListeEditor<VorlageSchichtForm>
        schichten={werte.schichten}
        onChange={(schichten) => setWerte({ ...werte, schichten })}
        dienstformen={dienstformen.liste}
        fehler={schichtFehler}
        neu={() => ({
          key: neuerKey(),
          ...neueSchichtWerte(),
          tagVersatz: 0,
          beginnZeit: werte.beginnZeit,
          endeTagVersatz: werte.endeTagVersatz,
          endeZeit: werte.endeZeit,
        })}
        untertitel={(s) =>
          s.beginnZeit && s.endeZeit
            ? `${SCHICHT_ART_LABELS[s.art]} ${s.beginnZeit}–${s.endeZeit}`
            : null
        }
        zeitFelder={(s, aendern, f) => (
          <Stack gap="sm">
            <VersatzZeit
              titel="Beginn"
              versatz={s.tagVersatz}
              zeit={s.beginnZeit}
              onChange={(tagVersatz, beginnZeit) => aendern({ tagVersatz, beginnZeit })}
            />
            <VersatzZeit
              titel="Ende"
              versatz={s.endeTagVersatz}
              zeit={s.endeZeit}
              fehler={f.endeZeit}
              onChange={(endeTagVersatz, endeZeit) => aendern({ endeTagVersatz, endeZeit })}
            />
          </Stack>
        )}
      />
      {fehler && <Alert color="red">{fehler}</Alert>}
      <Group grow preventGrowOverflow={false}>
        <Button variant="default" onClick={onFertig}>
          Abbrechen
        </Button>
        <Button loading={laeuft} onClick={() => void speichern()}>
          Speichern
        </Button>
      </Group>
    </Stack>
  );
}

/** Vorlagen: list with archive/delete, and the full editor in place of the list. */
export function VorlagenTab() {
  const api = useApi();
  const qc = useQueryClient();
  const q = useVorlagen(true);
  const [archivZeigen, setArchivZeigen] = useState(false);
  const [editor, setEditor] = useState<{ vorlage: VorlageDto | null } | null>(null);
  const [loeschen, setLoeschen] = useState<VorlageDto | null>(null);

  if (editor) return <VorlageEditor vorlage={editor.vorlage} onFertig={() => setEditor(null)} />;
  if (q.isError) return <Alert color="red">Die Vorlagen konnten nicht geladen werden.</Alert>;
  if (q.isPending) return <Loader m="md" />;

  const archivWechseln = async (v: VorlageDto) => {
    try {
      const e = eingabe(werteAus(v), !v.archiviert);
      if ('fehler' in e) throw new Error(e.fehler);
      await pruefen(await api.kalender.vorlagen[':id'].$put({ param: { id: v.id }, json: e.json }));
      await kalenderInvalidieren(qc);
    } catch (e) {
      fehlerAnzeigen(e);
    }
  };
  const sichtbar = q.data.filter((v) => archivZeigen || !v.archiviert);

  return (
    <Stack>
      <Group>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditor({ vorlage: null })}>
          Vorlage anlegen
        </Button>
      </Group>
      <Switch
        label="Archivierte anzeigen"
        checked={archivZeigen}
        onChange={(e) => setArchivZeigen(e.currentTarget.checked)}
      />
      {sichtbar.length === 0 && <Text c="dimmed">Noch keine Vorlagen.</Text>}
      {sichtbar.map((v) => (
        <Paper
          key={v.id}
          withBorder
          p="sm"
          radius="md"
          style={{ opacity: v.archiviert ? 0.65 : 1 }}
        >
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                {v.titel}
              </Text>
              <Text size="sm" c="dimmed">
                {v.beginnZeit}–{v.endeZeit} Uhr · {v.schichten.length}{' '}
                {v.schichten.length === 1 ? 'Schicht' : 'Schichten'}
              </Text>
              {v.archiviert && (
                <div>
                  <Badge variant="light" color="gray">
                    Archiviert
                  </Badge>
                </div>
              )}
            </Stack>
            <AktionsMenue
              label={`Aktionen für ${v.titel}`}
              aktionen={[
                {
                  text: 'Bearbeiten',
                  icon: <IconEdit size={18} />,
                  onClick: () => setEditor({ vorlage: v }),
                },
                {
                  text: v.archiviert ? 'Wiederherstellen' : 'Archivieren',
                  icon: v.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
                  onClick: () => void archivWechseln(v),
                },
                {
                  text: 'Löschen',
                  icon: <IconTrash size={18} />,
                  color: 'red',
                  trenner: true,
                  onClick: () => setLoeschen(v),
                },
              ]}
            />
          </Group>
        </Paper>
      ))}
      {loeschen && (
        <BestaetigenDialog
          titel="Vorlage löschen"
          bestaetigenText="Löschen"
          onClose={() => setLoeschen(null)}
          onBestaetigt={async () => {
            await pruefen(
              await api.kalender.vorlagen[':id'].$delete({ param: { id: loeschen.id } }),
            );
            await kalenderInvalidieren(qc);
          }}
        >
          <Text>
            „{loeschen.titel}“ wird gelöscht. Bereits angelegte Events bleiben unverändert.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
