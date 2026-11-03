import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconArchive,
  IconArchiveOff,
  IconEdit,
  IconMapPin,
  IconPlus,
  IconTruckDelivery,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { inventarAbweichung, pfad } from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { BewegungVerlauf } from '../BewegungVerlauf';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { GegenstandFormular } from '../GegenstandFormular';
import { GegenstandPlaetzeModal } from '../GegenstandPlaetzeModal';
import { AusleiheStatus, GefaehrdetBadges, ZeitraumKurz } from '../AusleiheKarte';
import {
  anzahlText,
  gegenstandAbweichung,
  platzZeilen,
  positionText,
  teilMengeText,
  verliehenText,
  vorgemerktText,
} from '../inventarAnzeige';
import { TeileStatusBadges } from '../TeileStatusBadges';
import { INVENTAR_KEY, useAusleihen, useInventar } from '../inventarDaten';
import { zeitAnzeigen } from '../warenAnzeige';
import { LoeschenDialog } from '../LoeschenDialog';
import { PlatzAusleihHinweise } from '../PlatzAusleihHinweise';
import { fehlerAnzeigen, pruefen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const gegenstandLink = (id: string) => `/inventar/gegenstaende/${encodeURIComponent(id)}`;

/** Detail of one Gegenstand: master data, target vs. assigned amount and the Plätze. */
export function GegenstandDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const darfVerwalten = can('inventar:verwalten');
  const darfUmraeumen = can('inventar:umraeumen');
  const inv = useInventar();
  const ausleihenDaten = useAusleihen(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [plaetze, setPlaetze] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [teilAnlegen, setTeilAnlegen] = useState(false);

  const archivieren = async (archiviert: boolean) => {
    await pruefen(
      await api.inventar.gegenstaende[':id'].archiv.$put({ param: { id }, json: { archiviert } }),
    );
    await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
  };
  const archivMutation = useMutation({
    mutationFn: archivieren,
    onError: (e) => fehlerAnzeigen(e),
  });

  const zurueck = <ZurueckLink to="/inventar">Zurück zum Inventar</ZurueckLink>;

  if (inv.laedt) return <Loader m="md" aria-label="Gegenstand wird geladen" />;
  const g = inv.gegenstaende.find((x) => x.id === id);
  if (inv.fehler || !g)
    return (
      <Stack>
        {zurueck}
        <Alert color="red">
          {inv.fehler
            ? 'Der Gegenstand konnte nicht geladen werden.'
            : 'Der Gegenstand wurde nicht gefunden.'}
        </Alert>
      </Stack>
    );
  const abweichung = gegenstandAbweichung(g);
  const zeilen = platzZeilen(g, inv.lagerorte, inv.ifcos);
  // A Gegenstand that exists once has one Platz: singular texts, no "1 von 1 zugeordnet".
  const einzeln = g.anzahl === 1;
  const summe = inventarAbweichung(g.anzahl, [...g.plaetze, ...g.verbaut]).summe;
  const eltern = g.teilVon ? inv.gegenstaende.find((x) => x.id === g.teilVon) : undefined;
  const alleTeile = inv.gegenstaende
    .filter((x) => x.teilVon === g.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const teile = alleTeile.filter((x) => !x.archiviert);
  const hatTeile = alleTeile.length > 0;
  // A parent can be lent when it (unless virtual) or one of its parts has a Platz.
  const verleihbar =
    (!g.virtuell && g.plaetze.length > 0) || teile.some((t) => t.plaetze.length > 0);
  // Ausleihen with a Position of this Gegenstand or of its parts; those still holding some of it come first.
  const ids = new Set([g.id, ...alleTeile.map((t) => t.id)]);
  const ausleihen = ausleihenDaten.ausleihen
    .map((a) => ({ a, eigene: a.positionen.filter((p) => ids.has(p.gegenstandId)) }))
    .filter((x) => x.eigene.length > 0)
    .map((x) => ({ ...x, offen: x.eigene.some((p) => p.zurueckAm === null) }))
    .sort((x, y) => Number(y.offen) - Number(x.offen));
  return (
    <Stack maw={900}>
      {eltern ? (
        <ZurueckLink to={gegenstandLink(eltern.id)}>Zurück zu {eltern.name}</ZurueckLink>
      ) : (
        zurueck
      )}
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap={4}>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Title order={2} style={{ overflowWrap: 'anywhere' }}>
            {g.name}
          </Title>
          <Text size="sm">{pfad(inv.kategorien, g.kategorieId)}</Text>
          {g.beschreibung && (
            <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              {g.beschreibung}
            </Text>
          )}
          {eltern && (
            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
              Teil von{' '}
              <Anchor
                component={Link}
                to={`/inventar/gegenstaende/${encodeURIComponent(eltern.id)}`}
                inherit
              >
                {eltern.name}
              </Anchor>
              {teilMengeText(eltern, g) && (
                <Text span c="dimmed" inherit>
                  {' · '}
                  {teilMengeText(eltern, g)}
                </Text>
              )}
            </Text>
          )}
          <Group gap="xs">
            {hatTeile ? (
              <TeileStatusBadges eltern={g} teile={teile} />
            ) : (
              <>
                {g.verliehen > 0 && (
                  <Badge variant="light" color="grape">
                    {verliehenText(g.verliehen, einzeln)}
                  </Badge>
                )}
                {g.vorgemerkt > 0 && (
                  <Badge variant="light" color="cyan">
                    {vorgemerktText(g.vorgemerkt, einzeln)}
                  </Badge>
                )}
              </>
            )}
            {abweichung && (
              <Badge variant="light" color="orange">
                {abweichung}
              </Badge>
            )}
            {g.archiviert && (
              <Badge color="gray" variant="light">
                Archiviert
              </Badge>
            )}
          </Group>
        </Stack>
        <AktionsMenue
          label={`Aktionen für ${g.name}`}
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconEdit size={18} />,
              onClick: () => setBearbeiten(true),
              sichtbar: darfVerwalten,
            },
            {
              text: g.archiviert ? 'Wiederherstellen' : 'Archivieren',
              icon: g.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
              onClick: () => archivMutation.mutate(!g.archiviert),
              sichtbar: darfVerwalten,
              trenner: true,
            },
            {
              text: 'Löschen',
              icon: <IconTrash size={18} />,
              color: 'red',
              onClick: () => setLoeschen(true),
              sichtbar: darfVerwalten,
            },
          ]}
        />
      </Group>

      {(hatTeile || g.virtuell) && (
        <>
          <Group justify="space-between" wrap="wrap">
            <Title order={3}>Teile</Title>
            {teile.length > 0 && (
              <Text size="sm" c="dimmed">
                {teile.length} {teile.length === 1 ? 'Teil' : 'Teile'}
              </Text>
            )}
          </Group>
          {alleTeile.length === 0 && <Text c="dimmed">Noch keine Teile angelegt.</Text>}
          <Stack gap="xs">
            {alleTeile.map((t) => {
              const mengen = teilMengeText(g, t);
              const abw = t.anzahl !== g.anzahl * (t.anzahlJe ?? 1);
              return (
                <Paper
                  key={t.id}
                  withBorder
                  p="sm"
                  opacity={t.archiviert ? 0.6 : 1}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    // Links inside the card act on their own.
                    if (!(e.target as HTMLElement).closest('a')) navigate(gegenstandLink(t.id));
                  }}
                >
                  <Stack gap={2}>
                    <Anchor
                      component={Link}
                      to={gegenstandLink(t.id)}
                      fw={600}
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {t.name}
                      {t.archiviert && ' (archiviert)'}
                    </Anchor>
                    {mengen && (
                      <Text size="sm" c={abw ? 'orange' : 'dimmed'}>
                        {mengen}
                      </Text>
                    )}
                    {platzZeilen(t, inv.lagerorte, inv.ifcos).map((z) => {
                      const platz = t.plaetze.find((p) => p.id === z.id)!;
                      const ifco = platz.ifcoId
                        ? inv.ifcos.find((i) => i.id === platz.ifcoId)
                        : undefined;
                      return (
                        <div key={z.id}>
                          <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                            {ifco ? (
                              <Anchor
                                component={Link}
                                to={`/inventar/ifcos/${encodeURIComponent(ifco.id)}`}
                                size="sm"
                                style={{ overflowWrap: 'anywhere', minWidth: 0 }}
                              >
                                {z.text}
                              </Anchor>
                            ) : (
                              <Text size="sm" style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                                {z.text}
                              </Text>
                            )}
                            {anzahlText(z.anzahl) && (
                              <Text size="sm" fw={600} style={{ flex: 'none' }}>
                                {anzahlText(z.anzahl)}
                              </Text>
                            )}
                          </Group>
                          <PlatzAusleihHinweise
                            ausleihen={ausleihenDaten.ausleihen}
                            gegenstandId={t.id}
                            ziel={platz}
                            einzeln={t.anzahl === 1}
                          />
                        </div>
                      );
                    })}
                    {t.plaetze.length === 0 && (
                      <Text size="sm" c="dimmed">
                        Kein Platz zugeordnet
                      </Text>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
          {darfVerwalten && !g.archiviert && (
            <Button
              size="lg"
              mih={48}
              variant="default"
              leftSection={<IconPlus size={20} />}
              onClick={() => setTeilAnlegen(true)}
            >
              Teil anlegen
            </Button>
          )}
        </>
      )}

      {g.virtuell ? (
        <Text size="sm" c="dimmed">
          Virtuell: besteht nur aus seinen Teilen.
        </Text>
      ) : (
        <>
          <Group justify="space-between" wrap="wrap">
            <Title order={3}>{einzeln ? 'Platz' : 'Plätze'}</Title>
            {!einzeln && (
              <Text size="sm" c={abweichung ? 'orange' : 'dimmed'}>
                {summe} von {g.anzahl} zugeordnet
              </Text>
            )}
          </Group>
          {zeilen.length === 0 && g.verbaut.length === 0 && (
            <Text c="dimmed">Noch kein Platz zugeordnet.</Text>
          )}
          <Stack gap="xs">
            {zeilen.map((z) => {
              const platz = g.plaetze.find((p) => p.id === z.id)!;
              const ifco = platz.ifcoId ? inv.ifcos.find((i) => i.id === platz.ifcoId) : undefined;
              return (
                <Paper key={z.id} withBorder p="sm">
                  <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                    {ifco ? (
                      <Anchor
                        component={Link}
                        to={`/inventar/ifcos/${encodeURIComponent(ifco.id)}`}
                        style={{ overflowWrap: 'anywhere', minWidth: 0 }}
                      >
                        {z.text}
                      </Anchor>
                    ) : (
                      <Text style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{z.text}</Text>
                    )}
                    {anzahlText(z.anzahl) && (
                      <Text fw={600} style={{ flex: 'none' }}>
                        {anzahlText(z.anzahl)}
                      </Text>
                    )}
                  </Group>
                  <PlatzAusleihHinweise
                    ausleihen={ausleihenDaten.ausleihen}
                    gegenstandId={g.id}
                    ziel={platz}
                    einzeln={einzeln}
                  />
                </Paper>
              );
            })}
            {g.verbaut.map((v) => (
              <Paper key={v.id} withBorder p="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="xs" c="dimmed">
                      Fest verbaut
                    </Text>
                    <Text style={{ overflowWrap: 'anywhere' }}>{v.ort}</Text>
                  </Stack>
                  {anzahlText(v.anzahl) && (
                    <Text fw={600} style={{ flex: 'none' }}>
                      {anzahlText(v.anzahl)}
                    </Text>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>
          {darfUmraeumen && (
            <Button
              size="lg"
              mih={48}
              leftSection={<IconMapPin size={20} />}
              disabled={g.archiviert}
              onClick={() => setPlaetze(true)}
            >
              {einzeln ? 'Platz ändern' : 'Plätze ändern'}
            </Button>
          )}
        </>
      )}
      {darfUmraeumen && !g.archiviert && (
        <Button
          component={Link}
          to={`/inventar/ausleihen/neu?gegenstand=${encodeURIComponent(g.id)}`}
          size="lg"
          mih={48}
          variant="light"
          leftSection={<IconTruckDelivery size={20} />}
          disabled={!verleihbar}
        >
          Verleihen
        </Button>
      )}

      <BewegungVerlauf
        gegenstand={g}
        darfVerwalten={darfVerwalten}
        lagerorte={inv.lagerorte}
        ifcos={inv.ifcos}
      />

      {ausleihen.length > 0 && (
        <>
          <Title order={3}>Ausleihen</Title>
          <Stack gap="xs">
            {ausleihen.map(({ a, eigene }) => (
              <Paper
                key={a.id}
                component={Link}
                to={`/inventar/ausleihen/${encodeURIComponent(a.id)}`}
                withBorder
                p="sm"
                opacity={a.erledigt ? 0.7 : 1}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <Stack gap={2}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                    <Text fw={600} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                      {a.an}
                    </Text>
                    <AusleiheStatus a={a} />
                  </Group>
                  <ZeitraumKurz a={a} />
                  <GefaehrdetBadges a={a} />
                  {eigene.map((p) => (
                    <Text
                      key={p.id}
                      size="sm"
                      c={p.zurueckAm ? 'dimmed' : undefined}
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {positionText(p, inv.gegenstaende, inv.lagerorte, inv.ifcos)}
                      {p.zurueckAm && ` (zurück am ${zeitAnzeigen(p.zurueckAm)})`}
                    </Text>
                  ))}
                </Stack>
              </Paper>
            ))}
          </Stack>
        </>
      )}

      {teilAnlegen && (
        <GegenstandFormular
          kategorien={inv.kategorien}
          lagerorte={inv.lagerorte}
          ifcos={inv.ifcos}
          teilVon={g.id}
          kategorieId={g.kategorieId}
          onClose={() => setTeilAnlegen(false)}
        />
      )}
      {bearbeiten && (
        <GegenstandFormular
          gegenstand={g}
          kategorien={inv.kategorien}
          onClose={() => setBearbeiten(false)}
        />
      )}
      {plaetze && (
        <GegenstandPlaetzeModal
          gegenstand={g}
          lagerorte={inv.lagerorte}
          ifcos={inv.ifcos}
          onClose={() => setPlaetze(false)}
        />
      )}
      {loeschen && (
        <LoeschenDialog
          titel="Gegenstand löschen"
          name={g.name}
          onClose={() => setLoeschen(false)}
          loeschen={async () => {
            await pruefen(await api.inventar.gegenstaende[':id'].$delete({ param: { id } }));
            await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
            // A deleted part leads back to its parent, anything else to the overview.
            navigate(g.teilVon ? gegenstandLink(g.teilVon) : '/inventar');
          }}
          archivieren={() => archivieren(true)}
        />
      )}
    </Stack>
  );
}
