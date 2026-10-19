import { Anchor, Box, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import type { Gebinde } from '@c4/shared';
import { InventurWareDialog } from './InventurWareDialog';
import { InventurZeile } from './InventurZeile';
import {
  gebindeVonWare,
  neueZeile,
  sollLookup,
  type KnotenDaten,
  type KnotenZustand,
  type WareInfo,
} from './inventurDaten';

/** One section of the table: heading with the node path, one row per Ware and MHD, "+ Ware". */
export function InventurAbschnitt({
  knoten,
  zustand,
  waren,
  katalog,
  gebinde,
  onChange,
  onBlur,
}: Readonly<{
  knoten: KnotenDaten;
  zustand: KnotenZustand;
  waren: Map<string, WareInfo>;
  katalog: WareInfo[];
  gebinde: Gebinde[];
  onChange: (aendern: (alt: KnotenZustand) => KnotenZustand) => void;
  onBlur: () => void;
}>) {
  const [dialog, setDialog] = useState(false);
  const soll = useMemo(() => sollLookup(knoten.soll), [knoten.soll]);
  const { zeilen } = zustand;

  const zeileAendern = (
    key: string,
    teil: (z: (typeof zeilen)[number]) => (typeof zeilen)[number],
  ) =>
    onChange((alt) => ({ ...alt, zeilen: alt.zeilen.map((z) => (z.key === key ? teil(z) : z)) }));

  return (
    <section>
      <Box
        px="xs"
        py={6}
        bg="var(--mantine-color-default-hover)"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Text size="sm" fw={700} style={{ overflowWrap: 'anywhere' }}>
          {knoten.pfad}
        </Text>
      </Box>
      <Box px="xs">
        {zeilen.map((zeile, i) => {
          const ware = waren.get(zeile.wareId);
          if (!ware) return null;
          const erste = zeilen[i - 1]?.wareId !== zeile.wareId;
          const letzte = zeilen[i + 1]?.wareId !== zeile.wareId;
          const extra = zustand.extra.includes(ware.id);
          const aktionen: { text: string; onClick: () => void }[] = [];
          if (ware.mhdArt !== 'keins' && letzte)
            aktionen.push({
              text: '+ MHD',
              onClick: () =>
                onChange((alt) => ({
                  ...alt,
                  zeilen: [
                    ...alt.zeilen.slice(0, i + 1),
                    neueZeile(ware.id),
                    ...alt.zeilen.slice(i + 1),
                  ],
                })),
            });
          if (!zeile.fest && ware.mhdArt !== 'keins' && !erste)
            aktionen.push({
              text: 'Entfernen',
              onClick: () =>
                onChange((alt) => ({
                  ...alt,
                  zeilen: alt.zeilen.filter((z) => z.key !== zeile.key),
                })),
            });
          if (extra && erste)
            aktionen.push({
              text: 'Ware entfernen',
              onClick: () =>
                onChange((alt) => ({
                  zeilen: alt.zeilen.filter((z) => z.wareId !== ware.id),
                  extra: alt.extra.filter((x) => x !== ware.id),
                  inListe: alt.inListe.filter((x) => x !== ware.id),
                })),
            });
          return (
            <InventurZeile
              key={zeile.key}
              ware={ware}
              zeile={zeile}
              gebinde={gebindeVonWare(ware, gebinde)}
              alleGebinde={gebinde}
              soll={(gebindeId, mhd) => soll(ware.id, gebindeId, mhd)}
              aktionen={aktionen}
              onAnzahl={(gebindeId, wert) =>
                zeileAendern(zeile.key, (z) => ({
                  ...z,
                  anzahl: { ...z.anzahl, [gebindeId]: wert },
                }))
              }
              onMhd={(mhd) => zeileAendern(zeile.key, (z) => ({ ...z, mhd }))}
              onBlur={onBlur}
            />
          );
        })}
        {zeilen.length === 0 && (
          <Text size="sm" c="dimmed" py={6}>
            Keine Waren.
          </Text>
        )}
        <Anchor component="button" type="button" size="sm" py={10} onClick={() => setDialog(true)}>
          + Ware
        </Anchor>
      </Box>
      {dialog && (
        <InventurWareDialog
          katalog={katalog}
          vorhanden={new Set(zeilen.map((z) => z.wareId))}
          onClose={() => setDialog(false)}
          onHinzufuegen={(wareId, dauerhaft) => {
            const ware = waren.get(wareId);
            if (ware)
              onChange((alt) => ({
                zeilen: [...alt.zeilen, neueZeile(wareId)],
                extra: [...alt.extra, wareId],
                inListe: dauerhaft ? [...alt.inListe, wareId] : alt.inListe,
              }));
            setDialog(false);
          }}
        />
      )}
    </section>
  );
}
