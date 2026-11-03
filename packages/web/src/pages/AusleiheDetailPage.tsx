import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconEdit, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { platzText, positionenGruppieren, rueckgabeSchema } from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { useApi } from '../api';
import { AusleiheBearbeitenModal } from '../AusleiheBearbeitenModal';
import {
  AusleiheStatus,
  GefaehrdetBadges,
  OrganisatorZeile,
  RueckgabeGeplant,
  startText,
} from '../AusleiheKarte';
import { useAuth } from '../auth';
import { zeitpunktIso } from '../BuchungsFuss';
import { ifcoGruppeTitel, mengeName, offenePositionen } from '../inventarAnzeige';
import {
  INVENTAR_KEY,
  useAusleihe,
  useInventar,
  type AusleihePositionEintrag,
} from '../inventarDaten';
import { teileGruppeTitel, teileGruppieren, type TeileEintrag } from '../inventarTeile';
import { jetztLokal } from '../inventurDaten';
import { LoeschenDialog } from '../LoeschenDialog';
import { fehlerText, pruefen } from '../warenApi';
import { zeitAnzeigen } from '../warenAnzeige';
import { ZurueckLink } from '../ZurueckLink';

/** A row that opens `to` on click or Enter; the optional checkbox (44px wide hit area) toggles without opening. */
function KlickZeile({
  to,
  checkbox,
  children,
}: Readonly<{
  to: string;
  checkbox?: { checked: boolean; indeterminate?: boolean; label: string; onChange: () => void };
  children: ReactNode;
}>) {
  const navigate = useNavigate();
  const oeffnen = () => navigate(to);
  return (
    <Group
      wrap="nowrap"
      gap="xs"
      mih={44}
      role="link"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
      onClick={oeffnen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          oeffnen();
        }
      }}
    >
      {checkbox && (
        <Box
          component="label"
          onClick={(e: MouseEvent) => e.stopPropagation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'stretch',
            flex: 'none',
            width: 44,
            minHeight: 44,
            cursor: 'pointer',
          }}
        >
          <Checkbox
            size="md"
            checked={checkbox.checked}
            indeterminate={checkbox.indeterminate}
            aria-label={checkbox.label}
            onChange={checkbox.onChange}
          />
        </Box>
      )}
      <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
        {children}
      </Stack>
    </Group>
  );
}

/** Detail of one Ausleihe: header, Positionen (return them, fully or partly), edit and delete. */
export function AusleiheDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const darfUmraeumen = useAuth().can('inventar:umraeumen');
  const inv = useInventar();
  const { ausleihe, laedt, fehler } = useAusleihe(id);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [zurueckAm, setZurueckAm] = useState(jetztLokal);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [rueckFehler, setRueckFehler] = useState<string | null>(null);

  const zurueckgeben = useMutation({
    mutationFn: async (json: ReturnType<typeof rueckgabeSchema.parse>) =>
      pruefen(await api.inventar.ausleihen[':id'].rueckgabe.$post({ param: { id }, json })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      setGewaehlt(new Set());
      setRueckFehler(null);
      notifications.show({ color: 'green', message: 'Die Rückgabe wurde gebucht.' });
    },
    onError: (e) => setRueckFehler(fehlerText(e, 'Zurückgeben fehlgeschlagen.')),
  });

  const zurueck = <ZurueckLink to="/inventar?ansicht=verliehen">Alle Ausleihen</ZurueckLink>;

  if (laedt || inv.laedt) return <Loader m="md" aria-label="Ausleihe wird geladen" />;
  if (fehler || inv.fehler || !ausleihe)
    return (
      <Stack>
        {zurueck}
        <Alert color="red">
          {fehler || inv.fehler
            ? 'Die Ausleihe konnte nicht geladen werden.'
            : 'Die Ausleihe wurde nicht gefunden.'}
        </Alert>
      </Stack>
    );

  const gName = (gegenstandId: string) =>
    inv.gegenstaende.find((g) => g.id === gegenstandId)?.name ?? '';
  const nachName = (a: AusleihePositionEintrag, b: AusleihePositionEintrag) =>
    Number(a.zurueckAm !== null) - Number(b.zurueckAm !== null) ||
    gName(a.gegenstandId).localeCompare(gName(b.gegenstandId), 'de');
  const eintraege = teileGruppieren(positionenGruppieren(ausleihe.positionen), inv.gegenstaende)
    .map((e) => (e.art === 'einzeln' ? e : { ...e, positionen: [...e.positionen].sort(nachName) }))
    .sort((a, b) => {
      const erste = (e: TeileEintrag<AusleihePositionEintrag>) =>
        e.art === 'einzeln' ? e.position : e.positionen[0]!;
      const schluessel = (e: TeileEintrag<AusleihePositionEintrag>) =>
        e.art === 'einzeln'
          ? gName(e.position.gegenstandId)
          : e.art === 'teile'
            ? gName(e.elternId)
            : (inv.ifcos.find((i) => i.id === e.ifcoId)?.name ?? '');
      const offenRang = (e: TeileEintrag<AusleihePositionEintrag>) =>
        e.art === 'einzeln'
          ? Number(e.position.zurueckAm !== null)
          : Number(e.positionen.every((p) => p.zurueckAm !== null));
      return (
        offenRang(a) - offenRang(b) ||
        schluessel(a).localeCompare(schluessel(b), 'de') ||
        nachName(erste(a), erste(b))
      );
    });
  const offen = offenePositionen(ausleihe);
  // A vorgemerkt Ausleihe has not started yet: no Rückgabe, only edit or delete.
  const darfZurueck = darfUmraeumen && ausleihe.status !== 'geplant';
  const alleGewaehlt = offen.length > 0 && offen.every((p) => gewaehlt.has(p.id));
  const umschalten = (positionId: string) =>
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(positionId)) neu.add(positionId);
      return neu;
    });
  /** Selects all open positions of a whole-IFCO group, or clears them when all are selected. */
  const gruppeUmschalten = (ids: string[]) =>
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (ids.every((id) => neu.has(id))) for (const id of ids) neu.delete(id);
      else for (const id of ids) neu.add(id);
      return neu;
    });

  const positionsZeile = (p: AusleihePositionEintrag, mitHerkunft: boolean) => {
    const g = inv.gegenstaende.find((x) => x.id === p.gegenstandId);
    return (
      <KlickZeile
        key={p.id}
        to={`/inventar/gegenstaende/${encodeURIComponent(p.gegenstandId)}`}
        checkbox={
          p.zurueckAm || !darfZurueck
            ? undefined
            : {
                checked: gewaehlt.has(p.id),
                label: `${g?.name ?? 'Position'} zurückgeben`,
                onChange: () => umschalten(p.id),
              }
        }
      >
        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
          {mengeName(p.anzahl, g?.name ?? 'Unbekannt')}
        </Text>
        {mitHerkunft && (
          <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            aus {platzText(inv.lagerorte, inv.ifcos, p)}
          </Text>
        )}
        {p.zurueckAm && (
          <Text size="sm" c="green">
            Zurück am {zeitAnzeigen(p.zurueckAm)}
          </Text>
        )}
      </KlickZeile>
    );
  };

  const onZurueckgeben = () => {
    const iso = zeitpunktIso(zurueckAm);
    if (!iso) return setRueckFehler('Ungültiger Zeitpunkt.');
    const geprueft = rueckgabeSchema.safeParse({ positionIds: [...gewaehlt], zurueckAm: iso });
    if (!geprueft.success)
      return setRueckFehler(geprueft.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    setRueckFehler(null);
    zurueckgeben.mutate(geprueft.data);
  };

  return (
    <Stack maw={900}>
      {zurueck}
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap={4}>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Title order={2} style={{ overflowWrap: 'anywhere' }}>
            {ausleihe.status === 'geplant' ? 'Vorgemerkt für' : 'Verliehen an'} {ausleihe.an}
          </Title>
          <Group gap="xs">
            <AusleiheStatus a={ausleihe} />
          </Group>
          <Text size="sm">{startText(ausleihe)}</Text>
          <OrganisatorZeile a={ausleihe} verlinkt />
          <RueckgabeGeplant a={ausleihe} />
          <GefaehrdetBadges a={ausleihe} />
          {ausleihe.kommentar && (
            <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              {ausleihe.kommentar}
            </Text>
          )}
        </Stack>
        <AktionsMenue
          label={`Aktionen für die Ausleihe an ${ausleihe.an}`}
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconEdit size={18} />,
              onClick: () =>
                ausleihe.erledigt
                  ? setBearbeiten(true)
                  : navigate(`/inventar/ausleihen/${encodeURIComponent(id)}/bearbeiten`),
              sichtbar: darfUmraeumen,
            },
            {
              text: 'Löschen',
              icon: <IconTrash size={18} />,
              color: 'red',
              onClick: () => setLoeschen(true),
              sichtbar: darfUmraeumen,
              trenner: true,
            },
          ]}
        />
      </Group>

      <Group justify="space-between" wrap="wrap">
        <Title order={3}>Positionen</Title>
        {darfZurueck && offen.length > 1 && (
          <Button
            variant="subtle"
            onClick={() => setGewaehlt(alleGewaehlt ? new Set() : new Set(offen.map((p) => p.id)))}
          >
            {alleGewaehlt ? 'Keine auswählen' : 'Alle auswählen'}
          </Button>
        )}
      </Group>
      <Stack gap="xs">
        {eintraege.map((e) => {
          if (e.art === 'einzeln') {
            return (
              <Paper key={e.position.id} withBorder p="xs" opacity={e.position.zurueckAm ? 0.7 : 1}>
                {positionsZeile(e.position, true)}
              </Paper>
            );
          }
          const istTeile = e.art === 'teile';
          const gruppeKey = istTeile ? `t-${e.elternId}` : `i-${e.ifcoId}`;
          const gruppeTitel = istTeile
            ? teileGruppeTitel(gName(e.elternId) || 'Unbekannt', e.saetze)
            : ifcoGruppeTitel(e.ifcoId, inv.ifcos);
          const offeneIds = e.positionen.filter((p) => p.zurueckAm === null).map((p) => p.id);
          const gewaehlteAnzahl = offeneIds.filter((id) => gewaehlt.has(id)).length;
          return (
            <Paper key={gruppeKey} withBorder p="xs" opacity={offeneIds.length === 0 ? 0.7 : 1}>
              <Stack gap={0}>
                <KlickZeile
                  to={
                    istTeile
                      ? `/inventar/gegenstaende/${encodeURIComponent(e.elternId)}`
                      : `/inventar/ifcos/${encodeURIComponent(e.ifcoId)}`
                  }
                  checkbox={
                    darfZurueck && offeneIds.length > 0
                      ? {
                          checked: gewaehlteAnzahl === offeneIds.length,
                          indeterminate: gewaehlteAnzahl > 0 && gewaehlteAnzahl < offeneIds.length,
                          label: `${gruppeTitel} zurückgeben`,
                          onChange: () => gruppeUmschalten(offeneIds),
                        }
                      : undefined
                  }
                >
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {gruppeTitel}
                  </Text>
                </KlickZeile>
                <Stack
                  gap={0}
                  ml={22}
                  pl="xs"
                  style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
                >
                  {e.positionen.map((p) => (
                    <Box key={p.id} opacity={p.zurueckAm ? 0.7 : 1}>
                      {positionsZeile(p, istTeile)}
                    </Box>
                  ))}
                </Stack>
              </Stack>
            </Paper>
          );
        })}
      </Stack>

      {darfUmraeumen && ausleihe.status === 'geplant' && (
        <Text size="sm" c="dimmed">
          Die Ausleihe beginnt erst am {zeitAnzeigen(ausleihe.ausgeliehenAm)}. Bis dahin sind die
          Teile vorgemerkt und lassen sich nicht zurückgeben. Du kannst die Ausleihe bearbeiten oder
          löschen.
        </Text>
      )}
      {darfZurueck && offen.length > 0 && (
        <Paper withBorder p="sm">
          <Stack gap="sm">
            <TextInput
              label="Rückgabe am"
              type="datetime-local"
              value={zurueckAm}
              error={zeitpunktIso(zurueckAm) === null ? 'Ungültiger Zeitpunkt.' : undefined}
              styles={{ input: { minWidth: 0 } }}
              onChange={(e) => setZurueckAm(e.currentTarget.value)}
            />
            {rueckFehler && (
              <Alert color="red" role="alert">
                {rueckFehler}
              </Alert>
            )}
            <Button
              size="lg"
              mih={48}
              leftSection={<IconArrowBackUp size={20} />}
              disabled={gewaehlt.size === 0}
              loading={zurueckgeben.isPending}
              onClick={onZurueckgeben}
            >
              Zurückgeben{gewaehlt.size > 0 ? ` (${gewaehlt.size})` : ''}
            </Button>
          </Stack>
        </Paper>
      )}

      {bearbeiten && (
        <AusleiheBearbeitenModal ausleihe={ausleihe} onClose={() => setBearbeiten(false)} />
      )}
      {loeschen && (
        <LoeschenDialog
          titel="Ausleihe löschen"
          name={`Ausleihe an ${ausleihe.an}`}
          onClose={() => setLoeschen(false)}
          loeschen={async () => {
            await pruefen(await api.inventar.ausleihen[':id'].$delete({ param: { id } }));
            await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
            navigate('/inventar?ansicht=verliehen');
          }}
          archivieren={async () => {}}
        />
      )}
    </Stack>
  );
}
