import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconArchive,
  IconArchiveOff,
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconClipboardCheck,
  IconEdit,
  IconArrowsExchange,
  IconBox,
  IconListDetails,
  IconPackageExport,
  IconPackageImport,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import type { BaumEintrag } from '@c4/shared';
import { Link } from 'react-router-dom';
import { AktionsMenue } from './AktionsMenue';
import type { BestandsAnzeige } from './lagerBestand';
import type { LagerInventar } from './lagerInventar';

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
  /** Stock lines per node; null while hidden or not loaded. */
  bestand: Map<string, BestandsAnzeige[]> | null;
  /** Inventar (Ifcos, Gegenstände) per node; null while hidden or not loaded. */
  inventar: Map<string, LagerInventar> | null;
  /** Lagerort id -> id of its open Inventur. */
  offeneInventuren: Map<string, string>;
  eingeklappt: Set<string>;
  umschalten: (id: string) => void;
  unterebene: (k: LagerKnoten) => void;
  bearbeiten: (k: LagerKnoten) => void;
  verschieben: (k: LagerKnoten, richtung: -1 | 1) => void;
  waren: (k: LagerKnoten) => void;
  entnehmen: (k: LagerKnoten) => void;
  einlagern: (k: LagerKnoten) => void;
  umlagern: (k: LagerKnoten) => void;
  inventur: (k: LagerKnoten) => void;
  archivieren: (k: LagerKnoten) => void;
  loeschen: (k: LagerKnoten) => void;
}

const inventarZeile = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  overflowWrap: 'anywhere',
} as const;

/** Ifcos standing at a node and Gegenstände assigned directly to it, linked to their detail pages. */
function InventarListe({ inventar }: Readonly<{ inventar: LagerInventar }>) {
  return (
    <Stack gap={0} mt={4}>
      {inventar.ifcos.map((i) => (
        <Anchor
          key={i.id}
          component={Link}
          to={`/inventar/ifcos/${encodeURIComponent(i.id)}`}
          size="sm"
          style={inventarZeile}
        >
          <IconBox size={16} style={{ flex: 'none' }} />
          <span>
            <Text span fw={600} inherit>
              {i.name}
            </Text>
            {' · '}
            {i.stueck} {i.stueck === 1 ? 'Teil' : 'Teile'}
          </span>
        </Anchor>
      ))}
      {inventar.gegenstaende.map((g) => (
        <Anchor
          key={g.id}
          component={Link}
          to={`/inventar/gegenstaende/${encodeURIComponent(g.id)}`}
          size="sm"
          style={inventarZeile}
        >
          <span>
            <Text span fw={600} inherit>
              {g.name}
            </Text>{' '}
            {g.anzahl}×
            {g.verliehen > 0 && (
              <Text span c="grape" inherit>
                {' '}
                · {g.verliehen} verliehen
              </Text>
            )}
          </span>
        </Anchor>
      ))}
    </Stack>
  );
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
            {ctx.bestand?.get(node.id)?.map((b) => (
              <Text key={b.wareId} size="sm" lh={1.35} style={{ overflowWrap: 'anywhere' }}>
                <Text span fw={600} inherit>
                  {b.name}
                </Text>
                : {b.text}
                {b.mhd && (
                  <Text span size="xs" c="dimmed">
                    {' '}
                    · MHD {b.mhd}
                  </Text>
                )}
              </Text>
            ))}
            {ctx.inventar?.get(node.id) && <InventarListe inventar={ctx.inventar.get(node.id)!} />}
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
                text: 'Entnehmen',
                icon: <IconPackageExport size={18} />,
                onClick: () => ctx.entnehmen(node),
                sichtbar: inventurMoeglich,
                trenner: ctx.darfVerwalten,
              },
              {
                text: 'Einlagern',
                icon: <IconPackageImport size={18} />,
                onClick: () => ctx.einlagern(node),
                sichtbar: inventurMoeglich,
              },
              {
                text: 'Umlagern',
                icon: <IconArrowsExchange size={18} />,
                onClick: () => ctx.umlagern(node),
                sichtbar: inventurMoeglich,
              },
              {
                text: inventurText,
                icon: <IconClipboardCheck size={18} />,
                onClick: () => ctx.inventur(node),
                sichtbar: inventurMoeglich,
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
          <Stack gap="xs" px={8} pb={8}>
            <SimpleGrid cols={2} spacing="xs" maw={{ sm: 420 }}>
              <Button
                mih={44}
                leftSection={<IconPackageExport size={18} />}
                onClick={() => ctx.entnehmen(node)}
              >
                Entnehmen
              </Button>
              <Button
                mih={44}
                variant="light"
                leftSection={<IconPackageImport size={18} />}
                onClick={() => ctx.einlagern(node)}
              >
                Einlagern
              </Button>
            </SimpleGrid>
            <Button
              mih={44}
              w={{ base: '100%', sm: 'fit-content' }}
              variant={inventurId ? 'filled' : 'default'}
              leftSection={<IconClipboardCheck size={18} />}
              onClick={() => ctx.inventur(node)}
            >
              {inventurText}
            </Button>
          </Stack>
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
