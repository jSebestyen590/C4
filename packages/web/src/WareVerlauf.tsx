import { LineChart } from '@mantine/charts';
import { Alert, Loader, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { basisGebinde, bestandAnzeigen, type Gebinde } from '@c4/shared';
import { unwrap, useApi } from './api';
import { formatDatum, formatDatumZeit } from './datum';
import { warenKeys } from './warenDaten';

const FARBEN = ['indigo.6', 'teal.6', 'orange.6', 'grape.6', 'cyan.6', 'pink.6', 'lime.7', 'red.6'];

const zeitKurz = (zeit: string | number) => formatDatumZeit(zeit, 'jahrKurz');

const tagKurz = (ms: number) => formatDatum(ms, 'jahrKurz');

/** Stock over time: one step chart per Basisgebinde, total or per top-level Lager. */
export function WareVerlauf({ wareId, gebinde }: Readonly<{ wareId: string; gebinde: Gebinde[] }>) {
  const api = useApi();
  const [jetzt] = useState(() => Date.now());
  const [ansicht, setAnsicht] = useState<'gesamt' | 'lager'>('gesamt');
  const daten = useQuery({
    queryKey: warenKeys.verlauf(wareId),
    queryFn: async () => unwrap(await api.waren[':id'].verlauf.$get({ param: { id: wareId } })),
  });

  if (daten.isPending) return <Loader m="md" aria-label="Verlauf wird geladen" />;
  if (daten.isError)
    return <Alert color="red">Der Bestandsverlauf konnte nicht geladen werden.</Alert>;
  const { serien, zeilen, punkte, lager, gebinde: basen } = daten.data;
  if (zeilen.length === 0) return <Text c="dimmed">Noch keine Buchungen.</Text>;

  const lagerName = (id: string | null) => lager.find((l) => l.id === id)?.name ?? '?';
  const basisVon = (id: string) => {
    const g = gebinde.find((x) => x.id === id);
    return g ? basisGebinde(g) : id;
  };

  return (
    <Stack>
      <SegmentedControl
        fullWidth
        size="md"
        data={[
          { value: 'gesamt', label: 'Gesamt' },
          { value: 'lager', label: 'Je Lager' },
        ]}
        value={ansicht}
        onChange={(v) => setAnsicht(v as 'gesamt' | 'lager')}
      />
      {basen.map((basis) => {
        const reihen = serien.filter(
          (s) => s.basisGebindeId === basis.id && (ansicht === 'gesamt') === (s.lagerId === null),
        );
        const zeilenDaten = zeilen.map((z, i) => {
          const zeile: { x: number; i: number } & Record<string, number> = {
            x: new Date(z.zeitpunkt).getTime(),
            i,
          };
          reihen.forEach((s, k) => (zeile[`s${k}`] = z[s.key] as number));
          return zeile;
        });
        // Extend the last level as a flat line up to now (same breakdown as the last point).
        const letzte = zeilenDaten[zeilenDaten.length - 1]!;
        const daten = jetzt > letzte.x ? [...zeilenDaten, { ...letzte, x: jetzt }] : zeilenDaten;
        return (
          <Stack key={basis.id} gap="xs">
            {basen.length > 1 && <Title order={4}>{basis.bezeichnung}</Title>}
            <LineChart
              h={240}
              data={daten}
              dataKey="x"
              curveType="stepAfter"
              withLegend={reihen.length > 1}
              yAxisProps={{ width: 40, allowDecimals: false }}
              xAxisProps={{
                type: 'number',
                scale: 'time',
                domain: ['dataMin', 'dataMax'],
                minTickGap: 40,
                tickFormatter: (v: number) => tagKurz(v),
              }}
              series={reihen.map((s, k) => ({
                name: `s${k}`,
                label: s.lagerId === null ? basis.bezeichnung : lagerName(s.lagerId),
                color: FARBEN[k % FARBEN.length]!,
              }))}
              tooltipProps={{
                content: ({ payload, label }) => {
                  if (!payload?.length) return null;
                  const i = (payload[0]!.payload as { i: number }).i;
                  return (
                    <Paper withBorder shadow="sm" p="xs" maw={280}>
                      <Text fw={600} size="sm" mb={4}>
                        {zeitKurz(Number(label))}
                      </Text>
                      {payload.map((p) => {
                        const k = Number(String(p.name).slice(1));
                        const s = reihen[k]!;
                        const mengen = (punkte[i]?.mengen ?? []).filter(
                          (m) =>
                            basisVon(m.gebindeId) === basis.id &&
                            (s.lagerId === null || m.lagerId === s.lagerId),
                        );
                        return (
                          <Text key={String(p.name)} size="sm">
                            {s.lagerId !== null && `${lagerName(s.lagerId)}: `}
                            {String(p.value)} × {basis.bezeichnung} (
                            {bestandAnzeigen(mengen, gebinde)})
                          </Text>
                        );
                      })}
                    </Paper>
                  );
                },
              }}
            />
          </Stack>
        );
      })}
    </Stack>
  );
}
