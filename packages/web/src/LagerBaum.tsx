import { ActionIcon, Badge, Box, Button, Collapse, Group, Paper, Stack, Text } from '@mantine/core';
import {
  IconArchive,
  IconArchiveOff,
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconClipboardCheck,
  IconEdit,
  IconListDetails,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import type { BaumEintrag } from '@c4/shared';
import { AktionsMenue } from './AktionsMenue';

export interface LagerKnoten {
  id: string;
  parentId: string | null;
  name: string;
  beschreibung: string | null;
  position: number;
  archiviert: boolean;
}

/** Everything the tree needs from the page: permissions, state and the action callbacks. */
export interface LagerKontext {
  darfVerwalten: boolean;
  darfBuchen: boolean;
  /** Lagerort id -> id of its open Inventur. */
  offeneInventuren: Map<string, string>;
  eingeklappt: Set<string>;
  umschalten: (id: string) => void;
  unterebene: (k: LagerKnoten) => void;
  bearbeiten: (k: LagerKnoten) => void;
  verschieben: (k: LagerKnoten, richtung: -1 | 1) => void;
  waren: (k: LagerKnoten) => void;
  inventur: (k: LagerKnoten) => void;
  archivieren: (k: LagerKnoten) => void;
  loeschen: (k: LagerKnoten) => void;
}

function LagerZeile({
  eintrag,
  tiefe,
  index,
  anzahl,
  ctx,
}: Readonly<{
  eintrag: BaumEintrag<LagerKnoten>;
  tiefe: number;
  index: number;
  anzahl: number;
  ctx: LagerKontext;
}>) {
  const { node, kinder } = eintrag;
  const zu = ctx.eingeklappt.has(node.id);
  const inventurId = ctx.offeneInventuren.get(node.id);
  const inventurMoeglich = ctx.darfBuchen && !node.archiviert;
  const inventurText = inventurId ? 'Inventur fortsetzen' : 'Inventur starten';
  return (
    <Stack gap="xs">
      <Paper withBorder p={4} opacity={node.archiviert ? 0.6 : 1}>
        <Group gap={4} wrap="nowrap" align="flex-start">
          {kinder.length > 0 ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size={44}
              aria-label={zu ? `${node.name} aufklappen` : `${node.name} zuklappen`}
              aria-expanded={!zu}
              onClick={() => ctx.umschalten(node.id)}
            >
              {zu ? <IconChevronRight size={20} /> : <IconChevronDown size={20} />}
            </ActionIcon>
          ) : (
            <Box w={44} h={44} style={{ flexShrink: 0 }} />
          )}
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }} py={10}>
            <Group gap="xs">
              <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                {node.name}
              </Text>
              {node.archiviert && (
                <Badge color="gray" variant="light">
                  Archiviert
                </Badge>
              )}
            </Group>
            {node.beschreibung && (
              <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                {node.beschreibung}
              </Text>
            )}
          </Stack>
          <AktionsMenue
            label={`Aktionen für ${node.name}`}
            aktionen={[
              {
                text: 'Unterebene anlegen',
                icon: <IconPlus size={18} />,
                onClick: () => ctx.unterebene(node),
                sichtbar: ctx.darfVerwalten && !node.archiviert,
              },
              {
                text: 'Bearbeiten',
                icon: <IconEdit size={18} />,
                onClick: () => ctx.bearbeiten(node),
                sichtbar: ctx.darfVerwalten,
              },
              {
                text: 'Nach oben',
                icon: <IconArrowUp size={18} />,
                onClick: () => ctx.verschieben(node, -1),
                disabled: index === 0,
                sichtbar: ctx.darfVerwalten,
              },
              {
                text: 'Nach unten',
                icon: <IconArrowDown size={18} />,
                onClick: () => ctx.verschieben(node, 1),
                disabled: index === anzahl - 1,
                sichtbar: ctx.darfVerwalten,
              },
              {
                text: 'Warenliste bearbeiten',
                icon: <IconListDetails size={18} />,
                onClick: () => ctx.waren(node),
                sichtbar: ctx.darfVerwalten && !node.archiviert,
              },
              {
                text: inventurText,
                icon: <IconClipboardCheck size={18} />,
                onClick: () => ctx.inventur(node),
                sichtbar: inventurMoeglich,
                trenner: ctx.darfVerwalten,
              },
              {
                text: node.archiviert ? 'Wiederherstellen' : 'Archivieren',
                icon: node.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
                onClick: () => ctx.archivieren(node),
                sichtbar: ctx.darfVerwalten,
                trenner: true,
              },
              {
                text: 'Löschen',
                icon: <IconTrash size={18} />,
                color: 'red',
                onClick: () => ctx.loeschen(node),
                sichtbar: ctx.darfVerwalten,
              },
            ]}
          />
        </Group>
        {tiefe === 0 && inventurMoeglich && (
          <Box px={8} pb={8}>
            <Button
              fullWidth
              hiddenFrom="sm"
              variant={inventurId ? 'filled' : 'light'}
              leftSection={<IconClipboardCheck size={18} />}
              onClick={() => ctx.inventur(node)}
            >
              {inventurText}
            </Button>
            <Button
              visibleFrom="sm"
              variant={inventurId ? 'filled' : 'light'}
              leftSection={<IconClipboardCheck size={18} />}
              onClick={() => ctx.inventur(node)}
            >
              {inventurText}
            </Button>
          </Box>
        )}
      </Paper>
      {kinder.length > 0 && (
        <Collapse expanded={!zu}>
          <Box
            ml={10}
            pl={8}
            style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
          >
            <LagerBaum eintraege={kinder} tiefe={tiefe + 1} ctx={ctx} />
          </Box>
        </Collapse>
      )}
    </Stack>
  );
}

/** Indented, collapsible list of Lagerorte (no tree library). */
export function LagerBaum({
  eintraege,
  tiefe = 0,
  ctx,
}: Readonly<{ eintraege: BaumEintrag<LagerKnoten>[]; tiefe?: number; ctx: LagerKontext }>) {
  return (
    <Stack gap="xs">
      {eintraege.map((e, i) => (
        <LagerZeile
          key={e.node.id}
          eintrag={e}
          tiefe={tiefe}
          index={i}
          anzahl={eintraege.length}
          ctx={ctx}
        />
      ))}
    </Stack>
  );
}
