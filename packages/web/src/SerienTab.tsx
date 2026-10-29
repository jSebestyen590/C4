import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  heuteBerlin,
  SERIEN_REGELN,
  SERIEN_WOCHEN,
  serieAendernSchema,
  serieRegelText,
  WOCHENTAG_KURZ,
  WOCHENTAGE_REIHENFOLGE,
  type SerieBetroffenDto,
  type SerieListeDto,
  type SerienBestehende,
  type SerienRegel,
} from '@c4/shared';
import { useApi } from './api';
import { BestaetigenDialog } from './BestaetigenDialog';
import { DatumFeld } from './DatumFeld';
import { kalenderInvalidieren, useSerien, useVorlagen } from './kalenderDaten';
import { fehlerAnzeigen, fehlerText, pruefen } from './warenApi';

const REGEL_LABELS: Record<SerienRegel, string> = {
  woechentlich: 'Wöchentlich',
  monatlich: 'Monatlich',
};
const WOCHE_LABELS: Record<number, string> = { 1: '1.', 2: '2.', 3: '3.', 4: '4.', [-1]: 'Letzte' };

interface SerieWerte {
  name: string;
  vorlageId: string | null;
  regel: SerienRegel;
  wochentage: number[];
  wochen: number[];
  startDatum: string;
  endDatum: string;
}

const leereSerie = (): SerieWerte => ({
  name: '',
  vorlageId: null,
  regel: 'woechentlich',
  wochentage: [],
  wochen: [1],
  startDatum: heuteBerlin(new Date()),
  endDatum: '',
});

const werteAus = (s: SerieListeDto): SerieWerte => ({
  name: s.name,
  vorlageId: s.vorlageId,
  regel: s.regel,
  wochentage: s.wochentage,
  wochen: s.wochen.length > 0 ? s.wochen : [1],
  startDatum: s.startDatum,
  endDatum: s.endDatum ?? '',
});

const serieJson = (w: SerieWerte) => ({
  name: w.name,
  vorlageId: w.vorlageId ?? '',
  regel: w.regel,
  wochentage: w.wochentage,
  wochen: w.regel === 'monatlich' ? w.wochen : [],
  startDatum: w.startDatum,
  endDatum: w.endDatum === '' ? null : w.endDatum,
});

/** Toggle buttons (44px touch targets) for several values. */
function WahlButtons<T extends number>({
  label,
  optionen,
  wert,
  onChange,
}: Readonly<{
  label: string;
  optionen: readonly { wert: T; text: string }[];
  wert: readonly T[];
  onChange: (wert: T[]) => void;
}>) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <Group gap="xs" role="group" aria-label={label}>
        {optionen.map((o) => {
          const an = wert.includes(o.wert);
          return (
            <Button
              key={o.wert}
              variant={an ? 'filled' : 'default'}
              aria-pressed={an}
              h={44}
              miw={44}
              px="sm"
              onClick={() => onChange(an ? wert.filter((w) => w !== o.wert) : [...wert, o.wert])}
            >
              {o.text}
            </Button>
          );
        })}
      </Group>
    </Stack>
  );
}

type Nachfrage = {
  art: 'speichern' | 'aktiv' | 'loeschen';
  serie: SerieListeDto;
  werte?: SerieWerte;
  betroffen: SerieBetroffenDto;
};

/** Event series of the calendar: list, create, edit, turn on/off and delete. */
export function SerienTab() {
  const api = useApi();
  const qc = useQueryClient();
  const serien = useSerien();
  const vorlagen = useVorlagen();
  const [bearbeiten, setBearbeiten] = useState<{
    serie: SerieListeDto | null;
    werte: SerieWerte;
  } | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [nachfrage, setNachfrage] = useState<Nachfrage | null>(null);
  const [loeschen, setLoeschen] = useState<SerieListeDto | null>(null);

  const vorlageTitel = (id: string) => vorlagen.data?.find((v) => v.id === id)?.titel ?? '?';

  /** Runs an API call; a 409 with counts opens the question instead of failing. */
  const ausfuehren = async (
    art: Nachfrage['art'],
    serie: SerieListeDto,
    werte: SerieWerte | undefined,
    aufruf: () => Promise<Response>,
  ): Promise<boolean> => {
    const res = await aufruf();
    if (res.status === 409) {
      const body = (await res.clone().json()) as Partial<SerieBetroffenDto>;
      if (typeof body.unveraendert === 'number') {
        setNachfrage({
          art,
          serie,
          ...(werte && { werte }),
          betroffen: {
            error: body.error ?? '',
            unveraendert: body.unveraendert,
            angepasst: body.angepasst ?? 0,
          },
        });
        return false;
      }
    }
    await pruefen(res);
    await kalenderInvalidieren(qc);
    return true;
  };

  const speichern = async (
    serie: SerieListeDto | null,
    werte: SerieWerte,
    bestehende?: SerienBestehende,
  ) => {
    const geprueft = serieAendernSchema.safeParse({ ...serieJson(werte), bestehende });
    if (!geprueft.success)
      return setMeldung(geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setMeldung(null);
    setLaeuft(true);
    try {
      const json = serieJson(werte);
      const fertig = serie
        ? await ausfuehren(
            'speichern',
            serie,
            werte,
            () =>
              api.kalender.serien[':id'].$put({
                param: { id: serie.id },
                json: { ...json, ...(bestehende && { bestehende }) },
              }) as Promise<Response>,
          )
        : await (async () => {
            await pruefen(await api.kalender.serien.$post({ json }));
            await kalenderInvalidieren(qc);
            return true;
          })();
      if (fertig) {
        setBearbeiten(null);
        setNachfrage(null);
        notifications.show({ color: 'green', message: 'Die Serie wurde gespeichert.' });
      }
    } catch (e) {
      setNachfrage(null);
      setMeldung(fehlerText(e, 'Das Speichern ist fehlgeschlagen.'));
    } finally {
      setLaeuft(false);
    }
  };

  const aktivSetzen = async (
    serie: SerieListeDto,
    aktiv: boolean,
    bestehende?: SerienBestehende,
  ) => {
    try {
      const fertig = await ausfuehren(
        'aktiv',
        serie,
        undefined,
        () =>
          api.kalender.serien[':id'].aktiv.$put({
            param: { id: serie.id },
            json: { aktiv, ...(bestehende && { bestehende }) },
          }) as Promise<Response>,
      );
      if (fertig) setNachfrage(null);
    } catch (e) {
      setNachfrage(null);
      fehlerAnzeigen(e);
    }
  };

  const loeschenAusfuehren = async (serie: SerieListeDto, bestehende?: SerienBestehende) => {
    const fertig = await ausfuehren(
      'loeschen',
      serie,
      undefined,
      () =>
        api.kalender.serien[':id'].$delete({
          param: { id: serie.id },
          query: bestehende ? { bestehende } : {},
        }) as Promise<Response>,
    );
    if (fertig) setNachfrage(null);
  };

  const antwort = async (bestehende: SerienBestehende) => {
    if (!nachfrage) return;
    const { art, serie, werte } = nachfrage;
    if (art === 'speichern' && werte) return speichern(serie, werte, bestehende);
    try {
      if (art === 'aktiv') return await aktivSetzen(serie, false, bestehende);
      await loeschenAusfuehren(serie, bestehende);
    } catch (e) {
      setNachfrage(null);
      fehlerAnzeigen(e);
    }
  };

  if (serien.isError) return <Alert color="red">Die Serien konnten nicht geladen werden.</Alert>;
  if (serien.isPending) return <Loader m="md" />;

  const loeschenWort = nachfrage !== null && nachfrage.art !== 'speichern';
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Eine Serie legt Events aus einer Vorlage nach einer Regel an, bis zu 12 Monate im Voraus.
        Ein gelöschtes Event kommt nicht wieder.
      </Text>
      <Group>
        <Button
          leftSection={<IconPlus size={18} />}
          onClick={() => {
            setMeldung(null);
            setBearbeiten({ serie: null, werte: leereSerie() });
          }}
        >
          Serie anlegen
        </Button>
      </Group>
      {serien.data.length === 0 && <Text c="dimmed">Noch keine Serien.</Text>}
      {serien.data.map((s) => (
        <Paper key={s.id} withBorder p="sm" radius="md" style={{ opacity: s.aktiv ? 1 : 0.65 }}>
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  {s.name}
                </Text>
                <Text size="sm">{serieRegelText(s)}</Text>
                <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  Vorlage: {vorlageTitel(s.vorlageId)}
                </Text>
              </Stack>
              <Group gap={0} wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={44}
                  aria-label="Bearbeiten"
                  onClick={() => {
                    setMeldung(null);
                    setBearbeiten({ serie: s, werte: werteAus(s) });
                  }}
                >
                  <IconEdit size={20} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={44}
                  aria-label="Löschen"
                  onClick={() => setLoeschen(s)}
                >
                  <IconTrash size={20} />
                </ActionIcon>
              </Group>
            </Group>
            <Group justify="space-between" gap="xs">
              <Switch
                label="Aktiv"
                checked={s.aktiv}
                styles={{ root: { minHeight: 44, display: 'flex', alignItems: 'center' } }}
                onChange={(e) => void aktivSetzen(s, e.currentTarget.checked)}
              />
              <Badge variant="light" color="gray" tt="none">
                {s.kuenftig === 1 ? '1 künftiges Event' : `${s.kuenftig} künftige Events`}
              </Badge>
            </Group>
          </Stack>
        </Paper>
      ))}

      <Modal
        opened={bearbeiten !== null}
        onClose={() => setBearbeiten(null)}
        title={bearbeiten?.serie ? 'Serie bearbeiten' : 'Serie anlegen'}
      >
        {bearbeiten && (
          <SerieFormular
            werte={bearbeiten.werte}
            onChange={(werte) => setBearbeiten({ ...bearbeiten, werte })}
            vorlagen={(vorlagen.data ?? []).map((v) => ({ value: v.id, label: v.titel }))}
            meldung={meldung}
            laeuft={laeuft}
            onAbbrechen={() => setBearbeiten(null)}
            onSpeichern={() => void speichern(bearbeiten.serie, bearbeiten.werte)}
          />
        )}
      </Modal>

      <Modal
        opened={nachfrage !== null}
        onClose={() => setNachfrage(null)}
        title={`Bestehende Events von „${nachfrage?.serie.name ?? ''}“`}
      >
        {nachfrage && (
          <Stack>
            <Text size="sm">
              Es gibt {nachfrage.betroffen.unveraendert + nachfrage.betroffen.angepasst} künftige
              Events dieser Serie, davon {nachfrage.betroffen.unveraendert} noch unveränderte (
              {nachfrage.betroffen.angepasst} wurden bereits angepasst oder haben Einträge und
              bleiben).
            </Text>
            <Button loading={laeuft} onClick={() => void antwort('anpassen')}>
              {loeschenWort ? 'Unveränderte löschen' : 'Unveränderte anpassen'}
            </Button>
            <Button variant="light" onClick={() => void antwort('behalten')}>
              Bestehende behalten
            </Button>
            <Button variant="default" onClick={() => setNachfrage(null)}>
              Abbrechen
            </Button>
          </Stack>
        )}
      </Modal>

      {loeschen && (
        <BestaetigenDialog
          titel="Serie löschen?"
          bestaetigenText="Löschen"
          onClose={() => setLoeschen(null)}
          onBestaetigt={() => loeschenAusfuehren(loeschen)}
        >
          <Text size="sm">
            Die Serie „{loeschen.name}“ wird gelöscht. Es entstehen keine neuen Events mehr.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}

function SerieFormular({
  werte: w,
  onChange,
  vorlagen,
  meldung,
  laeuft,
  onAbbrechen,
  onSpeichern,
}: Readonly<{
  werte: SerieWerte;
  onChange: (w: SerieWerte) => void;
  vorlagen: { value: string; label: string }[];
  meldung: string | null;
  laeuft: boolean;
  onAbbrechen: () => void;
  onSpeichern: () => void;
}>) {
  return (
    <Stack>
      <TextInput
        label="Name"
        value={w.name}
        onChange={(e) => onChange({ ...w, name: e.currentTarget.value })}
      />
      <Select
        label="Vorlage"
        placeholder="Vorlage wählen"
        data={vorlagen}
        value={w.vorlageId}
        onChange={(v) => onChange({ ...w, vorlageId: v })}
      />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Regel
        </Text>
        <SegmentedControl
          fullWidth
          data={SERIEN_REGELN.map((r) => ({ value: r, label: REGEL_LABELS[r] }))}
          value={w.regel}
          onChange={(regel) => onChange({ ...w, regel: regel as SerienRegel })}
        />
      </Stack>
      <WahlButtons
        label="Wochentage"
        optionen={WOCHENTAGE_REIHENFOLGE.map((t) => ({ wert: t, text: WOCHENTAG_KURZ[t]! }))}
        wert={w.wochentage}
        onChange={(wochentage) => onChange({ ...w, wochentage })}
      />
      {w.regel === 'monatlich' && (
        <WahlButtons
          label="Welche Woche"
          optionen={SERIEN_WOCHEN.map((n) => ({ wert: n, text: WOCHE_LABELS[n]! }))}
          wert={w.wochen}
          onChange={(wochen) => onChange({ ...w, wochen })}
        />
      )}
      <DatumFeld
        label="Start"
        value={w.startDatum}
        loeschbar={false}
        onWert={(startDatum) => onChange({ ...w, startDatum })}
      />
      <DatumFeld
        label="Ende (optional)"
        value={w.endDatum}
        onWert={(endDatum) => onChange({ ...w, endDatum })}
      />
      {meldung && <Alert color="red">{meldung}</Alert>}
      <Group grow preventGrowOverflow={false}>
        <Button variant="default" onClick={onAbbrechen}>
          Abbrechen
        </Button>
        <Button loading={laeuft} onClick={onSpeichern}>
          Speichern
        </Button>
      </Group>
    </Stack>
  );
}
