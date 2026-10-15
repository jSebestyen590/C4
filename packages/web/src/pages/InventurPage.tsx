import { Alert, Anchor, Box, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Gebinde } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { AktionsMenue } from '../AktionsMenue';
import { InventurAbschnitt } from '../InventurAbschnitt';
import { InventurLeiste } from '../InventurLeiste';
import { InventurZusammenfassung } from '../InventurZusammenfassung';
import { knotenZustand, type KnotenZustand, type WareInfo } from '../inventurDaten';
import { useInventurSpeichern, type SpeicherStatus } from '../useInventurSpeichern';
import { fehlerAnzeigen, fehlerText, pruefen } from '../warenApi';

const STATUS_TEXT: Record<SpeicherStatus, string> = {
  leer: '',
  speichert: 'Speichert…',
  gespeichert: 'Gespeichert',
  fehler: 'Nicht gespeichert',
  unvollstaendig: 'Gespeichert, MHD fehlt',
};

/** Inventory as one editable table for the whole Lager (autosaved draft), then review and booking. */
export function InventurPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [zustaende, setZustaende] = useState<Record<string, KnotenZustand> | null>(null);
  const [zusammenfassung, setZusammenfassung] = useState(false);
  const [weiter, setWeiter] = useState(false);
  const [verwerfen, setVerwerfen] = useState(false);

  const daten = useQuery({
    queryKey: ['inventuren', id],
    queryFn: async () => unwrap(await api.inventuren[':id'].$get({ param: { id } })),
    staleTime: 0,
    gcTime: 0,
  });
  const katalogDaten = useQuery({
    queryKey: ['waren', { archiv: true }],
    queryFn: async () => unwrap(await api.waren.$get({ query: { archiv: '1' } })),
  });

  const katalog: WareInfo[] = useMemo(() => katalogDaten.data ?? [], [katalogDaten.data]);
  const waren = useMemo(() => {
    const karte = new Map<string, WareInfo>();
    for (const w of daten.data?.waren ?? []) karte.set(w.id, { ...w, aliase: [] });
    for (const w of katalog) karte.set(w.id, w);
    return karte;
  }, [daten.data, katalog]);
  const gebinde: Gebinde[] = useMemo(() => daten.data?.gebinde ?? [], [daten.data]);
  const knoten = useMemo(() => daten.data?.knoten ?? [], [daten.data]);

  // The local input state is the source of truth; it is built once from the fresh draft.
  if (zustaende === null && daten.data && !daten.isFetching) {
    setZustaende(
      Object.fromEntries(daten.data.knoten.map((k) => [k.lagerortId, knotenZustand(k, waren)])),
    );
  }

  const speicher = useInventurSpeichern(id, () => ({ zustaende: zustaende ?? {}, waren }));

  const aendern = (lid: string, f: (alt: KnotenZustand) => KnotenZustand) => {
    setZustaende((alt) => (alt && alt[lid] ? { ...alt, [lid]: f(alt[lid]) } : alt));
    speicher.geaendert(lid);
  };

  const zurZusammenfassung = async () => {
    setWeiter(true);
    const ok = await speicher.alleSpeichern();
    setWeiter(false);
    if (!ok) return;
    window.scrollTo(0, 0);
    setZusammenfassung(true);
  };

  const verwerfenMutation = useMutation({
    mutationFn: async () => {
      speicher.verwerfen();
      await pruefen(await api.inventuren[':id'].$delete({ param: { id } }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['inventuren'] });
      navigate('/lager');
    },
    onError: (e) => {
      setVerwerfen(false);
      fehlerAnzeigen(e);
    },
  });

  if (daten.isError)
    return (
      <Alert m="md" color="red">
        {fehlerText(daten.error, 'Die Inventur konnte nicht geladen werden.')}
      </Alert>
    );
  if (!daten.data || zustaende === null) return <Loader m="md" aria-label="Lädt" />;
  const inventur = daten.data;

  if (inventur.status !== 'offen')
    return (
      <Stack>
        <Alert color="blue" title="Inventur abgeschlossen">
          Diese Inventur ist abgeschlossen und kann nicht mehr bearbeitet werden.
        </Alert>
        <Anchor component={Link} to="/lager">
          Zurück zu den Lagerorten
        </Anchor>
      </Stack>
    );

  return (
    <Stack gap={0} mih="calc(100dvh - 60px)">
      {zusammenfassung ? (
        <InventurZusammenfassung
          inventurId={id}
          knotenIds={knoten.map((k) => k.lagerortId)}
          onZurueck={() => setZusammenfassung(false)}
        />
      ) : (
        <>
          <Stack gap={2} pb="xs">
            <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
              <Text fw={700} size="lg" style={{ overflowWrap: 'anywhere' }}>
                Inventur: {inventur.lagerortPfad}
              </Text>
              <AktionsMenue label="Inventur-Aktionen" aktionen={verwerfenAktion(setVerwerfen)} />
            </Group>
            <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
              <Text size="sm" c="dimmed">
                Leere Felder übernehmen den erwarteten Bestand (grau).
              </Text>
              <Text
                size="xs"
                c={speicher.status === 'fehler' ? 'red' : 'dimmed'}
                role="status"
                ta="right"
                style={{ flex: 'none' }}
              >
                {STATUS_TEXT[speicher.status]}
              </Text>
            </Group>
          </Stack>
          <Box
            style={{ flex: 1, border: '1px solid var(--mantine-color-default-border)' }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              const ziel = e.target as HTMLElement;
              if (!ziel.matches('input[data-inventur]')) return;
              e.preventDefault();
              const alle = [
                ...e.currentTarget.querySelectorAll<HTMLElement>('input[data-inventur]'),
              ];
              const naechstes = alle[alle.indexOf(ziel) + 1];
              if (naechstes) naechstes.focus();
              else document.getElementById('inventur-weiter')?.focus();
            }}
          >
            {knoten.map((k) => {
              const z = zustaende[k.lagerortId];
              return z ? (
                <InventurAbschnitt
                  key={k.lagerortId}
                  knoten={k}
                  zustand={z}
                  waren={waren}
                  katalog={katalog}
                  gebinde={gebinde}
                  onChange={(f) => aendern(k.lagerortId, f)}
                  onBlur={() => speicher.beiBlur(k.lagerortId)}
                />
              ) : null;
            })}
          </Box>
          <InventurLeiste>
            <Button
              id="inventur-weiter"
              size="md"
              mih={48}
              loading={weiter}
              onClick={() => void zurZusammenfassung()}
            >
              Zur Zusammenfassung
            </Button>
          </InventurLeiste>
        </>
      )}

      <Modal opened={verwerfen} onClose={() => setVerwerfen(false)} title="Inventur verwerfen?">
        <Stack>
          <Text>
            Alle bisher gezählten Werte dieser Inventur gehen verloren. Der Bestand ändert sich
            nicht.
          </Text>
          <Group justify="flex-end" grow preventGrowOverflow={false}>
            <Button variant="default" onClick={() => setVerwerfen(false)}>
              Abbrechen
            </Button>
            <Button
              color="red"
              loading={verwerfenMutation.isPending}
              onClick={() => verwerfenMutation.mutate()}
            >
              Verwerfen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

const verwerfenAktion = (setVerwerfen: (v: boolean) => void) => [
  {
    text: 'Inventur verwerfen',
    icon: <IconTrash size={18} />,
    color: 'red',
    onClick: () => setVerwerfen(true),
  },
];
