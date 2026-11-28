import { Anchor, Paper, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
} from 'recharts';
import { centAnzeigen, mengeAnzeigen, type EinkaufWareDto } from '@c4/shared';
import { belegPfad } from '../finanzenDaten';

interface Punkt {
  zeit: number;
  datum: string;
  menge: number;
  preis: number;
  betragCent: number;
  belegId: string;
}

const datumKurz = (zeit: number) =>
  new Date(zeit).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const datumLang = (iso: string) => {
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
};
const euro = (euro: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(euro);

/** Bubble chart of the single purchases of a Ware: date, price per unit, bubble size = amount. */
export function EinkaufKaufDiagramm({
  ware,
  brutto,
}: Readonly<{ ware: EinkaufWareDto; brutto: boolean }>) {
  const daten: Punkt[] = ware.kaeufe
    .filter((k) => k.mengeMilli > 0)
    .map((k) => {
      const betragCent = brutto ? k.bruttoCent : k.nettoCent;
      return {
        zeit: new Date(`${k.datum}T12:00:00Z`).getTime(),
        datum: k.datum,
        menge: k.mengeMilli / 1000,
        preis: betragCent / 100 / (k.mengeMilli / 1000),
        betragCent,
        belegId: k.belegId,
      };
    });
  if (daten.length === 0) return <Text c="dimmed">Keine Käufe mit Menge.</Text>;
  return (
    <div>
      <Text size="xs" c="dimmed" mb={4}>
        Preis je {ware.einheitLabel} ({brutto ? 'brutto' : 'netto'}), Größe = Menge. Tippe/klicke
        auf einen Punkt für Details.
      </Text>
      <div style={{ height: 240, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="zeit"
              name="Datum"
              domain={['dataMin - 604800000', 'dataMax + 604800000']}
              tickFormatter={datumKurz}
              fontSize={12}
            />
            <YAxis
              type="number"
              dataKey="preis"
              name="Preis"
              tickFormatter={euro}
              width={72}
              fontSize={12}
              domain={[0, 'auto']}
            />
            <ZAxis type="number" dataKey="menge" range={[60, 600]} name="Menge" />
            <Tooltip
              trigger="click"
              wrapperStyle={{ pointerEvents: 'auto', zIndex: 10 }}
              allowEscapeViewBox={{ x: false, y: false }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Punkt | undefined) : undefined;
                if (!p) return null;
                return (
                  <Paper withBorder shadow="sm" p="xs">
                    <Text size="sm" fw={600}>
                      {datumLang(p.datum)}
                    </Text>
                    <Text size="sm">
                      Menge: {mengeAnzeigen(p.menge)} {ware.einheitLabel}
                    </Text>
                    <Text size="sm">
                      Preis je {ware.einheitLabel}: {euro(p.preis)}
                    </Text>
                    <Text size="sm">Betrag: {centAnzeigen(p.betragCent)}</Text>
                    <Anchor component={Link} to={belegPfad(p.belegId)} size="sm">
                      Beleg öffnen
                    </Anchor>
                  </Paper>
                );
              }}
            />
            <Scatter data={daten} fill="var(--mantine-color-blue-6)" fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
