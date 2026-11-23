import { Alert, Badge, Group, Loader, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { baumBauen, type BaumEintrag, type WarengruppeKategorieDto } from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import {
  finanzenKeys,
  jsonOderFehler,
  kontoOptionen,
  useKonten,
  useWarengruppenKategorien,
} from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/**
 * Warengruppen as a tree, each with the Kategorie (Aufwandskonto) that Ware items of the group
 * suggest. Subgroups inherit the nearest assignment above them; the inherited one is shown grey.
 */
export function FinanzenWarengruppenKategorienPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const darf = can('finanzen:buchen');
  const gruppen = useWarengruppenKategorien();
  const konten = useKonten(false);
  const aufwand = (konten.data ?? []).filter((k) => k.art === 'aufwand' && !k.archiviert);
  const name = (id: string | null) => (konten.data ?? []).find((k) => k.id === id)?.name ?? '';

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (a: { id: string; kategorieId: string | null }) =>
      jsonOderFehler(
        await api.finanzen.warengruppen[':id'].kategorie.$put({
          param: { id: a.id },
          json: { kategorieId: a.kategorieId },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: finanzenKeys.warengruppenKategorien }),
  });

  const baum = baumBauen((gruppen.data ?? []).filter((g) => !g.archiviert));

  const zeile = (e: BaumEintrag<WarengruppeKategorieDto>, tiefe: number): React.ReactNode => {
    const g = e.node;
    const geerbt = g.kategorieId === null && g.wirksamKategorieId !== null;
    return (
      <Stack key={g.id} gap="xs">
        <Paper withBorder p="sm" ml={{ base: Math.min(tiefe, 3) * 12, sm: tiefe * 24 }}>
          <Group justify="space-between" align="flex-end" wrap="wrap" gap="xs">
            <Text fw={600} style={{ overflowWrap: 'anywhere', flex: '1 1 160px' }}>
              {g.name}
            </Text>
            <Stack gap={2} style={{ flex: '1 1 240px' }}>
              <Select
                aria-label={`Kategorie für ${g.name}`}
                placeholder={
                  geerbt ? `Geerbt: ${name(g.wirksamKategorieId)}` : 'Keine Kategorie zugeordnet'
                }
                clearable
                searchable
                disabled={!darf || speichern.isPending}
                data={kontoOptionen(aufwand)}
                value={g.kategorieId}
                onChange={(v) => speichern.mutate({ id: g.id, kategorieId: v })}
                nothingFoundMessage="Keine Kategorie gefunden"
                styles={geerbt ? { input: { color: 'var(--mantine-color-dimmed)' } } : undefined}
              />
              {geerbt && (
                <Badge variant="light" color="gray" style={{ alignSelf: 'flex-start' }}>
                  geerbt
                </Badge>
              )}
            </Stack>
          </Group>
        </Paper>
        {e.kinder.map((k) => zeile(k, tiefe + 1))}
      </Stack>
    );
  };

  return (
    <Stack maw={900}>
      <ZurueckLink to="/finanzen/belege">Belege</ZurueckLink>
      <Group gap={2}>
        <Title order={2}>Warengruppen und Kategorien</Title>
        <InfoHinweis feld="Warengruppe und Kategorie" text={HILFE.belege.warengruppeKategorie} />
      </Group>
      <Text size="sm" c="dimmed">
        Die Kategorie wird bei Ware-Posten eines Belegs vorgeschlagen. Untergruppen erben sie von
        der nächsten Obergruppe, bis sie eine eigene haben.
      </Text>
      {speichern.isError && (
        <Alert color="red">
          {fehlerText(speichern.error, 'Das Speichern ist fehlgeschlagen.')}
        </Alert>
      )}
      {gruppen.isPending && <Loader m="md" aria-label="Warengruppen werden geladen" />}
      {gruppen.isError && <Alert color="red">Die Warengruppen konnten nicht geladen werden.</Alert>}
      {gruppen.data && baum.length === 0 && <Text c="dimmed">Keine Warengruppen vorhanden.</Text>}
      {baum.map((e) => zeile(e, 0))}
    </Stack>
  );
}
