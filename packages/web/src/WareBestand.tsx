import { Group, Paper, Stack, Text } from '@mantine/core';
import { bestandAnzeigen, mhdAnzeigen, pfad, type BaumKnoten, type Gebinde } from '@c4/shared';
import type { WareEintrag } from './warenDaten';

/** Current stock of a Ware, grouped by Lagerort (stacked cards, no table). */
export function WareBestand({
  ware,
  lagerorte,
  gebinde,
}: Readonly<{ ware: WareEintrag; lagerorte: BaumKnoten[]; gebinde: Gebinde[] }>) {
  const gruppen = new Map<string, WareEintrag['bestand']>();
  for (const p of ware.bestand)
    gruppen.set(p.lagerortId, [...(gruppen.get(p.lagerortId) ?? []), p]);
  const name = (id: string) => gebinde.find((g) => g.id === id)?.name ?? '?';
  const liste = [...gruppen]
    .map(([id, posten]) => ({ id, pfad: pfad(lagerorte, id), posten }))
    .sort((a, b) => a.pfad.localeCompare(b.pfad, 'de'));
  const negativ = ware.bestand.some((b) => b.menge < 0);

  return (
    <Stack>
      {liste.length === 0 && <Text c="dimmed">Kein Bestand.</Text>}
      {liste.map((g) => (
        <Paper key={g.id} withBorder p="sm">
          <Stack gap={6}>
            <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
              {g.pfad}
            </Text>
            {g.posten
              .sort(
                (a, b) =>
                  name(a.gebindeId).localeCompare(name(b.gebindeId), 'de') ||
                  (a.mhd ?? '9').localeCompare(b.mhd ?? '9'),
              )
              .map((p) => {
                const mhd = mhdAnzeigen(p.mhd, ware.mhdArt);
                return (
                  <Group
                    key={`${p.gebindeId}|${p.mhd}`}
                    justify="space-between"
                    wrap="nowrap"
                    align="flex-start"
                    gap="sm"
                  >
                    <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                      {name(p.gebindeId)}
                      {mhd && ` · MHD ${mhd}`}
                    </Text>
                    <Text
                      size="sm"
                      fw={700}
                      c={p.menge < 0 ? 'red' : undefined}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {p.menge}
                    </Text>
                  </Group>
                );
              })}
          </Stack>
        </Paper>
      ))}
      {liste.length > 0 && (
        <Text fw={600} c={negativ ? 'red' : undefined}>
          Gesamt: {bestandAnzeigen(ware.bestand, gebinde)}
        </Text>
      )}
    </Stack>
  );
}
