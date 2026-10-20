import {
  Alert,
  Anchor,
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
import { IconArrowBackUp, IconChevronLeft, IconEdit, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { platzText, rueckgabeSchema } from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { useApi } from '../api';
import { AusleiheBearbeitenModal } from '../AusleiheBearbeitenModal';
import { AusleiheStatus, RueckgabeGeplant } from '../AusleiheKarte';
import { useAuth } from '../auth';
import { zeitpunktIso } from '../BuchungsFuss';
import { offenePositionen } from '../inventarAnzeige';
import { INVENTAR_KEY, useAusleihe, useInventar } from '../inventarDaten';
import { jetztLokal } from '../inventurDaten';
import { LoeschenDialog } from '../LoeschenDialog';
import { fehlerText, pruefen } from '../warenApi';
import { zeitAnzeigen } from '../warenAnzeige';

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

  const zurueck = (
    <Anchor component={Link} to="/inventar?ansicht=verliehen" size="sm">
      <Group gap={4} wrap="nowrap">
        <IconChevronLeft size={16} />
        Alle Ausleihen
      </Group>
    </Anchor>
  );

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

  const sortiert = [...ausleihe.positionen].sort(
    (a, b) =>
      Number(a.zurueckAm !== null) - Number(b.zurueckAm !== null) ||
      (inv.gegenstaende.find((g) => g.id === a.gegenstandId)?.name ?? '').localeCompare(
        inv.gegenstaende.find((g) => g.id === b.gegenstandId)?.name ?? '',
        'de',
      ),
  );
  const offen = offenePositionen(ausleihe);
  const alleGewaehlt = offen.length > 0 && offen.every((p) => gewaehlt.has(p.id));
  const umschalten = (positionId: string) =>
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(positionId)) neu.add(positionId);
      return neu;
    });

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
            Verliehen an {ausleihe.an}
          </Title>
          <Group gap="xs">
            <AusleiheStatus a={ausleihe} />
          </Group>
          <Text size="sm">Seit {zeitAnzeigen(ausleihe.ausgeliehenAm)}</Text>
          <RueckgabeGeplant a={ausleihe} />
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
              onClick: () => setBearbeiten(true),
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
        {darfUmraeumen && offen.length > 1 && (
          <Button
            variant="subtle"
            onClick={() => setGewaehlt(alleGewaehlt ? new Set() : new Set(offen.map((p) => p.id)))}
          >
            {alleGewaehlt ? 'Keine auswählen' : 'Alle auswählen'}
          </Button>
        )}
      </Group>
      <Stack gap="xs">
        {sortiert.map((p) => {
          const g = inv.gegenstaende.find((x) => x.id === p.gegenstandId);
          const name = g?.name ?? 'Unbekannt';
          const herkunft = platzText(inv.lagerorte, inv.ifcos, p);
          const inhalt = (
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                {p.anzahl}× {name}
              </Text>
              <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                aus {herkunft}
              </Text>
              {p.zurueckAm && (
                <Text size="sm" c="green">
                  Zurück am {zeitAnzeigen(p.zurueckAm)}
                </Text>
              )}
            </Stack>
          );
          return (
            <Paper key={p.id} withBorder p="sm" opacity={p.zurueckAm ? 0.7 : 1}>
              {p.zurueckAm || !darfUmraeumen ? (
                <Group justify="space-between" wrap="nowrap" gap="xs" mih={44}>
                  {inhalt}
                  {g && (
                    <Anchor
                      component={Link}
                      to={`/inventar/gegenstaende/${encodeURIComponent(g.id)}`}
                      size="sm"
                      style={{ flex: 'none' }}
                    >
                      Gegenstand
                    </Anchor>
                  )}
                </Group>
              ) : (
                <Checkbox
                  checked={gewaehlt.has(p.id)}
                  onChange={() => umschalten(p.id)}
                  label={inhalt}
                  styles={{
                    root: { minHeight: 44, display: 'flex', alignItems: 'center' },
                    body: { alignItems: 'center', width: '100%' },
                    labelWrapper: { minWidth: 0, flex: 1 },
                  }}
                />
              )}
            </Paper>
          );
        })}
      </Stack>

      {darfUmraeumen && offen.length > 0 && (
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
