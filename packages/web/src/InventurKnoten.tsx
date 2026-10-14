import {
  ActionIcon,
  Alert,
  Badge,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  Title,
  type ComboboxItem,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { Gebinde } from '@c4/shared';
import { InventurWareZeilen } from './InventurWareZeilen';
import {
  gebindeVonWare,
  knotenWaren,
  neueGruppe,
  type KnotenDaten,
  type KnotenEntwurf,
  type MhdGruppe,
  type WareInfo,
} from './inventurDaten';

/** One step of the inventory: all wares of a node with their count inputs. */
export function InventurKnoten({
  knoten,
  entwurf,
  waren,
  katalog,
  gebinde,
  onChange,
}: Readonly<{
  knoten: KnotenDaten;
  entwurf: KnotenEntwurf;
  waren: Map<string, WareInfo>;
  /** All Wares that may be added ad hoc. */
  katalog: WareInfo[];
  gebinde: Gebinde[];
  onChange: (aendern: (alt: KnotenEntwurf) => KnotenEntwurf) => void;
}>) {
  const [suche, setSuche] = useState('');
  const { liste, weitere } = useMemo(() => knotenWaren(knoten, waren), [knoten, waren]);
  const gezeigt = new Set([...liste, ...weitere, ...entwurf.extra]);
  const auswahl = useMemo(
    () =>
      katalog
        .filter((w) => !w.archiviert && !gezeigt.has(w.id))
        .map((w) => ({ value: w.id, label: w.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [katalog, knoten, entwurf.extra],
  );

  const karte = (id: string, nichtInListe: boolean, zusaetzlich: boolean) => {
    const ware = waren.get(id);
    if (!ware) return null;
    return (
      <InventurWareZeilen
        key={id}
        ware={ware}
        gruppen={entwurf.gruppen[id] ?? [neueGruppe()]}
        gebinde={gebindeVonWare(ware, gebinde)}
        soll={knoten.soll.filter((s) => s.wareId === id)}
        onChange={(gruppen: MhdGruppe[]) =>
          onChange((alt) => ({ ...alt, gruppen: { ...alt.gruppen, [id]: gruppen } }))
        }
        kopf={
          <Stack gap={4} align="flex-end">
            {nichtInListe && (
              <Badge color="yellow" variant="light">
                nicht in der Liste
              </Badge>
            )}
            {zusaetzlich && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size={44}
                aria-label={`${ware.name} entfernen`}
                onClick={() =>
                  onChange((alt) => {
                    const rest = { ...alt.gruppen };
                    delete rest[id];
                    return {
                      gruppen: rest,
                      extra: alt.extra.filter((x) => x !== id),
                      inListe: alt.inListe.filter((x) => x !== id),
                    };
                  })
                }
              >
                <IconX size={18} />
              </ActionIcon>
            )}
          </Stack>
        }
      />
    );
  };

  return (
    <Stack gap="md">
      <Title order={3} style={{ overflowWrap: 'anywhere' }}>
        {knoten.pfad}
      </Title>
      <Alert color="blue" variant="light">
        Trage ein, was du tatsächlich findest. Leere Felder werden beim Speichern als 0 gewertet.
      </Alert>
      {liste.length === 0 && weitere.length === 0 && entwurf.extra.length === 0 && (
        <Text c="dimmed">
          Für diesen Platz ist keine Warenliste hinterlegt. Füge unten Waren hinzu.
        </Text>
      )}
      {liste.map((id) => karte(id, false, false))}
      {weitere.map((id) => karte(id, true, false))}
      {entwurf.extra.map((id) => (
        <Stack key={id} gap={4}>
          {karte(id, false, true)}
          <Checkbox
            size="md"
            label="Dauerhaft in die Liste dieses Platzes aufnehmen"
            checked={entwurf.inListe.includes(id)}
            onChange={(e) => {
              const an = e.currentTarget.checked;
              onChange((alt) => ({
                ...alt,
                inListe: an ? [...alt.inListe, id] : alt.inListe.filter((x) => x !== id),
              }));
            }}
          />
        </Stack>
      ))}
      <Group>
        <Select
          style={{ flex: 1 }}
          label="Weitere Ware zählen"
          placeholder="Name oder Alias suchen"
          searchable
          inputMode="text"
          nothingFoundMessage="Keine Ware gefunden"
          data={auswahl}
          value={null}
          searchValue={suche}
          onSearchChange={setSuche}
          onChange={(id) => {
            setSuche('');
            const ware = id ? waren.get(id) : undefined;
            if (!id || !ware) return;
            onChange((alt) => ({
              ...alt,
              extra: [...alt.extra, id],
              gruppen: { ...alt.gruppen, [id]: [neueGruppe()] },
            }));
          }}
          filter={({ options, search }) => {
            const q = search.trim().toLowerCase();
            return (options as ComboboxItem[]).filter(
              (o) =>
                q === '' ||
                o.label.toLowerCase().includes(q) ||
                (waren.get(o.value)?.aliase ?? []).some((a) => a.toLowerCase().includes(q)),
            );
          }}
        />
      </Group>
    </Stack>
  );
}
