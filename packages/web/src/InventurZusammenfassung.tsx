import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gebindeBezeichnung, mhdAnzeigen } from '@c4/shared';
import { unwrap, useApi } from './api';
import { InventurLeiste } from './InventurLeiste';
import { buchungsZeitpunktFehler } from './BuchungsFuss';
import { jetztLokal } from './inventurDaten';
import { fehlerAnzeigen, fehlerText, pruefen } from './warenApi';

/** Last step: differences per node and Ware, then the booking. */
export function InventurZusammenfassung({
  inventurId,
  knotenIds,
  onZurueck,
}: Readonly<{
  inventurId: string;
  /** Node ids in table order (for sorting). */
  knotenIds: string[];
  onZurueck: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [zeitpunkt, setZeitpunkt] = useState(jetztLokal);
  const [alle, setAlle] = useState(false);
  const [bestaetigen, setBestaetigen] = useState(false);
  const zeitFehler = buchungsZeitpunktFehler(zeitpunkt);
  const iso = zeitFehler ? null : new Date(zeitpunkt).toISOString();

  const daten = useQuery({
    queryKey: ['inventuren', inventurId, 'zusammenfassung', iso],
    enabled: iso !== null,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () =>
      unwrap(
        await api.inventuren[':id'].zusammenfassung.$get({
          param: { id: inventurId },
          query: { zeitpunkt: iso ?? '' },
        }),
      ),
  });

  const abschliessen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      pruefen(
        await api.inventuren[':id'].abschluss.$post({
          param: { id: inventurId },
          json: { zeitpunkt: iso ?? '' },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['waren'] }),
        qc.invalidateQueries({ queryKey: ['inventuren'] }),
      ]);
      notifications.show({ color: 'green', message: 'Die Inventur wurde abgeschlossen.' });
      navigate('/lager');
    },
    onError: (e) => {
      setBestaetigen(false);
      fehlerAnzeigen(e);
    },
  });

  const z = daten.data;
  const gruppen = useMemo(() => {
    if (!z) return [];
    const wareName = new Map(z.waren.map((w) => [w.id, w]));
    const gebindeName = new Map(z.gebinde.map((g) => [g.id, gebindeBezeichnung(g, z.gebinde)]));
    const nachKnoten = new Map<string, { pfad: string; waren: Map<string, string[]> }>();
    const sortiert = [...z.zeilen].sort(
      (a, b) =>
        knotenIds.indexOf(a.lagerortId) - knotenIds.indexOf(b.lagerortId) ||
        (wareName.get(a.wareId)?.name ?? '').localeCompare(
          wareName.get(b.wareId)?.name ?? '',
          'de',
        ),
    );
    for (const zeile of sortiert) {
      if (!alle && zeile.differenz === 0) continue;
      const k = nachKnoten.get(zeile.lagerortId) ?? { pfad: zeile.lagerortPfad, waren: new Map() };
      nachKnoten.set(zeile.lagerortId, k);
      const art = wareName.get(zeile.wareId)?.mhdArt ?? 'keins';
      const mhd = mhdAnzeigen(zeile.mhd, art);
      const diff = `${zeile.differenz > 0 ? '+' : zeile.differenz < 0 ? '−' : '±'}${Math.abs(zeile.differenz)}`;
      const text = `${mhd ? `MHD ${mhd} · ` : ''}${gebindeName.get(zeile.gebindeId) ?? '?'}: ${zeile.soll} → ${zeile.ist} (${diff})`;
      k.waren.set(zeile.wareId, [...(k.waren.get(zeile.wareId) ?? []), text]);
    }
    return [...nachKnoten].map(([id, k]) => ({
      id,
      pfad: k.pfad,
      waren: [...k.waren].map(([wareId, zeilen]) => ({
        wareId,
        name: wareName.get(wareId)?.name ?? '?',
        zeilen,
      })),
    }));
  }, [z, alle, knotenIds]);

  const aenderungen = z?.zeilen.filter((x) => x.differenz !== 0).length ?? 0;

  return (
    <>
      <Stack gap="md" style={{ flex: 1 }}>
        <Title order={3}>Zusammenfassung</Title>
        {daten.isError && (
          <Alert color="red">{fehlerText(daten.error, 'Laden fehlgeschlagen.')}</Alert>
        )}
        {daten.isPending && iso !== null && <Loader />}
        {z && (
          <>
            <Text size="sm" c="dimmed">
              Angezeigt wird: Soll → Ist (Differenz). Leere Felder zählen als korrekt.
            </Text>
            <Switch
              size="md"
              label="Alle Zeilen zeigen"
              checked={alle}
              onChange={(e) => setAlle(e.currentTarget.checked)}
            />
            {gruppen.length === 0 && <Text c="dimmed">Keine Abweichungen.</Text>}
            {gruppen.map((k) => (
              <Card key={k.id} withBorder padding="sm">
                <Stack gap="xs">
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {k.pfad}
                  </Text>
                  {k.waren.map((w) => (
                    <Stack key={w.wareId} gap={0}>
                      <Text fw={500}>{w.name}</Text>
                      {w.zeilen.map((t) => (
                        <Text key={t} size="sm" c="dimmed">
                          {t}
                        </Text>
                      ))}
                    </Stack>
                  ))}
                </Stack>
              </Card>
            ))}
            <TextInput
              label="Zeitpunkt der Buchung"
              type="datetime-local"
              value={zeitpunkt}
              max={jetztLokal()}
              error={zeitFehler}
              onChange={(e) => setZeitpunkt(e.currentTarget.value)}
            />
          </>
        )}
      </Stack>
      <InventurLeiste>
        <Button variant="default" size="md" mih={48} onClick={onZurueck}>
          Zurück
        </Button>
        <Button
          size="md"
          mih={48}
          disabled={!z || iso === null}
          onClick={() => setBestaetigen(true)}
        >
          Abschließen
        </Button>
      </InventurLeiste>
      <Modal
        opened={bestaetigen}
        onClose={() => setBestaetigen(false)}
        title="Inventur abschließen?"
      >
        <Stack>
          <Text>
            {aenderungen === 0
              ? 'Es gibt keine Abweichungen, daher werden keine Korrekturen gebucht.'
              : `Es werden ${aenderungen} Korrekturbuchungen angelegt.`}{' '}
            Der Bestand wird entsprechend korrigiert.
          </Text>
          <Group justify="flex-end" grow preventGrowOverflow={false}>
            <Button variant="default" onClick={() => setBestaetigen(false)}>
              Abbrechen
            </Button>
            <Button loading={abschliessen.isPending} onClick={() => abschliessen.mutate()}>
              Abschließen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
