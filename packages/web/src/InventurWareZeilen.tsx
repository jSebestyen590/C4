import { ActionIcon, Button, Card, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { bestandAnzeigen, type Gebinde } from '@c4/shared';
import { neueGruppe, type MhdGruppe, type Soll, type WareInfo } from './inventurDaten';
import { ZahlenFeld } from './ZahlenFeld';

/** Counting card of one Ware: per MHD (if the Ware has one) a block with one input per Gebinde. */
export function InventurWareZeilen({
  ware,
  gruppen,
  gebinde,
  soll,
  kopf,
  onChange,
}: Readonly<{
  ware: WareInfo;
  gruppen: MhdGruppe[];
  /** Gebinde of the Ware, Obergebinde first. */
  gebinde: Gebinde[];
  /** Soll of this Ware on the node. */
  soll: Soll[];
  /** Badge / actions shown next to the name. */
  kopf?: ReactNode;
  onChange: (gruppen: MhdGruppe[]) => void;
}>) {
  const mitMhd = ware.mhdArt !== 'keins';
  const aendern = (key: string, teil: Partial<MhdGruppe>) =>
    onChange(gruppen.map((g) => (g.key === key ? { ...g, ...teil } : g)));
  const hinweis = (mhd: string) => {
    const eigene = soll.filter((s) => (mitMhd ? (s.mhd ?? '').slice(0, mhd.length) === mhd : true));
    return eigene.length === 0 || (mitMhd && mhd === '')
      ? null
      : `Laut Bestand: ${bestandAnzeigen(eigene, gebinde)}`;
  };

  return (
    <Card withBorder padding="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
              {ware.name}
            </Text>
            {ware.aliase.length > 0 && (
              <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                {ware.aliase.join(', ')}
              </Text>
            )}
          </Stack>
          {kopf}
        </Group>
        {gruppen.map((g) => {
          const text = hinweis(g.mhd);
          return (
            <Paper key={g.key} withBorder={mitMhd} p={mitMhd ? 'xs' : 0}>
              <Stack gap="xs">
                {mitMhd && (
                  <Group gap="xs" wrap="nowrap" align="flex-end">
                    <TextInput
                      style={{ flex: 1 }}
                      label={ware.mhdArt === 'monat' ? 'MHD (Monat)' : 'MHD'}
                      type={ware.mhdArt === 'monat' ? 'month' : 'date'}
                      value={g.mhd}
                      onChange={(e) => aendern(g.key, { mhd: e.currentTarget.value })}
                    />
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size={44}
                      aria-label="MHD entfernen"
                      disabled={gruppen.length === 1}
                      onClick={() => onChange(gruppen.filter((x) => x.key !== g.key))}
                    >
                      <IconTrash size={20} />
                    </ActionIcon>
                  </Group>
                )}
                {text && (
                  <Text size="sm" c="dimmed">
                    {text}
                  </Text>
                )}
                {gebinde.map((geb) => (
                  <ZahlenFeld
                    key={geb.id}
                    label={geb.name}
                    value={g.anzahl[geb.id] ?? ''}
                    onChange={(v) => aendern(g.key, { anzahl: { ...g.anzahl, [geb.id]: v } })}
                  />
                ))}
              </Stack>
            </Paper>
          );
        })}
        {mitMhd && (
          <Button
            variant="light"
            size="md"
            leftSection={<IconPlus size={18} />}
            onClick={() => onChange([...gruppen, neueGruppe()])}
          >
            MHD hinzufügen
          </Button>
        )}
      </Stack>
    </Card>
  );
}
