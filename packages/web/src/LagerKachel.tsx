import { Badge, Button, Drawer, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconBox, IconClipboardCheck } from '@tabler/icons-react';
import { pfad } from '@c4/shared';
import { istBelegt, kachelInhalt, zaehler, type Belegung } from './lagerAnsicht';
import { lagerAktionen } from './lagerAktionen';
import { BestandListe, IfcoPlatzInfo, InventarListe } from './LagerInhalt';
import { ifcoPlatzMasse } from './ifcoPlatz';
import type { LagerKnoten, LagerKontext } from './LagerBaum';

/** Compact tile of a leaf node (Stellplatz): name and a counter of what lies there. */
export function LagerKachel({
  node,
  anzeigeName = node.name,
  belegung,
  offeneInventur,
  onClick,
}: Readonly<{
  node: LagerKnoten;
  /** Shortened label (without the prefix shown above the grid); defaults to the name. */
  anzeigeName?: string;
  belegung: Belegung;
  offeneInventur: boolean;
  onClick: () => void;
}>) {
  const belegt = istBelegt(node.id, belegung);
  const z = zaehler(node.id, belegung);
  const istIfcoPlatz = ifcoPlatzMasse(node) !== null;
  const inhalt = kachelInhalt(node.id, belegung, istIfcoPlatz);
  const beschreibung = [
    node.name,
    node.archiviert ? 'archiviert' : null,
    istIfcoPlatz ? 'IFCO-Lagerplatz' : null,
    inhalt.titel,
    z.waren > 0 ? `${z.waren} ${z.waren === 1 ? 'Ware' : 'Waren'}` : null,
    z.inventar > 0 ? `${z.inventar} Inventar` : null,
    belegt ? null : 'leer',
    offeneInventur ? 'Inventur offen' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <UnstyledButton
      onClick={onClick}
      title={node.name}
      aria-label={beschreibung}
      mih={42}
      p={6}
      pos="relative"
      opacity={node.archiviert ? 0.5 : 1}
      c={belegt ? undefined : 'dimmed'}
      bg={belegt ? 'var(--mantine-color-body)' : 'var(--mantine-color-default-hover)'}
      style={{
        border: `1px ${belegt ? 'solid' : 'dashed'} var(--mantine-color-default-border)`,
        borderRadius: 'var(--mantine-radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 2,
        minWidth: 0,
      }}
    >
      {istIfcoPlatz && (
        <IconBox
          size={14}
          aria-hidden
          style={{ position: 'absolute', top: 3, right: 3, color: 'var(--mantine-color-blue-6)' }}
        />
      )}
      {offeneInventur && (
        <IconClipboardCheck
          size={14}
          aria-hidden
          style={{ position: 'absolute', top: 3, right: 3, color: 'var(--mantine-color-blue-6)' }}
        />
      )}
      <Text
        size="xs"
        fw={600}
        lh={1.2}
        lineClamp={2}
        style={{ overflowWrap: 'break-word', hyphens: 'auto' }}
      >
        {anzeigeName}
      </Text>
      {inhalt.zeilen ? (
        <Stack gap={2} title={inhalt.titel ?? undefined} style={{ minWidth: 0 }}>
          {inhalt.zeilen.map((z) => (
            <Text key={z} size="xs" c="dimmed" lh={1.1} truncate>
              {z}
            </Text>
          ))}
        </Stack>
      ) : (
        <Group gap={4} wrap="nowrap" title={inhalt.titel ?? undefined}>
          <Text size="xs" c="dimmed" lh={1} truncate style={{ flex: 1, minWidth: 0 }}>
            {inhalt.text}
          </Text>
          {inhalt.zusatz && (
            <Text size="xs" c="dimmed" lh={1} style={{ flexShrink: 0 }}>
              {inhalt.zusatz}
            </Text>
          )}
        </Group>
      )}
    </UnstyledButton>
  );
}

/** Bottom drawer of a tile: content of the node and its actions as full-width buttons. */
export function LagerKachelDrawer({
  node,
  alle,
  ctx,
  onClose,
}: Readonly<{
  node: LagerKnoten | null;
  alle: LagerKnoten[];
  ctx: LagerKontext;
  onClose: () => void;
}>) {
  const bestand = node ? ctx.bestand?.get(node.id) : undefined;
  const inventar = node ? ctx.inventar?.get(node.id) : undefined;
  const aktionen = node
    ? lagerAktionen(node, ctx)
        .filter((a) => a.sichtbar !== false)
        .sort((a, b) => Number(!!b.primaer) - Number(!!a.primaer))
    : [];
  return (
    <Drawer
      opened={node !== null}
      onClose={onClose}
      position="bottom"
      size="auto"
      title={
        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
          {node ? pfad(alle, node.id) : ''}
        </Text>
      }
      styles={{
        content: {
          maxHeight: '85dvh',
          borderTopLeftRadius: 'var(--mantine-radius-lg)',
          borderTopRightRadius: 'var(--mantine-radius-lg)',
        },
        body: { paddingBottom: 'calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))' },
      }}
    >
      {node && (
        <Stack gap="xs">
          {node.archiviert && (
            <Group>
              <Badge color="gray" variant="light">
                Archiviert
              </Badge>
            </Group>
          )}
          {node.beschreibung && (
            <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
              {node.beschreibung}
            </Text>
          )}
          {ifcoPlatzMasse(node) && (
            <IfcoPlatzInfo
              lagerortId={node.id}
              masse={ifcoPlatzMasse(node)!}
              daten={ctx.ifcoDaten}
            />
          )}
          <Stack gap={0}>
            {bestand && <BestandListe zeilen={bestand} />}
            {inventar && <InventarListe inventar={inventar} />}
          </Stack>
          {!istBelegt(node.id, { bestand: ctx.bestand, inventar: ctx.inventar }) && (
            <Text size="sm" c="dimmed">
              Hier liegt nichts.
            </Text>
          )}
          {aktionen.map((a) => (
            <Button
              key={a.text}
              fullWidth
              mih={42}
              variant={a.color || a.primaer ? 'light' : 'default'}
              color={a.color}
              leftSection={a.icon}
              disabled={a.disabled}
              onClick={() => {
                onClose();
                a.onClick();
              }}
            >
              {a.text}
            </Button>
          ))}
        </Stack>
      )}
    </Drawer>
  );
}
