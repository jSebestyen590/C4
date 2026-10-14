import { Alert, Anchor, Button, Group, Loader, Modal, Progress, Stack, Text } from '@mantine/core';
import { IconListCheck, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Gebinde } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { AktionsMenue } from '../AktionsMenue';
import { InventurKnoten } from '../InventurKnoten';
import { InventurLeiste } from '../InventurLeiste';
import { InventurUebersicht } from '../InventurUebersicht';
import { InventurZusammenfassung } from '../InventurZusammenfassung';
import { knotenEntwurf, zaehlungenAus, type KnotenEntwurf, type WareInfo } from '../inventurDaten';
import { fehlerAnzeigen, fehlerText, pruefen } from '../warenApi';

/** Guided inventory: count node by node (draft saved on the server), then review and book. */
export function InventurPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [schritt, setSchritt] = useState<number | null>(null);
  const [entwuerfe, setEntwuerfe] = useState<Record<string, KnotenEntwurf>>({});
  const [uebersicht, setUebersicht] = useState(false);
  const [verwerfen, setVerwerfen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const daten = useQuery({
    queryKey: ['inventuren', id],
    queryFn: async () => unwrap(await api.inventuren[':id'].$get({ param: { id } })),
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
  const knotenIds = useMemo(() => knoten.map((k) => k.lagerortId), [knoten]);

  // Resume at the first node that has not been counted yet (once, when the draft arrives).
  const gestartet = useRef(false);
  useEffect(() => {
    if (!daten.data || gestartet.current) return;
    gestartet.current = true;
    const offen = daten.data.knoten.findIndex((k) => !k.erledigt);
    setSchritt(offen === -1 ? daten.data.knoten.length : offen);
  }, [daten.data]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [schritt]);

  const aktuell = schritt !== null && schritt < knoten.length ? knoten[schritt] : undefined;
  const entwurf = aktuell
    ? (entwuerfe[aktuell.lagerortId] ?? knotenEntwurf(aktuell, waren))
    : undefined;

  const speichern = useMutation({
    mutationFn: async ({ lagerortId, e }: { lagerortId: string; e: KnotenEntwurf }) => {
      const ergebnis = zaehlungenAus(e, waren);
      if ('fehler' in ergebnis) throw new Error(ergebnis.fehler);
      await pruefen(
        await api.inventuren[':id'].knoten[':lid'].$put({
          param: { id, lid: lagerortId },
          json: {
            zaehlungen: ergebnis.zaehlungen,
            inListeAufnehmen: e.inListe.filter((w) => e.extra.includes(w)),
          },
        }),
      );
    },
    onError: (e) => {
      // Our own validation message is German; API errors carry theirs.
      setFehler(e instanceof Error && e.name === 'Error' ? e.message : fehlerText(e));
    },
  });

  const weiter = () => {
    if (!aktuell || !entwurf || schritt === null) return;
    setFehler(null);
    speichern.mutate(
      { lagerortId: aktuell.lagerortId, e: entwurf },
      {
        onSuccess: async () => {
          setEntwuerfe((alt) => ({ ...alt, [aktuell.lagerortId]: entwurf }));
          await qc.invalidateQueries({ queryKey: ['inventuren', id], exact: true });
          setSchritt(schritt + 1);
        },
      },
    );
  };

  const verwerfenMutation = useMutation({
    mutationFn: async () => pruefen(await api.inventuren[':id'].$delete({ param: { id } })),
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
  if (!daten.data || schritt === null) return <Loader m="md" aria-label="Lädt" />;
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

  const erledigt = knoten.filter((k) => k.erledigt).length;
  const letzter = schritt === knoten.length - 1;

  return (
    <Stack gap={0} mih="calc(100dvh - 60px)">
      <Stack gap="xs" pb="sm">
        <Text fw={700} size="lg" style={{ overflowWrap: 'anywhere' }}>
          Inventur: {inventur.lagerortPfad}
        </Text>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="sm" c="dimmed">
            {aktuell
              ? `Platz ${schritt + 1} von ${knoten.length} · ${erledigt} gezählt`
              : `Zusammenfassung · ${erledigt} von ${knoten.length} Plätzen gezählt`}
          </Text>
          <Group gap={0} wrap="nowrap">
            <Button
              variant="subtle"
              size="md"
              mih={44}
              px="xs"
              leftSection={<IconListCheck size={20} />}
              onClick={() => setUebersicht(true)}
            >
              Übersicht
            </Button>
            <AktionsMenue
              label="Inventur-Aktionen"
              aktionen={[
                {
                  text: 'Inventur verwerfen',
                  icon: <IconTrash size={18} />,
                  color: 'red',
                  onClick: () => setVerwerfen(true),
                },
              ]}
            />
          </Group>
        </Group>
        <Progress value={(erledigt / Math.max(knoten.length, 1)) * 100} aria-label="Fortschritt" />
      </Stack>

      {aktuell && entwurf ? (
        <>
          <Stack pt="xs" style={{ flex: 1 }}>
            <InventurKnoten
              knoten={aktuell}
              entwurf={entwurf}
              waren={waren}
              katalog={katalog}
              gebinde={gebinde}
              onChange={(f) =>
                setEntwuerfe((alt) => ({
                  ...alt,
                  [aktuell.lagerortId]: f(alt[aktuell.lagerortId] ?? entwurf),
                }))
              }
            />
            {fehler && <Alert color="red">{fehler}</Alert>}
          </Stack>
          <InventurLeiste>
            <Button
              variant="default"
              size="md"
              mih={48}
              disabled={schritt === 0 || speichern.isPending}
              onClick={() => {
                setFehler(null);
                setEntwuerfe((alt) => ({ ...alt, [aktuell.lagerortId]: entwurf }));
                setSchritt(schritt - 1);
              }}
            >
              Zurück
            </Button>
            <Button size="md" mih={48} loading={speichern.isPending} onClick={weiter}>
              {letzter ? 'Zur Zusammenfassung' : 'Weiter'}
            </Button>
          </InventurLeiste>
        </>
      ) : (
        <InventurZusammenfassung
          inventurId={id}
          knotenIds={knotenIds}
          onSpringen={(lid) => setSchritt(Math.max(knotenIds.indexOf(lid), 0))}
          onZurueck={() => setSchritt(Math.max(knoten.length - 1, 0))}
        />
      )}

      {uebersicht && (
        <InventurUebersicht
          knoten={knoten}
          aktuell={schritt}
          onClose={() => setUebersicht(false)}
          onWaehlen={(i) => {
            setFehler(null);
            if (aktuell && entwurf)
              setEntwuerfe((alt) => ({ ...alt, [aktuell.lagerortId]: entwurf }));
            setSchritt(i);
            setUebersicht(false);
          }}
        />
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
